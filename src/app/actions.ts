'use server';

import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cookies, headers } from 'next/headers';
import MarkdownIt from 'markdown-it';
import {
  createSession,
  createUser,
  destroySession,
  getSessionUser,
  rateLimited,
  recordFailedLogin,
  verifyLogin,
  type User,
} from '../lib/auth';
import { sessionCookieOptions } from '../lib/session-cookie';
import { bioFontSize } from '../lib/site';
import { db } from '../lib/db';

// The admin has no routes: these actions are its entire server surface, called
// from the admin window's client components. Each one re-checks the session —
// actions are publicly reachable endpoints. CSRF is covered by Next's built-in
// origin check on server actions plus the SameSite=Strict cookie.
// Mutations return { error } instead of redirecting; the client shows the
// message inline and calls router.refresh() on success.

const dataDir = process.env.DATA_DIR || 'data';

async function getUser(): Promise<User | null> {
  return getSessionUser((await cookies()).get('session')?.value);
}

const NOT_SIGNED_IN = { error: 'Not signed in.' };

const saveUpload = (bytes: ArrayBuffer, name: string): string => {
  mkdirSync(join(dataDir, 'uploads'), { recursive: true });
  writeFileSync(join(dataDir, 'uploads', name), Buffer.from(bytes));
  return name;
};

// --- public reads ---

export async function getPost(slug: string) {
  return (
    (db
      .prepare(
        "SELECT slug, title, summary, body_html, published_at FROM posts WHERE slug = ? AND status = 'published'"
      )
      .get(slug) as
      | { slug: string; title: string; summary: string; body_html: string; published_at: string }
      | undefined) ?? null
  );
}

// --- session ---

export async function login(formData: FormData): Promise<{ error?: string }> {
  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  if (rateLimited(ip)) return { error: 'Too many attempts. Try again later.' };
  const user = await verifyLogin(String(formData.get('email') ?? ''), String(formData.get('password') ?? ''));
  if (!user) {
    recordFailedLogin(ip);
    return { error: 'Invalid email or password.' };
  }
  (await cookies()).set('session', createSession(user.id), sessionCookieOptions);
  return {};
}

export async function logout(): Promise<void> {
  const jar = await cookies();
  const token = jar.get('session')?.value;
  if (token) destroySession(token);
  jar.delete('session');
}

// --- admin data (one call feeds the whole window) ---

export async function getAdminData() {
  const user = await getUser();
  if (!user) return null;
  // getSessionUser slid the db expiry; slide the browser cookie to match
  const jar = await cookies();
  jar.set('session', jar.get('session')!.value, sessionCookieOptions);
  return {
    user,
    links: db
      .prepare('SELECT id, label, icon_filename, kind, url, visible FROM links ORDER BY sort_order, id')
      .all() as {
      id: number;
      label: string;
      icon_filename: string | null;
      kind: string;
      url: string;
      visible: number;
    }[],
    posts: db
      .prepare('SELECT id, title, slug, status, published_at, updated_at FROM posts ORDER BY updated_at DESC')
      .all() as { id: number; title: string; slug: string; status: string; published_at: string | null; updated_at: string }[],
    users: db.prepare('SELECT id, email, created_at FROM users ORDER BY id').all() as {
      id: number;
      email: string;
      created_at: string;
    }[],
    bio: Object.fromEntries(
      (
        db.prepare("SELECT key, value FROM settings WHERE key IN ('about', 'bio_name', 'bio_photo', 'bio_font_size')").all() as {
          key: string;
          value: string;
        }[]
      ).map((r) => [r.key, r.value])
    ) as { about?: string; bio_name?: string; bio_photo?: string; bio_font_size?: string },
  };
}

// --- desktop icons ---

export async function linkDelete(formData: FormData): Promise<{ error?: string }> {
  if (!(await getUser())) return NOT_SIGNED_IN;
  // ponytail: deleting/replacing an icon leaves its old file in uploads/ (harmless
  // orphans); sweep or delete-on-replace when a media manager exists
  db.prepare('DELETE FROM links WHERE id = ?').run(Number(formData.get('id')));
  return {};
}

export async function linkMove(formData: FormData): Promise<{ error?: string }> {
  if (!(await getUser())) return NOT_SIGNED_IN;
  const id = Number(formData.get('id'));
  const dir = formData.get('dir') === 'up' ? -1 : 1;
  const ids = (db.prepare('SELECT id FROM links ORDER BY sort_order, id').all() as { id: number }[]).map((r) => r.id);
  const i = ids.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= ids.length) return {};
  [ids[i], ids[j]] = [ids[j], ids[i]];
  // renumber the whole list: the table is tiny, and this heals legacy rows
  // that all share the default sort_order 0 (where swapping two equal values
  // would be a no-op)
  const set = db.prepare('UPDATE links SET sort_order = ? WHERE id = ?');
  db.transaction(() => ids.forEach((linkId, n) => set.run(n, linkId)))();
  return {};
}

