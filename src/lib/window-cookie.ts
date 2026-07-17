'use client';

// Window layout (open/closed, position, z-order, focus) persists in a plain,
// client-written cookie — never read during SSR. The layout is served with a
// shared/public cache header, so letting a per-visitor cookie change the
// rendered HTML would let one visitor's window layout leak into another's
// cached response. Restoring client-side only avoids that entirely, at the
// cost of one render frame at the default (closed) state before the effect
// in WindowManagerProvider corrects it.
export type PersistedWindow = { hidden: boolean; minimized: boolean; z: number; left?: number; top?: number };
export type PersistedWM = { windows: Record<string, PersistedWindow>; activeId: string | null };

const COOKIE_NAME = 'wm';

// unsaved editor drafts are never persisted — restoring "open but empty"
// would be worse than just starting closed
const NEVER_PERSISTED = new Set(['editor-window']);

export function readPersistedWM(): PersistedWM | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]*)`));
  if (!match) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(match[1]));
    if (parsed && typeof parsed === 'object' && parsed.windows) return parsed as PersistedWM;
  } catch {
    /* malformed/foreign cookie value under this name — ignore */
  }
  return null;
}

export function writePersistedWM(state: PersistedWM): void {
  const windows: Record<string, PersistedWindow> = {};
  for (const [id, w] of Object.entries(state.windows)) {
    if (!NEVER_PERSISTED.has(id)) windows[id] = w;
  }
  const value = encodeURIComponent(JSON.stringify({ windows, activeId: state.activeId }));
  // no Max-Age: a browser-session cookie. Survives a closed-and-reopened tab
  // (the case this exists for) and ordinary refreshes; clears when the
  // browser itself quits — there's no way to tell a "hard" refresh apart
  // from a tab reopen, so both restore the same way.
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${COOKIE_NAME}=${value}; Path=/; SameSite=Lax${secure}`;
}
