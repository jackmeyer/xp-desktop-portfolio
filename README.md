# xp-desktop-portfolio

Your personal site, styled as a Windows XP desktop. 🖥️

Visitors land on a desktop with icons, draggable windows, and a taskbar — like
a remote session into your machine. Desktop icons link out to your profiles,
open your resume in a built-in PDF viewer, or open your blog in an XP-style
window. You manage all of it from a built-in admin page: no rebuilds, no
redeploys, no editing code to publish a post.

**Everything personal lives in a database, not in this repository.** Clone it,
run it, and you get a blank desktop that's yours to fill.

## Features

- 🪟 Windows XP look and feel ([XP.css](https://github.com/botoxparty/XP.css)) with draggable, resizable windows
- 🔗 Desktop icons managed from the admin — external links (with favicon auto-fetch) or PDFs in a built-in viewer
- 📝 A Markdown blog ("Posts") with drafts, publishing, and clean URLs that update without page reloads
- 🔍 Every page is real server-rendered HTML — search engines and link previews just work
- 🔒 Simple, secure admin login (argon2 password hashing, rate limiting, session cookies)
- 📦 One Docker container, one data folder to back up

## Quick start (Docker)

You'll need [Docker](https://docs.docker.com/get-docker/) installed. Then:

```sh
git clone <this-repo> && cd <this-repo>

# 1. Create your config file
cp .env.example .env

# 2. Open .env and set ADMIN_EMAIL and ADMIN_PASSWORD
#    (these become your admin login on first boot)

# 3. Build and run
docker compose up -d
```

That's it — your desktop is at <http://localhost:4321>.

It will be empty! That's expected. Head to the admin to add things.

## Your first login

1. Go to <http://localhost:4321> and double-click **Control Panel**
   (bottom-right corner of the desktop)
2. Sign in with the `ADMIN_EMAIL` / `ADMIN_PASSWORD` from your `.env`

The admin account is created automatically on first boot. After that, the
`.env` credentials are never read again — you can even remove them.

From the admin you can:

- **Desktop Icons** — add icons to the desktop. Give each a name and either a
  web link (opens in a new tab; the site's favicon is fetched automatically)
  or an uploaded PDF (opens in the built-in viewer — great for a resume). You
  can upload your own `.png` icon, or let the favicon do the work.
- **Posts** — write blog posts in Markdown. Save as draft, preview, then
  publish. Published posts appear at `/posts` in a "Posts" window on the
  desktop.

## Running from source (development)

You'll need [Node.js](https://nodejs.org) 22.12 or newer.

```sh
npm install
cp .env.example .env   # set ADMIN_EMAIL and ADMIN_PASSWORD
npm run dev            # http://localhost:4321
```

Useful commands:

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server with live reload |
| `npm run build` | Production build into `./.next` |
| `npm start` | Serve the production build locally |
| `npm run check` | Type-check the project |

## Configuration

All settings live in `.env` (copy `.env.example` to start). None of them are
required after first boot except `DATA_DIR` defaults.

| Variable | What it's for |
| --- | --- |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Your admin login, seeded on first boot only. (To reset it, delete the database and boot fresh.) |
| `PUBLIC_SITE_TITLE` | The site name shown in the browser tab and window chrome (e.g. `yourdomain.com`). |
| `PUBLIC_SITE_URL` | Your site's public URL, used for links and previews. |
| `DATA_DIR` | Where the database and uploads live. Leave unset: local runs use `./data`, Docker uses `/data`. |

## Where your stuff lives

Everything you create — posts, icons, uploaded images and PDFs, your account —
is stored in a single folder: `./data` (mounted at `/data` in Docker). It
contains a SQLite database and an `uploads/` directory.

**Back up that folder and you've backed up your whole site.** Delete it and
you're back to a fresh install.

Database schema changes ship as numbered `.sql` files in `migrations/` and
apply automatically on startup — updating is just pulling the new image or
code and restarting. (Old migrations can be squashed into a single baseline
file over time; see the note in `src/lib/db.ts`.)

## How it's built

[Next.js](https://nextjs.org) (App Router) with [React](https://react.dev),
server-rendering real HTML for every route from SQLite
([better-sqlite3](https://github.com/WiseLibs/better-sqlite3)). The desktop —
draggable windows, taskbar, start menu — is a set of React client components;
the admin is a window on that desktop (no `/admin` routes), talking to React
Server Actions. Publishing is instant because
content is read at request time, never baked into a build.

## Credits

Most XP styling - [XP.css](https://github.com/botoxparty/XP.css)
(MIT). 

Windows XP style icons sourced from the
[Windows XP High Resolution Icon Pack](https://github.com/marchmountain/-Windows-XP-High-Resolution-Icon-Pack).

The design is an homage to a certain beloved operating system.
