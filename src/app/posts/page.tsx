import type { Metadata } from 'next';
import { db } from '../../lib/db';
import { SITE_TITLE } from '../../lib/site';
import { PostsWindow, type PostMeta } from '../../components/posts-window';

export const metadata: Metadata = {
  title: `Posts — ${SITE_TITLE}`,
  description: 'Posts and write-ups',
};

// SSR entry point: /posts loads the desktop with the posts window open
export default function PostsPage() {
  const posts = db
    .prepare(
      "SELECT slug, title, summary, published_at FROM posts WHERE status = 'published' ORDER BY published_at DESC"
    )
    .all() as PostMeta[];
  return <PostsWindow posts={posts} siteTitle={SITE_TITLE} startOpen />;
}
