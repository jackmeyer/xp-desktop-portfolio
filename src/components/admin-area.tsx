'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { BIO_FONT_SIZE_MAX, BIO_FONT_SIZE_MIN, bioFontSize } from '../lib/site';
import { Window } from './window';
import { useWindowManager } from './window-manager';
import { AdminTabs } from './admin-tabs';
import { ConfirmSubmit } from './confirm-submit';
import {
  bioSave,
  getAdminData,
  linkDelete,
  linkMove,
  linkSave,
  linkSetVisible,
  login,
  logout,
  postDelete,
  postGetDraft,
  postPublish,
  postSave,
  postUnpublish,
  userCreate,
  userDelete,
} from '../app/actions';

type AdminData = NonNullable<Awaited<ReturnType<typeof getAdminData>>>;
type Draft = NonNullable<Awaited<ReturnType<typeof postGetDraft>>>;
type NewDraft = Partial<Draft>;

// TipTap is ~200 KB and only signed-in admins ever see it; keep it out of the
// bundle every desktop visitor downloads (AdminArea lives in the root layout)
const RichTextEditor = dynamic(() => import('./rich-text-editor').then((m) => m.RichTextEditor), { ssr: false });

const ADMIN_ID = 'admin-window';
const EDITOR_ID = 'editor-window';

// The whole admin lives in these windows — there are no /admin routes. Data
// arrives via getAdminData() when the window first opens (or after login);
// the server re-checks the session inside every action.
export function AdminArea({ siteTitle }: { siteTitle: string }) {
  const wm = useWindowManager();
  const router = useRouter();
  const [data, setData] = useState<AdminData | null>(null);
  const [checked, setChecked] = useState(false);
  const [editor, setEditor] = useState<NewDraft | null>(null);
  // lives here, not in EditorWindow: saving a new post changes its key (id
  // arrives), and the remount must not eat the "Saved." confirmation
  const [editorSaved, setEditorSaved] = useState(false);
  const [loginError, setLoginError] = useState('');

  const adminWin = wm.wins.find((w) => w.id === ADMIN_ID);
  const visible = !!adminWin && !adminWin.hidden;

  const refresh = async () => {
    setData(await getAdminData());
    setChecked(true);
  };
  useEffect(() => {
    if (visible && !checked) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, checked]);

  // after a successful mutation: reload admin data, and re-render the server
  // bits (desktop icons, start-menu bio, posts list) without touching client
  // state — router.refresh() preserves open windows and positions
  const mutated = async () => {
    await refresh();
    router.refresh();
  };

  // a mutation failing with a dead session flips the window back to Log On
  const guard = <T extends { error?: string }>(r: T): T => {
    if (r.error === 'Not signed in.') setData(null);
    return r;
  };

  // One Window instance for the whole admin lifetime — logged-out and
  // logged-in are two different *contents*, not two components. Swapping
  // components here (as this used to) unmounts/remounts the id="admin-window"
  // Window itself: its unmount cleanup always marks the window hidden, and
  // the persisted-state restore that a remount is supposed to respect then
  // makes that hidden flag stick — the window silently vanishes right after
  // login, forever after (surfaced by the cookie feature, but the swap
  // itself was already the wrong structure).
  return (
    <>
      <Window
        id={ADMIN_ID}
        className="admin-window"
        title={data ? 'Administrator' : `Log On to ${siteTitle}`}
        ariaLabel={data ? 'Administrator' : 'Log On'}
        icon="/icons/control-panel.png"
        startHidden
        style={data ? { width: 'min(1100px, 95vw)' } : { width: 'min(320px, 90vw)' }}
      >
        {!data ? (
          <div className="window-body">
            {!checked ? (
              <p>Loading…</p>
            ) : (
              <form
                action={async (fd) => {
                  const r = await login(fd);
                  if (r.error) setLoginError(r.error);
                  else {
                    setLoginError('');
                    await refresh();
                    router.refresh();
                  }
                }}
              >
                <div className="field-row-stacked">
                  <label htmlFor="email">Email</label>
                  <input id="email" name="email" type="email" required autoComplete="username" />
                </div>
                <div className="field-row-stacked">
                  <label htmlFor="password">Password</label>
                  <input id="password" name="password" type="password" required autoComplete="current-password" />
                </div>
                {loginError && <p role="alert">{loginError}</p>}
                <section className="field-row" style={{ justifyContent: 'flex-end' }}>
                  <button type="submit">OK</button>
                </section>
              </form>
            )}
          </div>
        ) : (
          <div className="window-body" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
            <AdminTabs
              initial="tab-icons"
              panels={{
                'tab-icons': (
                  <IconsPanel
                    links={data.links}
                    onMutated={mutated}
                    guard={guard}
                  />
                ),
                'tab-posts': (
                  <PostsPanel
                    posts={data.posts}
                    onMutated={mutated}
                    guard={guard}
                    onEdit={async (id) => {
                      const draft = id ? await postGetDraft(id) : {};
                      if (id && !draft) return;
                      setEditor(draft ?? {});
                      setEditorSaved(false);
                      wm.open(EDITOR_ID);
                    }}
                  />
                ),
                'tab-users': <UsersPanel users={data.users} me={data.user.id} onMutated={mutated} guard={guard} />,
                'tab-bio': <BioPanel bio={data.bio} onMutated={mutated} guard={guard} />,
              }}
            />
            <div className="field-row" style={{ justifyContent: 'space-between', marginTop: 'auto', paddingTop: 12 }}>
              <span>Signed in as {data.user.email}</span>
              <form
                action={async () => {
                  await logout();
                  setData(null);
                  setEditor(null); // drop any loaded draft with the session
                  router.refresh();
                }}
              >
                <button type="submit">Log Off</button>
              </form>
            </div>
          </div>
        )}
      </Window>

      {editor && (
        <EditorWindow
          key={editor.id ?? 'new'}
          draft={editor}
          saved={editorSaved}
          guard={guard}
          onSaved={async (id) => {
            setEditorSaved(true);
            setEditor((await postGetDraft(id)) ?? null);
            await mutated();
          }}
        />
      )}
    </>
  );
}

