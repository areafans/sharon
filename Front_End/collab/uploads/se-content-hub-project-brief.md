# SE Content Hub — Project Brief for Claude Code

## Overview

The SE Content Hub is a net-new internal web application for a Solutions Engineering (SE) team of 10–30 people. Its purpose is to solve a core problem: SE-produced content (decks, videos, demo apps, docs, code examples) has no consistent home, making it hard to find, reuse, and build on each other's work.

The app is a content repository with AI-powered discovery and ideation. It is not a CRM, project management tool, deal tracker, wiki, or replacement for Slack or email.

---

## Core Principles

- **One vendor for MVP**: Supabase handles auth, database, storage, vector search, and chat history. Minimize external dependencies until scale demands it.
- **Abstract early**: All file URLs are served through the API — never exposed directly from storage. This makes a future S3 migration invisible to the frontend.
- **AI is v1, not v2**: The chat interface is central to the product, not a nice-to-have enhancement.
- **Open by default**: Any SE can upload anything without approval. The team self-governs via ratings and comments.

---

## Users

- **Internal**: Solutions Engineers only. Authenticated via GitHub OAuth through Supabase Auth.
- **External**: Prospects, customers, or partners who receive a share link. No account required — access is gated by an optional password and/or expiry date on the link.

---

## Content Model

### Content types
- Deck (file upload)
- Video (file upload or external link — Loom, YouTube, Vimeo)
- Demo app (file upload or external link)
- Doc (file upload)
- Code (GitHub link only — no file upload)

### Organization
- Freeform tags (the primary organizational system)
- Content type filter
- No vertical/industry taxonomy in v1 — tags handle this organically

### Content item fields
- Title
- Description
- Content type
- Tags (array)
- Uploader (SE user)
- File URL (Supabase Storage) or external URL
- Thumbnail (optional)
- View count
- Share count
- Ratings (average + count)
- Comments (threaded)
- Created at / updated at
- Vector embedding (for semantic search)

---

## Feature Roadmap

### v1 — Core (build first)

**Upload & browse**
- Upload files directly to Supabase Storage, or provide an external URL
- Video content: SE's choice — upload or link to Loom/YouTube/Vimeo
- Code content: GitHub link only
- Enforce a per-file upload size cap in the UI (Supabase Storage has a 50MB default limit — steer large videos to external links)
- Browse the library filtered by content type and/or tags

**Full-text search**
- Supabase built-in full-text search across title, description, tags, and uploader name
- Sufficient for MVP with a small content library

**Ratings & comments**
- Star ratings (1–5) per content item, one rating per SE
- Threaded comments on any content item

**External share links**
- Any SE can generate a share link for any content item
- Link is a fully public URL — no account required for the recipient
- Optional: password protection (hashed server-side, never stored plain)
- Optional: expiry date (enforced server-side)
- Token is a crypto.randomUUID() stored in the database
- Share count increments each time a share link is generated

**AI chat — content discovery**
- Claude-powered chat interface
- SE describes what they're looking for in natural language
- System embeds the query, runs a pgvector similarity search against content embeddings, and passes results to Claude
- Claude returns a synthesized response with ranked content suggestions and direct links
- Flow: user prompt → embed query → pgvector similarity search → Claude synthesizes response with links

**AI chat — freeform ideation**
- Same chat window as content discovery — unified interface
- SE can drop a freeform idea (e.g. "I want to build an in-booth presentation for AWS Re:invent")
- Claude asks clarifying questions to understand scope, audience, goals, and format
- Claude generates a structured draft artifact: outline, deck structure, talking points, or similar
- SE can save the draft as an idea (visible to the whole SE team for collaborative ideation)
- SE can optionally promote a saved idea to a published content item in the library
- Ideas that are not published remain as drafts in a shared ideas space

**Chat history**
- Persistent per user — chat history is saved to the database
- Full history is available to the SE on return visits
- When sending messages to Claude, send the last N messages as context (not full history) to keep token costs bounded

### v2 — Enhancements (build after v1 is stable)

- **Notifications**: alert SEs when new content is posted matching tags they follow
- **Usage analytics**: view counts, share counts, top content leaderboard, per-SE contribution stats dashboard

### v3 — Explore (future consideration)

