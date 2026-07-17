'use client';

import { useEffect, useState } from 'react';
import { Window } from './window';
import { useWindowManager } from './window-manager';
import { usePostsUI } from './posts-ui';
import { getPost } from '../app/actions';

export type PostMeta = { slug: string; title: string; summary: string; published_at: string };
export type PostFull = { slug: string; title: string; body_html: string; published_at: string };

const WINDOW_ID = 'content-window';

// The posts window never navigates: reading a post fetches it via a server
// action and quietly rewrites the URL to /posts/<slug> so the address bar is
// shareable. Direct loads of /posts/<slug> SSR the same window pre-opened
// with the post (crawlers and link previews see full HTML).
export function PostsWindow({
  posts,
  siteTitle,
  initialPost,
  startOpen = false,
}: {
  posts: PostMeta[];
  siteTitle: string;
  initialPost?: PostFull;
  startOpen?: boolean;
}) {
  const wm = useWindowManager();
  const postsUI = usePostsUI();
  const [post, setPost] = useState<PostFull | null>(initialPost ?? null);

  const syncUrl = (p: PostFull | null, open: boolean) => {
    history.replaceState({}, '', open && p ? `/posts/${p.slug}` : '/');
    document.title = open && p ? `${p.title} — ${siteTitle}` : siteTitle;
  };

  const openList = () => {
    setPost(null);
    wm.open(WINDOW_ID);
    syncUrl(null, true);
  };
  const openPost = async (slug: string) => {
    const full = await getPost(slug);
    if (!full) return openList(); // unpublished/deleted — fall back to the list
    setPost(full);
    wm.open(WINDOW_ID);
    syncUrl(full, true);
  };

  useEffect(() => {
    postsUI.current = { openList, openPost };
    return () => {
      postsUI.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const title = post ? `${post.title} — Posts` : 'Posts';

  return (
    <Window
      id={WINDOW_ID}
      className="content-window"
      title={title}
      ariaLabel={post ? post.title : 'Posts'}
      icon="/icons/generic-text-document.png"
      startHidden={!startOpen}
      // startOpen only ever comes from a real /posts or /posts/[slug] SSR hit
      // (a shareable link) — that must win over the cookie. On the bare '/'
      // route it's always false, so a persisted "list was open" restores.
      authoritative={startOpen}
      onClose={() => syncUrl(null, false)}
    >
      <div className="window-body content-body">
        {post ? (
          <>
            <p>
              <a
                href="/posts"
                onClick={(e) => {
                  e.preventDefault();
                  openList();
                }}
              >
                ← All notes
              </a>
            </p>
            <article>
              <h1>{post.title}</h1>
              <time dateTime={post.published_at}>{post.published_at.slice(0, 10)}</time>
              <div dangerouslySetInnerHTML={{ __html: post.body_html }} />
            </article>
          </>
        ) : (
          <>
            {posts.length === 0 && <p>Nothing here yet.</p>}
            <ul className="post-list">
              {posts.map((p) => (
                <li key={p.slug}>
                  {/* real hrefs for crawlers; clicks stay in the window */}
                  <a
                    href={`/posts/${p.slug}`}
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                      e.preventDefault();
                      openPost(p.slug);
                    }}
                  >
                    {p.title}
                  </a>
                  <time dateTime={p.published_at}>{p.published_at.slice(0, 10)}</time>
                  {p.summary && <p>{p.summary}</p>}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Window>
  );
}
