import Database from 'better-sqlite3';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dataDir = process.env.DATA_DIR || 'data';
mkdirSync(dataDir, { recursive: true });

export const db = new Database(join(dataDir, 'site.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Numbered .sql files in migrations/, applied in order, tracked by PRAGMA
// user_version (not filenames) — which is what makes squashing possible.
//
// To squash: replace files 001..N with a single `NNN-baseline.sql` (keep the
// number of the LAST file it replaces) containing the full schema. Fresh
// installs apply the baseline directly; volumes already at ≥ N skip it by
// number; anything older fails loudly below instead of corrupting.
const dir = 'migrations';
const files = readdirSync(dir)
  .filter((f) => /^\d/.test(f) && f.endsWith('.sql'))
  .sort();
const version = () => db.pragma('user_version', { simple: true }) as number;

db.transaction(() => {
  for (const f of files) {
    const n = Number(f.match(/^\d+/)![0]);
    if (n <= version()) continue;
    if (f.includes('baseline') && version() !== 0) {
      throw new Error(
        `${f}: database is at schema version ${version()}, which predates this squashed baseline — upgrade with a pre-squash release first`
      );
    }
    db.exec(readFileSync(join(dir, f), 'utf8'));
    db.pragma(`user_version = ${n}`);
  }
})();
