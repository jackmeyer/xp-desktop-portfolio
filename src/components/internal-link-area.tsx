'use client';

import type { CSSProperties, MouseEvent } from 'react';
import { usePostsUI } from './posts-ui';

// Rendered-markdown container (post bodies, start-menu bio): /posts links
// open in the posts window instead of navigating, so open windows survive.
// Crawlers still see plain <a>s.
export function InternalLinkArea({
  html,
  className,
  style,
}: {
  html: string;
  className?: string;
  style?: CSSProperties;
}) {
  const postsUI = usePostsUI();
  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // keep open-in-new-tab
    const a = (e.target as HTMLElement).closest('a');
    if (!a || a.target || a.origin !== location.origin || !a.pathname.startsWith('/posts') || !postsUI.current) return;
    e.preventDefault();
    const slug = a.pathname.replace(/^\/posts\/?/, '');
    if (slug) postsUI.current.openPost(slug);
    else postsUI.current.openList();
  };
  return <div className={className} style={style} onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />;
}