- **Collections / bundles**: an SE assembles a curated set of content items for a specific vertical or use case
- **Version history**: track updates to content items over time, notify users when a followed item is updated

---

## Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | React (Vite) | Static deploy to Vercel. Fast local dev. |
| API | Node.js / Express | Local dev first. Deployed as Vercel serverless functions at launch. |
| Auth | Supabase Auth — GitHub OAuth | SEs already have GitHub accounts. Zero auth infrastructure to maintain. |
| Database | Supabase Postgres | All relational data: content metadata, tags, ratings, comments, share tokens, chat history. |
| Vector search | Supabase pgvector | Content embeddings stored and queried within Supabase. |
| File storage | Supabase Storage (MVP) | Migrate to AWS S3 later. Abstract URLs behind the API from day one. |
| AI / LLM | Claude — Anthropic API | Powers both chat modes (discovery and ideation). Use claude-sonnet-4-20250514. |
| Embeddings | Anthropic embeddings API | Generate on content upload. Store in pgvector. Embed queries at chat time. |
| Deployment | Vercel | GitHub push → auto deploy. Preview URLs per PR for code review. |
| Version control | GitHub | Feature branch workflow. PRs reviewed before merge to main. |

---

## Database Schema

### users
Populated automatically by Supabase Auth on first GitHub OAuth login.

- id (uuid, primary key — matches Supabase Auth user id)
- email
- name
- avatar_url
- created_at

### content_items
The core table. One row per piece of content.

- id (uuid, primary key)
- uploader_id (foreign key → users.id)
- title (text, not null)
- description (text)
- content_type (enum: deck | video | demo | doc | code)
- file_url (text) — Supabase Storage URL or external URL
- is_external_url (boolean) — true if linking out, false if stored in Supabase
- tags (text array)
- view_count (integer, default 0)
- share_count (integer, default 0)
- created_at
- updated_at

### content_embeddings
Stores the vector representation of each content item for semantic search.

- id (uuid, primary key)
- content_id (foreign key → content_items.id)
- embedding (vector(1536)) — generated via Anthropic embeddings API on upload
- created_at

### ratings
One rating per SE per content item.

- id (uuid, primary key)
- content_id (foreign key → content_items.id)
- user_id (foreign key → users.id)
- score (integer, 1–5)
- created_at
- unique constraint on (content_id, user_id)

### comments
Threaded comments on content items.

- id (uuid, primary key)
- content_id (foreign key → content_items.id)
- user_id (foreign key → users.id)
- parent_id (foreign key → comments.id, nullable — null means top-level)
- body (text, not null)
- created_at
- updated_at

### share_links
One row per generated share link.

- id (uuid, primary key)
- content_id (foreign key → content_items.id)
- created_by (foreign key → users.id)
- token (uuid, unique — generated with crypto.randomUUID())
- password_hash (text, nullable — bcrypt hash)
- expires_at (timestamp, nullable)
- created_at

### chat_sessions
One persistent session per user.

- id (uuid, primary key)
- user_id (foreign key → users.id, unique)
- created_at

### chat_messages
All messages in a user's chat history.

- id (uuid, primary key)
- session_id (foreign key → chat_sessions.id)
- role (enum: user | assistant)
- content (text)
- created_at

### ideas
Draft artifacts generated through the AI ideation flow.

- id (uuid, primary key)
- created_by (foreign key → users.id)
- title (text)
- artifact (jsonb) — structured output from Claude: outline, sections, talking points, etc.
- published (boolean, default false)
- content_item_id (foreign key → content_items.id, nullable — set if idea is promoted to a content item)
- created_at
- updated_at

---

## API Design

All API routes are prefixed with `/api`.

### Auth
- Handled entirely by Supabase Auth client-side. The Express API validates the Supabase JWT on every protected request.

### Content
- `GET /api/content` — list content items, supports filters: type, tags, search query
- `GET /api/content/:id` — get a single content item with ratings, comments, average score
- `POST /api/content` — upload a new content item (authenticated)
- `PUT /api/content/:id` — update a content item (uploader only)
- `DELETE /api/content/:id` — delete a content item (uploader only)
- `POST /api/content/:id/view` — increment view count

### Ratings & Comments
- `POST /api/content/:id/ratings` — submit or update a rating (authenticated)
- `GET /api/content/:id/comments` — get comments for a content item
- `POST /api/content/:id/comments` — post a comment (authenticated)
- `DELETE /api/comments/:id` — delete a comment (author only)

