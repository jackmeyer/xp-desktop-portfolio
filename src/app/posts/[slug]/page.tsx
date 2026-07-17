import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { db } from '../../../lib/db';
import { SITE_TITLE } from '../../../lib/site';
import { PostsWindow, type PostFull, type PostMeta } from '../../../components/posts-window';

const getPost = (slug: string) =>
  db
    .prepare(
      "SELECT slug, title, summary, body_html, published_at FROM posts WHERE slug = ? AND status = 'published'"
    )
    .get(slug) as (PostFull & { summary: string }) | undefined;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const post = getPost((await params).slug);
  if (!post) return {};
  return {
    title: `${post.title} — ${SITE_TITLE}`,
    description: post.summary || undefined,
    openGraph: {
      title: post.title,
      description: post.summary || undefined,
      type: 'article',
      publishedTime: post.published_at,
    },
  };
}

// SSR entry point for shared links: the desktop with the posts window open on
// this post, full HTML for crawlers and link previews
export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const post = getPost((await params).slug);
  if (!post) notFound();
  const posts = db
    .prepare(
      "SELECT slug, title, summary, published_at FROM posts WHERE status = 'published' ORDER BY published_at DESC"
    )
    .all() as PostMeta[];
  return <PostsWindow posts={posts} siteTitle={SITE_TITLE} initialPost={post} startOpen />;
}
