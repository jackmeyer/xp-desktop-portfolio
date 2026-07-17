'use client';

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import { useWindowManager } from './window-manager';

type Props = {
  id: string;
  title: string;
  icon: string;
  ariaLabel?: string;
  className: string;
  style?: CSSProperties;
  startHidden?: boolean;
  /** startHidden reflects a deliberate intent (e.g. an SSR route for a
   *  shared link) that must win over a persisted-but-stale cookie state */
  authoritative?: boolean;
  /** extra work on close (URL/title restore); the window always just hides */
  onClose?: () => void;
  children: ReactNode;
};

export function Window({
  id,
  title,
  icon,
  ariaLabel,
  className,
  style,
  startHidden = false,
  authoritative,
  onClose,
  children,
}: Props) {
  const wm = useWindowManager();
  const ref = useRef<HTMLDivElement>(null);
  // local override while actively dragging, for smooth per-pixel updates
  // without a context (and cookie) write on every pointermove
  const [dragPos, setDragPos] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    wm.register(id, { title, icon }, startHidden, authoritative);
    return () => wm.unregister(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  useEffect(() => {
    wm.setMeta(id, { title, icon });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, icon]);

  const win = wm.wins.find((w) => w.id === id);
  const hidden = win ? win.hidden : startHidden;
  // dragPos wins mid-drag; otherwise the shared (and persisted) position
  const pos = dragPos ?? (win?.left !== undefined && win?.top !== undefined ? { left: win.left, top: win.top } : null);

  // drag via title bar + click-to-front; resize is native CSS `resize: both`
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    wm.raise(id);
    const target = e.target as HTMLElement;
    if (!target.closest('.title-bar') || target.closest('button, a')) return;
    const el = ref.current!;
    const rect = el.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;
    // pointer capture keeps the drag alive even over the PDF iframe
    el.setPointerCapture(e.pointerId);
    let last: { left: number; top: number } | null = null;
    const move = (ev: globalThis.PointerEvent) => {
      const left = Math.max(48 - rect.width, Math.min(ev.clientX - offsetX, innerWidth - 48));
      const top = Math.max(0, Math.min(ev.clientY - offsetY, innerHeight - 40));
      last = { left, top };
      setDragPos(last);
    };
    const up = (ev: globalThis.PointerEvent) => {
      el.releasePointerCapture(ev.pointerId);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      // commit once on drop — this is the only point a drag touches shared
      // state (and so the only point it triggers a cookie write)
      if (last) wm.setPosition(id, last.left, last.top);
      setDragPos(null);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };

  return (
    <div
      ref={ref}
      id={id}
      className={`window ${className}`}
      role="dialog"
      aria-label={ariaLabel ?? title}
      hidden={hidden}
      onPointerDown={onPointerDown}
      style={{
        ...style,
        ...(win && win.z ? { zIndex: win.z } : {}),
        // switch from centered transform to px coordinates once dragged
        ...(pos ? { left: pos.left, top: pos.top, transform: 'none' } : {}),
      }}
    >
      <div className="title-bar">
        <div className="title-bar-text">{title}</div>
        <div className="title-bar-controls">
          <button
            aria-label="Close"
            onClick={() => {
              wm.hide(id);
              onClose?.();
            }}
          />
        </div>
      </div>
      {children}
    </div>
  );
}
