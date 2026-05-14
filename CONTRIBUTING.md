# Contributing to Sharon

This document covers the conventions both contributors should follow so merges stay clean and history stays readable.

---

## 1. Branch strategy

| Branch | Purpose |
|---|---|
| `main` | Always deployable. Protected — no direct pushes. |
| `feature/<short-description>` | New features (`feature/ai-chat-history`) |
| `fix/<short-description>` | Bug fixes (`fix/upload-timeout`) |
| `chore/<short-description>` | Deps, config, docs (`chore/update-supabase-sdk`) |
| `db/<short-description>` | Schema / migration only (`db/add-tags-table`) |

**Never push directly to `main`.** Open a pull request from your branch and get at least one review before merging.

---

## 2. Starting work

```bash
# Always branch off the latest main
git checkout main
git pull origin main
git checkout -b feature/my-thing
```

If your branch has been open a while, rebase onto main before requesting review:

```bash
git fetch origin
git rebase origin/main
```

---

## 3. Commit messages

Use the format: `<type>: <short imperative description>`

| Type | When to use |
|---|---|
| `feat` | New user-facing feature |
| `fix` | Bug fix |
| `refactor` | Code restructure with no behavior change |
| `style` | Formatting, lint fixes |
| `db` | Migration or schema change |
| `chore` | Build, deps, config |
| `docs` | README, CONTRIBUTING, comments |

Examples:
```
feat: add conversation history to ChatView
fix: handle null user on content upload
db: add tags column to content_items
chore: upgrade supabase-js to 2.106
```

Keep the subject line under 72 characters. Add a blank line and body paragraph for anything non-obvious.

---

## 4. Environment & secrets

- Copy `.env.template` to `.env.local` for your local credentials.
- **Never commit `.env.local` or any file containing real API keys.**
- When you add a new environment variable, update `.env.template` (with a placeholder value) **and** the `README.md` table.

---

## 5. Database migrations

- New migrations go in `supabase/migrate_vN.sql` where `N` is the next version number.
- After writing the migration, also bake it into `supabase/schema_full.sql` so new project setups always get the complete current schema in one file.
- Always test the migration against your own dev Supabase project before opening a PR.
- Commit both `migrate_vN.sql` and the updated `schema_full.sql` in the same PR.

---

## 6. Opening a pull request

1. Push your branch: `git push -u origin feature/my-thing`
2. Open a PR against `main` on GitHub.
3. Fill out the PR template fully — check every box that applies.
4. CI (lint + build) must be green before merging.
5. Request a review from the other engineer.
6. Use **Squash and merge** to keep `main` history linear, unless the PR is a single commit that already has a clean message.

---

## 7. Reviewing a PR

- Pull the branch locally and smoke-test in the browser if it touches UI.
- Leave comments as suggestions where possible (GitHub's "suggestion" feature) so the author can commit them with one click.
- Approve or request changes — don't merge someone else's PR without their acknowledgment.

---

## 8. Keeping `node_modules` and lockfile in sync

- Always commit `package-lock.json` alongside any `package.json` change.
- After pulling changes that modify `package-lock.json`, run `npm ci` (not `npm install`) to get an exact reproducible install.
