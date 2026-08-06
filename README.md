# Allison Mattheis — Transaction Portal

Per-transaction dashboard for her real estate business. She edits; clients view a
read-only page through a secret link she texts them.

| Doc | For |
|---|---|
| [SETUP.md](SETUP.md) | Allison, first time. Installing Node/Git/VS Code/Claude Code. |
| [docs/HOW-TO-CHANGE-THINGS.md](docs/HOW-TO-CHANGE-THINGS.md) | Allison, day to day. |
| [CLAUDE.md](CLAUDE.md) | Her Claude Code. Project rules and what not to break. |
| [PLAN.md](PLAN.md) | Dixon. Architecture, data model, build order. |

## Run it

```
cd app
npm install
npm run dev
```

Opens at http://localhost:5199. **No database needed** — with no `.env.local` it runs
on sample data and says so in a banner.

## Routes

| Path | What |
|---|---|
| `/t/:token` | Client view. Read-only, no login. |
| `/admin` | Her transaction list. |
| `/admin/t/:id` | Editing view. |
| `/admin/settings` | Branding + checklist editor. |
| `/login` | Magic link sign in. |
