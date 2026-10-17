# LaunchNote

Changelog, public roadmap and feedback board for software products, with an embeddable
"What's new" widget. A small, self-built version of tools like Canny or Headway.

**Live demo:** <your-vercel-url> | **Demo login:** `<demo-email>` / `<demo-password>`

## Features

- **Changelog**: rich-text editor (Tiptap), drafts, scheduled publishing, public pages with SEO metadata, RSS feed
- **Feedback board**: anonymous submissions, one-vote-per-visitor upvoting, comments, team replies, status workflow
- **Roadmap**: drag-and-drop board for admins, server-rendered public roadmap, "shipped in" links to changelog posts
- **Widget**: one script tag adds a "What's new" popup with an unread indicator (Shadow DOM, no style clashes)
- **Analytics**: page views, unique visitors, widget opens and clicks, top posts and ideas (no IP addresses stored)
- **Teams and roles**: owner / admin / member permissions, single-use invite links, ownership transfer
- **Multi-tenant**: every query is scoped to the project the user belongs to

## Tech stack

| Layer | Tools |
|---|---|
| Web | Next.js (App Router), React, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query, Tiptap |
| API | Node.js, Express 5, TypeScript, Zod, JWT in httpOnly cookies |
| Data | PostgreSQL, Prisma |
| Ops | GitHub Actions CI, Vercel (web), Render (API), Neon (database) |

## Engineering decisions worth a look

- **Safe rich text.** Editor HTML is sanitized on the server with an allowlist before it is stored.
- **Anonymous voting.** A per-browser UUID plus a database unique constraint gives one vote per visitor per idea. Counters are updated in transactions.
- **Job scheduling without Redis.** Scheduled posts are published by polling an indexed table. Each post is claimed with a conditional UPDATE ... WHERE status = 'SCHEDULED', so it can never be published twice.
- **Role-based access.** One requireProjectRole(...) middleware guards every project route. Outsiders get 404, not 403, so project slugs can't be discovered.
- **Invites.** 192-bit random tokens, only the SHA-256 hash is stored, links are single-use and expire after 7 days. Accepting is a claim-then-insert transaction.
- **Embeddable widget.** Built inside a Shadow DOM, uses textContent only (no HTML injection) and its own open-CORS routes, separate from the credentialed API.
- **First-party cookies in production.** The web app proxies /api/* to the API, so auth cookies work in browsers that block third-party cookies.
- **Privacy.** Analytics use anonymous random IDs. No IP addresses or personal data are stored.

## Run it locally

Requirements: Node 20+, PostgreSQL.

    git clone <your-repo-url> && cd launchnote

    # API
    cd api
    cp .env.example .env        # then edit DATABASE_URL and JWT_SECRET
    npm install
    npx prisma migrate dev
    npm run dev                 # http://localhost:4000

    # Web (new terminal)
    cd web
    cp .env.example .env.local
    npm install
    npm run dev                 # http://localhost:3000

## Environment variables

| Where | Name | Purpose |
|---|---|---|
| API | DATABASE_URL | PostgreSQL connection string |
| API | JWT_SECRET | Signs login tokens |
| API | CLIENT_URL | Web app URL (CORS and widget links) |
| Web | NEXT_PUBLIC_API_URL | http://localhost:4000 locally, /api in production |
| Web | API_ORIGIN | Real API URL (server-side fetches and the /api proxy) |
| Web | NEXT_PUBLIC_WIDGET_URL | Real API URL shown in the widget install snippet |

## Known limitations

- Rate limiting is in-memory (per API instance). A shared store such as Redis would be the next step.
- No email: invites are shared as links, and there are no email notifications.
- Pricing is a demonstration page, no payments are processed.
- On a free hosting tier the API may sleep, which delays scheduled posts until it wakes up.