export async function linkSetVisible(formData: FormData): Promise<{ error?: string }> {
  if (!(await getUser())) return NOT_SIGNED_IN;
  db.prepare('UPDATE links SET visible = ? WHERE id = ?').run(
    formData.get('visible') ? 1 : 0,
    Number(formData.get('id'))
  );
  return {};
}

// keep the uploader's PDF filename, reduced to the safe charset the
// /uploads route serves ([\w.-], no path separators), deduped with -2, -3…
const safePdfName = (original: string): string => {
  const base =
    original
      .replace(/\.pdf$/i, '')
      .replace(/[^\w.-]+/g, '-')
      .replace(/^[-.]+|[-.]+$/g, '')
      .slice(0, 80) || 'document';
  let name = `${base}.pdf`;
  for (let n = 2; existsSync(join(dataDir, 'uploads', name)); n++) name = `${base}-${n}.pdf`;
  return name;
};

export async function linkSave(formData: FormData): Promise<{ error?: string }> {
  if (!(await getUser())) return NOT_SIGNED_IN;
  const id = Number(formData.get('id')) || null;
  const label = String(formData.get('label') ?? '').trim();
  const url = String(formData.get('url') ?? '').trim();
  const icon = formData.get('icon');
  const pdf = formData.get('pdf');
  const hasPdf = pdf instanceof File && pdf.size > 0;

  if (!label) return { error: 'Name is required.' };
  if (url && hasPdf) return { error: 'Provide a link or a PDF, not both.' };
  if (!url && !hasPdf && !id) return { error: 'Provide a link or upload a PDF.' };
  if (url) {
    try {
      new URL(url);
    } catch {
      return { error: 'Link must be a valid URL (including https://).' };
    }
  }
  if (hasPdf) {
    if (pdf.type !== 'application/pdf') return { error: 'Document must be a .pdf file.' };
    if (pdf.size > 10_000_000) return { error: 'PDF must be under 10 MB.' };
  }

  let iconFilename: string | null = null;
  if (icon instanceof File && icon.size > 0) {
    if (icon.type !== 'image/png') return { error: 'Icon must be a .png file.' };
    if (icon.size > 1_000_000) return { error: 'Icon must be under 1 MB.' };
    iconFilename = saveUpload(await icon.arrayBuffer(), `${randomUUID()}.png`);
  }
  // no icon uploaded for a web link: fetch the site's favicon once at save time
  // (Google's resolver chases link tags/ico formats; stored locally so the
  // public desktop never calls out). Failure just means the default icon.
  // ponytail: one-shot snapshot — a favicon that changes upstream stays stale
  // until the icon is re-saved; add a refresh action if staleness ever bites
  if (!iconFilename && !id && url) {
    try {
      const res = await fetch(`https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=64`, {
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) iconFilename = saveUpload(await res.arrayBuffer(), `${randomUUID()}.png`);
    } catch {
      /* offline or blocked — icon stays null */
    }
  }

  const existing = id
    ? (db.prepare('SELECT url FROM links WHERE id = ?').get(id) as { url: string } | undefined)
    : undefined;
  const finalUrl = hasPdf
    ? `/uploads/${saveUpload(await pdf.arrayBuffer(), safePdfName(pdf.name))}`
    : url || existing?.url || '';
  // PDFs open in the in-desktop viewer; everything else is an external tab
  const kind = /\.pdf(\?|#|$)/i.test(finalUrl) ? 'window' : 'external';
  const windowType = kind === 'window' ? 'pdf' : null;
  if (id) {
    db.prepare(
      'UPDATE links SET label = ?, url = ?, kind = ?, window_type = ?, icon_filename = COALESCE(?, icon_filename) WHERE id = ?'
    ).run(label, finalUrl, kind, windowType, iconFilename, id);
  } else {
    // append at the end of the desktop order
    db.prepare(
      'INSERT INTO links (label, url, kind, window_type, icon_filename, sort_order) VALUES (?, ?, ?, ?, ?, (SELECT COALESCE(MAX(sort_order) + 1, 0) FROM links))'
    ).run(
      label,
      finalUrl,
      kind,
      windowType,
      iconFilename
    );
  }
  return {};
}

// --- posts ---

export async function postDelete(formData: FormData): Promise<{ error?: string }> {
  if (!(await getUser())) return NOT_SIGNED_IN;
  db.prepare('DELETE FROM posts WHERE id = ?').run(Number(formData.get('id')));
  return {};
}

export async function postPublish(formData: FormData): Promise<{ error?: string }> {
  if (!(await getUser())) return NOT_SIGNED_IN;
  db.prepare(
    "UPDATE posts SET status = 'published', published_at = COALESCE(published_at, datetime('now')) WHERE id = ?"
  ).run(Number(formData.get('id')));
  return {};
}

export async function postUnpublish(formData: FormData): Promise<{ error?: string }> {
  if (!(await getUser())) return NOT_SIGNED_IN;
  db.prepare("UPDATE posts SET status = 'draft' WHERE id = ?").run(Number(formData.get('id')));
  return {};
}

// html stays off (default): raw HTML in markdown is escaped, so the rendered
// output is safe without a separate sanitizer
const md = new MarkdownIt({ linkify: true });

export async function postSave(formData: FormData): Promise<{ id?: number; error?: string }> {
  if (!(await getUser())) return NOT_SIGNED_IN;
  let id = Number(formData.get('id')) || null;
  const title = String(formData.get('title') ?? '').trim();
  const summary = String(formData.get('summary') ?? '').trim();
  const bodyMd = String(formData.get('body_md') ?? '');
  const slug = (String(formData.get('slug') ?? '').trim() || title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!title) return { error: 'Title is required.' };
  if (!slug) return { error: 'Slug is required.' };

  const bodyHtml = md.render(bodyMd);
  try {
    if (id) {
      db.prepare(
        "UPDATE posts SET slug = ?, title = ?, summary = ?, body_md = ?, body_html = ?, updated_at = datetime('now') WHERE id = ?"
      ).run(slug, title, summary, bodyMd, bodyHtml, id);
    } else {
      id = Number(
        db
          .prepare('INSERT INTO posts (slug, title, summary, body_md, body_html) VALUES (?, ?, ?, ?, ?)')
          .run(slug, title, summary, bodyMd, bodyHtml).lastInsertRowid
      );
    }
  } catch (e) {
    return {
      error:
        e instanceof Error && e.message.includes('UNIQUE') ? 'That slug is already used by another post.' : 'Save failed.',
    };
  }
  return { id };
}

export async function postGetDraft(id: number) {
  if (!(await getUser())) return null;
  return (
    (db.prepare('SELECT id, slug, title, summary, body_md, body_html, status FROM posts WHERE id = ?').get(id) as
      | { id: number; slug: string; title: string; summary: string; body_md: string; body_html: string; status: string }
      | undefined) ?? null
  );
}

// --- users ---

export async function userDelete(formData: FormData): Promise<{ error?: string }> {
  // sessions cascade with the user, so a deleted account is signed out everywhere.
  // The self-check is the real guard; the hidden UI button is just courtesy.
  const user = await getUser();
  if (!user) return NOT_SIGNED_IN;
  const id = Number(formData.get('id'));
  if (id !== user.id) db.prepare('DELETE FROM users WHERE id = ?').run(id);
  return {};
}

export async function userCreate(formData: FormData): Promise<{ error?: string }> {
  if (!(await getUser())) return NOT_SIGNED_IN;
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (!/^\S+@\S+\.\S+$/.test(email)) return { error: 'Enter a valid email address.' };
  if (password.length < 8) return { error: 'Password must be at least 8 characters.' };
  try {
    await createUser(email, password);
  } catch (e) {
    return {
      error:
        e instanceof Error && e.message.includes('UNIQUE') ? 'A user with that email already exists.' : 'Could not create user.',
    };
  }
  return {};
}

// --- bio ---

export async function bioSave(formData: FormData): Promise<{ error?: string }> {
  if (!(await getUser())) return NOT_SIGNED_IN;
  const upsert = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value'
  );
  const photo = formData.get('photo');
  if (photo instanceof File && photo.size > 0) {
    const ext = { 'image/png': 'png', 'image/jpeg': 'jpg' }[photo.type];
    if (!ext) return { error: 'Photo must be a .png or .jpg file.' };
    if (photo.size > 2_000_000) return { error: 'Photo must be under 2 MB.' };
    upsert.run('bio_photo', saveUpload(await photo.arrayBuffer(), `${randomUUID()}.${ext}`));
  }
  upsert.run('bio_name', String(formData.get('bio_name') ?? '').trim());
  // absent (editor still loading) is not the same as empty — never blank the bio
  const about = formData.get('about');
  if (about !== null) upsert.run('about', String(about));
  upsert.run('bio_font_size', String(bioFontSize(String(formData.get('bio_font_size') ?? ''))));
  return {};
}
