# Sharon

An internal content management and AI-assisted search platform for Solutions Engineering teams. Upload decks, demos, docs, code, and videos — then use the built-in AI chat to find and brainstorm content in plain English.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [Database Setup](#database-setup)
- [Available Scripts](#available-scripts)
- [Project Structure](#project-structure)

---

## Prerequisites

- [Node.js](https://nodejs.org/) v18 or later
- [npm](https://www.npmjs.com/) v9 or later
- A [Supabase](https://supabase.com/) project (free tier works)
- An [OpenAI](https://platform.openai.com/) API key

---

## Quick Start

```bash
# 1. Clone the repo
git clone https://github.com/areafans/sharon.git
cd sharon

# 2. Install dependencies
npm install

# 3. Set up environment variables (see section below)
cp .env.template .env.local
# Then open .env.local and fill in your keys

# 4. Apply the database schema
npm run db:migrate

# 5. Start the dev server
npm run dev
```

The app will be available at `http://localhost:5173`.

---

## Environment Variables

Copy `.env.template` to `.env.local` and fill in each value. **Never commit `.env.local` to git.**

```bash
cp .env.template .env.local
```

| Variable | Where to find it | Required |
|---|---|---|
| `VITE_SUPABASE_URL` | Supabase Dashboard → Project Settings → API → Project URL | Yes |
| `VITE_SUPABASE_ANON_KEY` | Supabase Dashboard → Project Settings → API → `anon` / `public` key | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Project Settings → API → `service_role` key (secret) | Yes (for seed scripts) |
| `SUPABASE_DB_URL` | Supabase Dashboard → Project Settings → Database → Connection string (URI mode) | Yes (for migration scripts) |
| `VITE_OPENAI_API_KEY` | [platform.openai.com](https://platform.openai.com) → API Keys | Yes |

> **Note:** Variables prefixed with `VITE_` are exposed to the browser bundle. Do not put secrets in `VITE_` variables in a production deployment — move AI calls to a server-side function/edge function instead.

---

## Database Setup

The schema and migrations live in `supabase/`.

### Fresh setup

If you are setting up a brand-new Supabase project, run the full schema first:

1. Open your Supabase project → SQL Editor
2. Paste and run the contents of `supabase/schema.sql`

Then run the Node migration runner to apply any incremental migrations:

```bash
npm run db:migrate
```

### Incremental migrations (existing project)

If you already have the base schema applied, just run:

```bash
npm run db:migrate
```

This applies `supabase/migrate_v2.sql` → `migrate_v3.sql` → `migrate_v4.sql` in order (already-applied migrations are skipped).

### Storage bucket

Create the Supabase Storage bucket used for file uploads:

```bash
npm run storage:setup
```

### Seed data (optional)

```bash
# Seed user accounts
npm run db:seed

# Seed sample content items
npm run db:seed:content
```

---

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the Vite dev server at `http://localhost:5173` |
| `npm run build` | Build for production into `dist/` |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run ESLint |
| `npm run db:migrate` | Apply incremental SQL migrations via `scripts/run_migration.js` |
| `npm run db:seed` | Seed user accounts via `scripts/seed_users.js` |
| `npm run db:seed:content` | Seed sample content items via `scripts/seed_content.js` |
| `npm run storage:setup` | Create the Supabase Storage bucket via `scripts/setup_storage.js` |

---

## Project Structure

```
sharon/
├── public/                  # Static assets
├── scripts/                 # Node.js setup / seed scripts
│   ├── run_migration.js
│   ├── seed_users.js
│   ├── seed_content.js
│   └── setup_storage.js
├── src/
│   ├── components/          # React components
│   │   ├── AnalyticsView.jsx
│   │   ├── ChatPanel.jsx    # Docked AI assistant panel
│   │   ├── ChatView.jsx     # Full-screen AI chat with conversation history
│   │   ├── Icons.jsx
│   │   ├── LibraryView.jsx
│   │   ├── Poster.jsx
│   │   └── Sidebar.jsx
│   ├── lib/
│   │   └── supabase.js      # Supabase client initialisation
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css
├── supabase/
│   ├── schema.sql           # Full base schema (run once on a new project)
│   ├── migrate_v2.sql
│   ├── migrate_v3.sql
│   └── migrate_v4.sql       # Latest migration
├── .env.template            # Copy to .env.local and fill in your keys
├── .gitignore
├── package.json
└── vite.config.js
```
