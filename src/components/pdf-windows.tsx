'use client';

import { useEffect, useState } from 'react';
import { Window } from './window';
import { useWindowManager } from './window-manager';
import type { DesktopLink } from './icon-grid';

export function PdfWindows({ links }: { links: DesktopLink[] }) {
  return (
    <>
      {links.map((l) => (
        <PdfWindow key={l.id} link={l} />
      ))}
    </>
  );
}

function PdfWindow({ link }: { link: DesktopLink }) {
  const id = `window-${link.id}`;
  const wm = useWindowManager();
  const win = wm.wins.find((w) => w.id === id);
  const [loaded, setLoaded] = useState(false);

  // load the PDF on first open only
  useEffect(() => {
    if (win && !win.hidden) setLoaded(true);
  }, [win, win?.hidden]);

  return (
    <Window id={id} className="pdf-window" title={link.label} icon={link.icon} startHidden>
      <iframe src={loaded ? link.url : undefined} title={link.label}></iframe>
    </Window>
  );
}
