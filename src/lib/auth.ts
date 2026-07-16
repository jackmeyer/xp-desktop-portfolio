import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import { db } from './db';

export type User = { id: number; email: string };

// First-boot bootstrap: seed the admin from env when the users table is empty.
// The variables can be removed after first boot; plaintext is never persisted.
if (!db.prepare('SELECT 1 FROM users LIMIT 1').get()) {
  // process.env in the container (env_file); import.meta.env under astro dev (.env)
  const email = process.env.ADMIN_EMAIL ?? import.meta.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD ?? import.meta.env.ADMIN_PASSWORD;
  if (email && password) await createUser(email, password);
}

export async function createUser(email: string, password: string): Promise<void> {
  db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(
    email,
    await argon2.hash(password, { type: argon2.argon2id })
  );
}

// ponytail: in-memory per-IP rate limit, resets on restart; move to the
// sessions db if this ever runs more than one instance.
const attempts = new Map<string, { count: number; resetAt: number }>();

export function rateLimited(ip: string): boolean {
  const now = Date.now();
  const a = attempts.get(ip);
  if (!a || now > a.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + 15 * 60_000 });
    return false;
  }
  a.count += 1;
  return a.count > 5;
}

export async function verifyLogin(email: string, password: string): Promise<User | null> {
  const row = db
    .prepare('SELECT id, email, password_hash FROM users WHERE email = ?')
    .get(email) as { id: number; email: string; password_hash: string } | undefined;
  if (!row || !(await argon2.verify(row.password_hash, password))) return null;
  return { id: row.id, email: row.email };
}

export function createSession(userId: number): string {
  const token = randomBytes(32).toString('base64url');
  db.prepare(
    "INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, datetime('now', '+30 days'))"
  ).run(token, userId);
  return token;
}

export function getSessionUser(token: string | undefined): User | null {
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT u.id, u.email FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.id = ? AND s.expires_at > datetime('now')`
    )
    .get(token) as User | undefined;
  if (!row) return null;
  // 30-day idle expiry: slide the window on every authenticated request
  db.prepare("UPDATE sessions SET expires_at = datetime('now', '+30 days') WHERE id = ?").run(token);
  return row;
}

export function destroySession(token: string): void {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(token);
}
