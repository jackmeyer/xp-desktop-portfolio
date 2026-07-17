import 'xp.css';
import '../styles/desktop.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import MarkdownIt from 'markdown-it';
import { db } from '../lib/db';
import { SITE_TITLE } from '../lib/site';
import { WindowManagerProvider } from '../components/window-manager';
import { PostsUIProvider } from '../components/posts-ui';
import { IconGrid, type DesktopLink } from '../components/icon-grid';
import { SelectionBox } from '../components/selection-box';
import { PdfWindows } from '../components/pdf-windows';
import { AdminArea } from '../components/admin-area';
import { Taskbar } from '../components/taskbar';
import { StartMenu } from '../components/start-menu';

// every page reads the live db; nothing may freeze at build time
export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: SITE_TITLE };

// html stays off (default): raw HTML in the bio markdown is escaped
const md = new MarkdownIt({ linkify: true });

type Link = { id: number; label: string; icon_filename: string | null; kind: string; url: string };
const iconSrc = (l: Link) =>
  l.icon_filename
    ? `/uploads/${l.icon_filename}`
    : l.kind === 'window'
      ? '/icons/generic-text-document.png' // uploaded documents
      : '/favicon.svg';

export default function RootLayout({ children }: { children: ReactNode }) {
  const links = (
    db
      .prepare('SELECT id, label, icon_filename, kind, url FROM links WHERE visible = 1 ORDER BY sort_order, id')
      .all() as Link[]
  ).map((l): DesktopLink => ({ id: l.id, label: l.label, kind: l.kind, url: l.url, icon: iconSrc(l) }));

  // start-menu bio; personal text/photo live in the settings table, never in code
  const settings = Object.fromEntries(
    (
      db.prepare("SELECT key, value FROM settings WHERE key IN ('about', 'bio_name', 'bio_photo')").all() as {
        key: string;
        value: string;
      }[]
    ).map((r) => [r.key, r.value])
  );

  return (
    <html lang="en">
      <body>
        <WindowManagerProvider>
          <PostsUIProvider>
            <main className="desktop">
              <SelectionBox />
              <IconGrid links={links} />
              <PdfWindows links={links.filter((l) => l.kind === 'window')} />
              <AdminArea siteTitle={SITE_TITLE} />
              {children}
            </main>
            <Taskbar />
            <StartMenu
              name={settings.bio_name || SITE_TITLE}
              photo={settings.bio_photo ? `/uploads/${settings.bio_photo}` : '/favicon.svg'}
              html={md.render(settings.about ?? '')}
            />
          </PostsUIProvider>
        </WindowManagerProvider>
      </body>
    </html>
  );
}
