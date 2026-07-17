'use client';

import { useEffect, useState } from 'react';

type Rect = { left: number; top: number; width: number; height: number };

// XP-style click-and-drag marquee on the desktop background; icons inside the
// box get a .selected class. Selection is cosmetic nostalgia — nothing acts on it.
export function SelectionBox() {
  const [rect, setRect] = useState<Rect | null>(null);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      // any plain click clears the previous selection, like XP
      document.querySelectorAll('.icons .selected').forEach((el) => el.classList.remove('selected'));
      // only start a marquee from empty desktop, not from icons or windows
      if (!(e.target as Element).matches('.desktop, .icons')) return;
      const start = { x: e.clientX, y: e.clientY };
      const onMove = (ev: PointerEvent) => {
        const r = {
          left: Math.min(start.x, ev.clientX),
          top: Math.min(start.y, ev.clientY),
          width: Math.abs(ev.clientX - start.x),
          height: Math.abs(ev.clientY - start.y),
        };
        setRect(r);
        for (const icon of document.querySelectorAll('.icons .icon')) {
          const b = icon.getBoundingClientRect();
          icon.classList.toggle(
            'selected',
            b.left < r.left + r.width && b.right > r.left && b.top < r.top + r.height && b.bottom > r.top
          );
        }
      };
      const onUp = () => {
        setRect(null);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, []);

  return rect ? <div className="selection-box" style={rect} /> : null;
}
