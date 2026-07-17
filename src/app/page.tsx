import { db } from '../lib/db';
import { SITE_TITLE } from '../lib/site';
import { PostsWindow, type PostMeta } from '../components/posts-window';

// the desktop: icons, taskbar, and start menu come from the layout; the posts
// window mounts here (closed) so it can open without any navigation
export default function Home() {
  const posts = db
    .prepare(
      "SELECT slug, title, summary, published_at FROM posts WHERE status = 'published' ORDER BY published_at DESC"
    )
    .all() as PostMeta[];
  return <PostsWindow posts={posts} siteTitle={SITE_TITLE} />;
}