type Guard = <T extends { error?: string }>(r: T) => T;

function IconsPanel({
  links,
  onMutated,
  guard,
}: {
  links: AdminData['links'];
  onMutated: () => Promise<void>;
  guard: Guard;
}) {
  const [editing, setEditing] = useState<AdminData['links'][number] | null>(null);
  const [error, setError] = useState('');
  return (
    <>
      {links.length === 0 && <p>No desktop icons yet.</p>}
      {links.length > 0 && (
        <table style={{ width: '100%', marginBottom: 12 }}>
          <thead>
            <tr>
              <th></th>
              <th></th>
              <th style={{ textAlign: 'left' }}>Name</th>
              <th style={{ textAlign: 'left' }}>Link</th>
              <th style={{ textAlign: 'left' }}>Visible</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {links.map((l, i) => (
              <tr key={l.id}>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <form
                    action={async (fd) => {
                      if (!guard(await linkMove(fd)).error) await onMutated();
                    }}
                    style={{ display: 'inline' }}
                  >
                    <input type="hidden" name="id" value={l.id} />
                    <button name="dir" value="up" aria-label="Move up" disabled={i === 0}>
                      ▲
                    </button>
                    <button name="dir" value="down" aria-label="Move down" disabled={i === links.length - 1}>
                      ▼
                    </button>
                  </form>
                </td>
                <td>
                  <img
                    src={l.icon_filename ? `/uploads/${l.icon_filename}` : l.kind === 'window' ? '/icons/generic-text-document.png' : '/favicon.svg'}
                    alt=""
                    width="24"
                    height="24"
                  />
                </td>
                <td>{l.label}</td>
                <td style={{ wordBreak: 'break-all' }}>
                  {l.url} {l.kind === 'window' && <em>(PDF viewer)</em>}
                </td>
                <td>
                  <form
                    className="visible-toggle"
                    action={async (fd) => {
                      if (!guard(await linkSetVisible(fd)).error) await onMutated();
                    }}
                  >
                    <input type="hidden" name="id" value={l.id} />
                    {/* xp.css renders the box via the label; submit on toggle */}
                    <input
                      type="checkbox"
                      id={`visible-${l.id}`}
                      name="visible"
                      defaultChecked={!!l.visible}
                      onChange={(e) => e.currentTarget.form!.requestSubmit()}
                    />
                    <label htmlFor={`visible-${l.id}`} aria-label="Visible"></label>
                  </form>
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button onClick={() => setEditing(l)}>Edit</button>
                  <form
                    action={async (fd) => {
                      if (!guard(await linkDelete(fd)).error) await onMutated();
                    }}
                    style={{ display: 'inline' }}
                  >
                    <input type="hidden" name="id" value={l.id} />
                    <ConfirmSubmit message="Delete this icon?">Delete</ConfirmSubmit>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <fieldset>
        <legend>{editing ? `Edit “${editing.label}”` : 'New icon'}</legend>
        <form
          key={editing?.id ?? 'new'}
          action={async (fd) => {
            const r = guard(await linkSave(fd));
            setError(r.error ?? '');
            if (!r.error) {
              setEditing(null);
              await onMutated();
            }
          }}
        >
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <div className="field-row-stacked">
            <label htmlFor="label">Name</label>
            <input id="label" name="label" required defaultValue={editing?.label ?? ''} />
          </div>
          <div className="field-row-stacked">
            <label htmlFor="url">Link (web address, or a .pdf URL for the built-in viewer)</label>
            {/* uploaded PDFs store a relative /uploads path; leave the field empty so
                browser url-validation doesn't block saving other edits */}
            <input id="url" name="url" type="url" defaultValue={editing?.url.startsWith('/') ? '' : (editing?.url ?? '')} />
            {editing?.url.startsWith('/') && <small>Currently: uploaded PDF ({editing.url})</small>}
          </div>
          <div className="field-row-stacked">
            <label htmlFor="pdf">…or upload a PDF (opens in the built-in viewer)</label>
            <input id="pdf" name="pdf" type="file" accept="application/pdf" />
          </div>
          <div className="field-row-stacked">
            <label htmlFor="icon">
              Icon (.png, optional — the site&apos;s favicon is used for links{editing ? '; leave empty to keep current' : ''})
            </label>
            <input id="icon" name="icon" type="file" accept="image/png" />
          </div>
          {error && <p role="alert">{error}</p>}
          <div className="field-row" style={{ justifyContent: 'flex-end' }}>
            {editing && (
              <button type="button" onClick={() => setEditing(null)}>
                Cancel
              </button>
            )}
            <button type="submit">{editing ? 'Save' : 'Create'}</button>
          </div>
        </form>
      </fieldset>
    </>
  );
}

function PostsPanel({
  posts,
  onMutated,
  guard,
  onEdit,
}: {
  posts: AdminData['posts'];
  onMutated: () => Promise<void>;
  guard: Guard;
  onEdit: (id: number | null) => Promise<void>;
}) {
  return (
    <>
      <div style={{ marginBottom: 12 }}>
        <button onClick={() => onEdit(null)}>New post</button>
      </div>
      {posts.length === 0 && <p>No posts yet.</p>}
      {posts.length > 0 && (
        <table style={{ width: '100%' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Title</th>
              <th style={{ textAlign: 'left' }}>Slug</th>
              <th style={{ textAlign: 'left' }}>Status</th>
              <th style={{ textAlign: 'left' }}>Updated</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {posts.map((p) => (
              <tr key={p.id}>
                <td>{p.title}</td>
                <td>/posts/{p.slug}</td>
                <td>
                  {p.status}
                  {p.status === 'published' && p.published_at ? ` (${p.published_at.slice(0, 10)})` : ''}
                </td>
                <td>{p.updated_at.slice(0, 16)}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button onClick={() => onEdit(p.id)}>Edit</button>
                  <form
                    action={async (fd) => {
                      const act = p.status === 'published' ? postUnpublish : postPublish;
                      if (!guard(await act(fd)).error) await onMutated();
                    }}
                    style={{ display: 'inline' }}
                  >
                    <input type="hidden" name="id" value={p.id} />
                    <button type="submit">{p.status === 'published' ? 'Unpublish' : 'Publish'}</button>
                  </form>
                  <form
                    action={async (fd) => {
                      if (!guard(await postDelete(fd)).error) await onMutated();
                    }}
                    style={{ display: 'inline' }}
                  >
                    <input type="hidden" name="id" value={p.id} />
                    <ConfirmSubmit message="Delete this post permanently?">Delete</ConfirmSubmit>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function UsersPanel({
  users,
  me,
  onMutated,
  guard,
}: {
  users: AdminData['users'];
  me: number;
  onMutated: () => Promise<void>;
  guard: Guard;
}) {
  const [error, setError] = useState('');
  return (
    <>
      <table style={{ width: '100%', marginBottom: 12 }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>Email</th>
            <th style={{ textAlign: 'left' }}>Created</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>
                {u.email}
                {u.id === me && ' (you)'}
              </td>
              <td>{u.created_at.slice(0, 10)}</td>
              <td style={{ whiteSpace: 'nowrap' }}>
                {u.id !== me && (
                  <form
                    action={async (fd) => {
                      if (!guard(await userDelete(fd)).error) await onMutated();
                    }}
                    style={{ display: 'inline' }}
                  >
                    <input type="hidden" name="id" value={u.id} />
                    <ConfirmSubmit message="Delete this user? They will be signed out everywhere.">Delete</ConfirmSubmit>
                  </form>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <fieldset>
        <legend>New user</legend>
        <form
          action={async (fd) => {
            const r = guard(await userCreate(fd));
            setError(r.error ?? '');
            if (!r.error) await onMutated();
          }}
        >
          <div className="field-row-stacked">
            <label htmlFor="user-email">Email</label>
            <input id="user-email" name="email" type="email" required />
          </div>
          <div className="field-row-stacked">
            <label htmlFor="user-password">Password (at least 8 characters)</label>
            <input id="user-password" name="password" type="password" required minLength={8} autoComplete="new-password" />
          </div>
          {error && <p role="alert">{error}</p>}
          <div className="field-row" style={{ justifyContent: 'flex-end' }}>
            <button type="submit">Create</button>
          </div>
        </form>
      </fieldset>
    </>
  );
}

function BioPanel({
  bio,
  onMutated,
  guard,
}: {
  bio: AdminData['bio'];
  onMutated: () => Promise<void>;
  guard: Guard;
}) {
  const [error, setError] = useState('');
  const [fontSize, setFontSize] = useState(bioFontSize(bio.bio_font_size));
  return (
    <>
      <p>Shown in the Start menu on the desktop.</p>
      <form
        action={async (fd) => {
          const r = guard(await bioSave(fd));
          setError(r.error ?? '');
          if (!r.error) await onMutated();
        }}
      >
        <div className="field-row-stacked">
          <label htmlFor="bio-name">Name</label>
          <input id="bio-name" name="bio_name" defaultValue={bio.bio_name ?? ''} />
        </div>
        <div className="field-row-stacked">
          <label htmlFor="bio-photo">Photo (.png or .jpg{bio.bio_photo ? '; leave empty to keep current' : ''})</label>
          {bio.bio_photo && (
            <img src={`/uploads/${bio.bio_photo}`} alt="Current photo" width="48" height="48" style={{ objectFit: 'cover' }} />
          )}
          <input id="bio-photo" name="photo" type="file" accept="image/png,image/jpeg" />
        </div>
        <div className="field-row">
          <label htmlFor="bio-font-size">Text size</label>
          <input
            id="bio-font-size"
            name="bio_font_size"
            type="range"
            min={BIO_FONT_SIZE_MIN}
            max={BIO_FONT_SIZE_MAX}
            value={fontSize}
            onChange={(e) => setFontSize(Number(e.target.value))}
          />
          <span>{fontSize}px</span>
        </div>
        <div className="field-row-stacked">
          <label>Bio</label>
          {/* the writing surface is the preview: same text size the Start menu
              will use, so what you type is what the menu shows */}
          <RichTextEditor
            name="about"
            ariaLabel="Bio"
            defaultValue={bio.about ?? ''}
            contentStyle={{ fontSize, height: 300 }}
          />
        </div>
        {error && <p role="alert">{error}</p>}
        <div className="field-row" style={{ justifyContent: 'flex-end' }}>
          <button type="submit">Save</button>
        </div>
      </form>
    </>
  );
}

function EditorWindow({
  draft,
  saved,
  guard,
  onSaved,
}: {
  draft: NewDraft;
  saved: boolean;
  guard: Guard;
  onSaved: (id: number) => Promise<void>;
}) {
  const [error, setError] = useState('');
  return (
    <Window
      id={EDITOR_ID}
      className="admin-window editor-window"
      title={`${draft.title || 'Untitled'}.html — Notepad`}
      ariaLabel="Post editor"
      icon="/icons/generic-text-document.png"
      // this window only exists while a draft is loaded, so mounting *is* the
      // intent to open it: neither the cookie nor a stale entry gets a vote
      authoritative
      style={{ width: 'min(900px, 95vw)' }}
    >
      <div className="window-body" style={{ overflow: 'auto' }}>
        {saved && <p role="status">Saved.</p>}
        <form
          action={async (fd) => {
            const r = guard(await postSave(fd));
            setError(r.error ?? '');
            if (!r.error && r.id) await onSaved(r.id);
          }}
        >
          {draft.id && <input type="hidden" name="id" value={draft.id} />}
          <div className="field-row-stacked">
            <label htmlFor="title">Title</label>
            <input id="title" name="title" required defaultValue={draft.title ?? ''} />
          </div>
          <div className="field-row-stacked">
            <label htmlFor="slug">Slug (leave empty to derive from title)</label>
            <input id="slug" name="slug" defaultValue={draft.slug ?? ''} />
          </div>
          <div className="field-row-stacked">
            <label htmlFor="summary">Summary</label>
            <input id="summary" name="summary" defaultValue={draft.summary ?? ''} />
          </div>
          <div className="field-row-stacked rte-fill">
            <label>Body</label>
            <RichTextEditor name="body_html" ariaLabel="Post body" defaultValue={draft.body_html ?? ''} />
          </div>
          {error && <p role="alert">{error}</p>}
          <div className="field-row" style={{ justifyContent: 'space-between' }}>
            <span>{draft.id ? `Status: ${draft.status}` : 'New draft'}</span>
            <button type="submit">Save</button>
          </div>
        </form>

      </div>
    </Window>
  );
}