### Share Links
- `POST /api/content/:id/share` — generate a share link (authenticated), accepts optional password and expiry
- `GET /api/share/:token` — resolve a share token, validate password if required, return content item

### Chat
- `GET /api/chat/history` — return the authenticated user's full chat history
- `POST /api/chat/message` — send a message; server handles embedding, pgvector search, Claude API call, and saves both user message and assistant response to chat_messages

### Ideas
- `GET /api/ideas` — list all ideas (visible to all SEs)
- `POST /api/ideas` — save a new idea draft (authenticated)
- `PUT /api/ideas/:id` — update an idea (author only)
- `POST /api/ideas/:id/publish` — promote an idea to a content item (author only)

---

## AI Chat — Implementation Detail

### Two modes, one interface
The chat interface is a single unified input. Claude determines from context whether the SE is looking for existing content or exploring a new idea. The system prompt should instruct Claude on both behaviors.

### Content discovery flow
1. User sends a natural language query
2. API embeds the query using the Anthropic embeddings API
3. API runs a pgvector cosine similarity search against content_embeddings
4. Top N results (title, description, type, tags, URL) are injected into the Claude prompt as context
5. Claude returns a response with specific content recommendations and direct links
6. Both the user message and Claude response are saved to chat_messages

### Ideation flow
1. User drops a freeform idea into the chat
2. Claude recognizes it as an ideation request (not a search query) and asks clarifying questions: audience, format, goals, timeframe
3. Once context is established, Claude generates a structured artifact in JSON: title, summary, sections with talking points
4. The artifact is rendered in the chat UI and the SE is offered the option to save it as an idea
5. Saved ideas are visible to all SEs
6. An SE can promote any idea to a published content item, which creates a new row in content_items

### Context window management
- Send the last 20 messages to Claude as conversation history (not the full session)
- Inject retrieved content results as a system-level context block, not as chat turns
- Keep the system prompt concise and focused on the two behaviors

### Embedding strategy
- Generate embeddings for each content item at upload time (title + description + tags concatenated)
- Re-generate the embedding if title, description, or tags are updated
- Never generate embeddings at query time for stored content — only embed the incoming query

---

## Security Considerations

- All API routes except `GET /api/share/:token` require a valid Supabase JWT
- Share link passwords are hashed with bcrypt before storage — never stored or logged as plain text
- Share link expiry is enforced server-side on every request to `GET /api/share/:token`
- Share tokens are generated with crypto.randomUUID() — not sequential or guessable
- Row-level security (RLS) should be enabled in Supabase for all tables
- File URLs in Supabase Storage should not be publicly accessible by default — serve through the API with auth validation

---

## Development Workflow

- Two developers plus Claude Code as a third contributor
- Feature branch workflow in GitHub: branch per feature, PR to main, review before merge
- Vercel generates a preview URL per PR — use these for review before merging
- Local development: Vite dev server for frontend, Express for API, `supabase start` for local Postgres + Storage
- Environment variables: Supabase URL, Supabase anon key, Anthropic API key, share token secret — managed via `.env.local` locally and Vercel environment variables in production
- Treat Claude Code output like any other contributor: review its PRs, don't merge unreviewed

---

## Key Risks & Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Supabase Storage 50MB file limit | Medium | Enforce cap in the UI upload form. Prompt SEs to use external links for large videos. |
| Storage migration to S3 | Low | Abstract all file URLs behind the API from day one. Frontend never calls storage directly. |
| Chat token cost growth | Medium | Send last 20 messages as context, not full history. Embed queries once, not on every keystroke. |
| Embedding cost on upload | Low | Generate once on upload. Re-generate only on metadata edits. Batch if needed. |
| Share link security | Medium | UUID tokens, bcrypt passwords, server-side expiry enforcement, RLS in Supabase. |
| Express cold starts on Vercel | Low | Keep route handlers thin. No heavy computation in the API — offload to Supabase and Anthropic. |

---

## Out of Scope (do not build)

- Deal or account tracking
- CRM integration
- SE expertise profiles
- Customer-facing portal or login
- Approval workflow for content publishing
- Mobile app
- Real-time collaboration on documents
- Content editing within the app (the app stores and surfaces content, not edits it)
