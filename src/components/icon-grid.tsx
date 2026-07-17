'use client';

import { useWindowManager } from './window-manager';
import { usePostsUI } from './posts-ui';

export type DesktopLink = { id: number; label: string; kind: string; url: string; icon: string };

export function IconGrid({ links }: { links: DesktopLink[] }) {
  const wm = useWindowManager();
  const postsUI = usePostsUI();
  return (
    <div className="icons">
      {/* opens the posts window in place — the URL only changes once a post is
          being read (crawlers find posts via the hrefs inside the window) */}
      <button className="icon" onClick={() => postsUI.current?.openList()}>
        <span className="icon-img">
          <img src="/icons/generic-text-document.png" alt="" width="48" height="48" />
        </span>
        <span>Posts</span>
      </button>
      {links.map((l) =>
        l.kind === 'external' ? (
          <a key={l.id} className="icon external" href={l.url} target="_blank" rel="noopener">
            <span className="icon-img">
              <img src={l.icon} alt="" width="48" height="48" />
            </span>
            <span>{l.label}</span>
          </a>
        ) : (
          <button key={l.id} className="icon" onClick={() => wm.open(`window-${l.id}`)}>
            <span className="icon-img">
              <img src={l.icon} alt="" width="48" height="48" />
            </span>
            <span>{l.label}</span>
          </button>
        )
      )}
      {/* shown to everyone; opening it just shows the Log On window unless a
          session exists. The admin has no URL — it's all in the window. */}
      <button className="icon control-panel" onClick={() => wm.open('admin-window')}>
        <span className="icon-img">
          <img src="/icons/control-panel.png" alt="" width="48" height="48" />
        </span>
        <span>Control Panel</span>
      </button>
    </div>
  );
}
