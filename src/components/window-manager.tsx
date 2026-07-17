'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { readPersistedWM, writePersistedWM } from '../lib/window-cookie';

export type WinMeta = { title: string; icon: string };
type Win = WinMeta & { id: string; hidden: boolean; minimized: boolean; z: number; left?: number; top?: number };

type WindowManager = {
  wins: Win[];
  activeId: string | null;
  register: (id: string, meta: WinMeta, defaultHidden: boolean, authoritative?: boolean) => void;
  unregister: (id: string) => void;
  setMeta: (id: string, meta: WinMeta) => void;
  setPosition: (id: string, left: number, top: number) => void;
  open: (id: string) => void;
  hide: (id: string) => void;
  raise: (id: string) => void;
  taskbarClick: (id: string) => void;
};

const Ctx = createContext<WindowManager | null>(null);
export const useWindowManager = () => useContext(Ctx)!;

// XP taskbar semantics, ported from the old vanilla script: every open window
// gets a button; click focuses, clicking the focused one minimizes, close
// hides the button. "Minimized" is hidden+minimized (button stays).
//
// Layout (open/closed, position, z-order, focus) also persists to a cookie
// (see window-cookie.ts) so a closed-and-reopened tab comes back the way it
// was left. Restored only here on the client, never during SSR.
export function WindowManagerProvider({ children }: { children: ReactNode }) {
  const [wins, setWins] = useState<Win[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const zRef = useRef(10);
  // read once, before any window has registered; consumed incrementally as
  // each Window component's register() call claims its own saved entry
  const persisted = useRef(typeof document !== 'undefined' ? readPersistedWM() : null);

  const register = useCallback((id: string, meta: WinMeta, defaultHidden: boolean, authoritative = false) => {
    setWins((ws) => {
      const existing = ws.find((x) => x.id === id);
      // an entry may already exist from a previous route: revive it in place
      // so its taskbar-strip position and restored state are kept
      if (existing) return ws.map((x) => (x.id === id ? { ...x, ...meta } : x));
      const saved = persisted.current?.windows[id];
      // `authoritative` means the caller's defaultHidden reflects a specific,
      // deliberate intent (e.g. an SSR route for a shared /posts/<slug> link)
      // that must win over a stale cookie from a previous session
      const hidden = saved && !authoritative ? saved.hidden : defaultHidden;
      const z = saved?.z ?? (hidden ? 0 : ++zRef.current);
      zRef.current = Math.max(zRef.current, z);
      return [...ws, { id, ...meta, hidden, minimized: saved?.minimized ?? false, z, left: saved?.left, top: saved?.top }];
    });
  }, []);

  // apply the persisted focus once its target window has registered and is
  // visible; this can't race a real user click — no UI is interactive before
  // this initial registration pass completes
  useEffect(() => {
    const savedActive = persisted.current?.activeId;
    if (savedActive && wins.some((w) => w.id === savedActive && !w.hidden)) {
      setActiveId(savedActive);
      persisted.current = null; // one-shot: don't refight the user's clicks afterward
    }
  }, [wins]);

  useEffect(() => {
    writePersistedWM({
      windows: Object.fromEntries(
        wins.map((w) => [w.id, { hidden: w.hidden, minimized: w.minimized, z: w.z, left: w.left, top: w.top }])
      ),
      activeId,
    });
  }, [wins, activeId]);

  const unregister = useCallback((id: string) => {
    // keep the entry (as closed): taskbar order and drag position survive
    // client-side navigation away and back
    setWins((ws) => ws.map((w) => (w.id === id ? { ...w, hidden: true, minimized: false } : w)));
    setActiveId((a) => (a === id ? null : a));
  }, []);

  const setMeta = useCallback((id: string, meta: WinMeta) => {
    setWins((ws) => ws.map((w) => (w.id === id ? { ...w, ...meta } : w)));
  }, []);

  const setPosition = useCallback((id: string, left: number, top: number) => {
    setWins((ws) => ws.map((w) => (w.id === id ? { ...w, left, top } : w)));
  }, []);

  const raise = useCallback((id: string) => {
    setWins((ws) => ws.map((w) => (w.id === id ? { ...w, z: ++zRef.current } : w)));
    setActiveId(id);
  }, []);

  const open = useCallback((id: string) => {
    setWins((ws) => {
      const w = ws.find((x) => x.id === id);
      if (!w) return ws;
      const opened = { ...w, hidden: false, minimized: false, z: ++zRef.current };
      // XP appends freshly opened windows to the strip's right end; a
      // minimize-restore keeps its place
      return w.hidden && !w.minimized
        ? [...ws.filter((x) => x.id !== id), opened]
        : ws.map((x) => (x.id === id ? opened : x));
    });
    setActiveId(id);
  }, []);

  const hide = useCallback((id: string) => {
    // a manual close (the only caller of hide()) drops the dragged position:
    // the next open — reopening this window, or a brand-new one that never
    // had a position — falls back to the stylesheet's centered default.
    // Minimizing (below) is a different transition and keeps its position.
    setWins((ws) =>
      ws.map((w) => (w.id === id ? { ...w, hidden: true, minimized: false, left: undefined, top: undefined } : w))
    );
    setActiveId((a) => (a === id ? null : a));
  }, []);

  const taskbarClick = (id: string) => {
    const w = wins.find((x) => x.id === id);
    if (!w) return;
    if (w.hidden) {
      // restore in place (never reorders the strip)
      setWins((ws) => ws.map((x) => (x.id === id ? { ...x, hidden: false, minimized: false, z: ++zRef.current } : x)));
      setActiveId(id);
    } else if (activeId === id) {
      setWins((ws) => ws.map((x) => (x.id === id ? { ...x, hidden: true, minimized: true } : x)));
      setActiveId(null);
    } else {
      raise(id);
    }
  };

  return (
    <Ctx.Provider value={{ wins, activeId, register, unregister, setMeta, setPosition, open, hide, raise, taskbarClick }}>
      {children}
    </Ctx.Provider>
  );
}
