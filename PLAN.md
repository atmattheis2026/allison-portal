# Allison Mattheis — Transaction Portal

A per-transaction dashboard for her real estate business. Allison (and her team) edit
transactions; buyers view a read-only page via a secret link.

Source spec: Allison's iMessage list, Aug 5 2026, plus her inspo screenshot
(dark navy + gold, serif display, milestone rail, big closing countdown).

**Endgame: Allison owns this.** Dixon builds v1 and configures every account, then hands
off to her Claude Code. Every decision below optimizes for "can a brand-new vibe coder
keep editing this without touching config."

---

## Stack

| Layer | Choice | Why |
|---|---|---|
| Front end | React + Vite + TypeScript | Dixon's default; Claude Code handles it well |
| Styling | Plain CSS custom properties, no Tailwind | She'll read `theme.css` and understand it. Tailwind class soup is hostile to a beginner. |
| Data | Supabase (Postgres + RLS + Storage) | Dixon knows it cold and can debug her over text |
| Auth | Supabase email magic link — **Allison + team only** | Buyers never authenticate |
| Hosting | Netlify | Push to main, it deploys |
| Photos/headshots | Supabase Storage, public bucket | Drag-drop upload in the UI |

Repo: `~/Code/allison-portal`. Handoff copy goes to her own GitHub.

---

## Access model

Two front doors, one codebase:

- `/t/:shareToken` — **client view.** Unguessable token, read-only, no login. This is what
  she texts the buyers. Renders the whole dashboard minus anything marked internal.
- `/admin` — **her view.** Magic-link login. Lists all transactions, create/edit/archive,
  toggles, date pickers, photo upload, share-link copy button.

Same `<TransactionDashboard>` component both places, with `editable` and `showInternal`
props. One layout to maintain, not two.

**Client view hides:** internal notes, the loan column's raw condition lines (buyers don't
need to see "letter of explanation — deposit"), and anything flagged `internal_only`.
Confirm this list with Allison — it is a guess, not her instruction.

---

## Data model

```
profiles          id (=auth.uid), full_name, role ('realtor'|'loan_officer'|'admin'),
                  license_number, headshot_url, phone, email, team_id

teams             id, name, wordmark            -- "MATTHEIS & CO." in the brand bar

transactions      id, team_id, share_token (unique, default gen_random_uuid),
                  address_line, city_state_zip, photo_url,
                  status ('under_contract'|'closed'|'fell_through'),
                  realtor_id, loan_officer_id,
                  closing_date,                 -- drives the countdown
                  created_at, archived_at

milestones        id, transaction_id, side ('real_estate'|'loan'),
                  key, label, sort_order,
                  is_complete, completed_on,
                  has_date (bool), date_value,  -- only the 📅 items get a date field
                  internal_only (bool)

doc_lines         id, transaction_id, group_key ('documentation'|'conditions'),
                  sort_order, text, is_checked

contacts          id, transaction_id, group_key ('people'|'utilities'),
                  role_key, sort_order, name, phone, email, note
```

**Milestones are rows, not columns.** Her checklist will change — every realtor's does.
Rows mean she can tell her Claude "add a step called X after Y" and it's a data edit, not
a migration. A `seed_milestones(transaction_id)` Postgres function stamps her 14 real
estate + 15 loan items onto every new transaction.

`doc_lines` seeds 6 blank rows per group (her "5-8 of those fill in lines"), with an
"+ add line" button rather than a hard cap.

### RLS

- `transactions`, `milestones`, `doc_lines`, `contacts`: team members read/write their own
  team's rows. Standard `team_id` check through `profiles`.
- **Client view does not query these tables.** It calls one `SECURITY DEFINER` function,
  `get_shared_transaction(token uuid)`, which returns the full assembled payload and
  filters `internal_only` server-side. Anon role gets `EXECUTE` on that function and
  nothing else. A leaked token exposes one transaction, never the table.
- Storage bucket is public-read (photos are of houses, not people's finances); writes
  restricted to authenticated team members.

---

## Build order

**Phase 1 — the page** ✅ design done
Static mock at `mock/index.html`. Every element from her list, in the inspo's language.
This is the visual contract; the React build matches it pixel for pixel.

**Phase 2 — Supabase**
Project, schema migration, RLS, `seed_milestones`, `get_shared_transaction`, storage bucket.
Seed one demo transaction (7859 Palmilla Ct) so there's something to look at.

**Phase 3 — client view**
`/t/:token` route, port the mock to React components, wire to the share function.
Countdown computes from `closing_date`. Progress rail derives from the real estate
milestones — six named checkpoints, no separate table.
Ship this first: it's the half she can show a client tomorrow.

**Phase 4 — admin**
Magic-link login, transaction list, create flow, inline editing (checkbox toggle, date
picker, contact fields, doc lines), photo + headshot upload, "copy client link" button.
Optimistic updates — she's clicking a lot of checkboxes and shouldn't wait on a round trip.

**Phase 5 — polish**
Mobile layout (three columns stack; the rail becomes vertical — she will absolutely open
this on her phone at a closing table). Print stylesheet, because realtors print things.
Team management so she can add her team's realtors and lenders.

**Phase 6 — handoff**
See below.

---

## Handoff to her Claude Code

The whole point. Deliverables:

1. **`SETUP.md`** — the thing she failed at last night, solved. Node, git, VS Code, Claude
   Code, cloning her repo. Screenshots, not prose. Written for someone who has never used
   a terminal.
2. **`CLAUDE.md`** in the repo root — project context for *her* Claude: what the app is,
   where things live, the brand rules, what not to break (RLS, the share function, the
   `internal_only` filter), and how to run and deploy it.
3. **Accounts already configured by Dixon before she touches anything** — Supabase project,
   Netlify site, GitHub repo, env vars in Netlify, `.env.local` on her machine. She never
   sees a dashboard she has to configure.
4. **`docs/HOW-TO-CHANGE-THINGS.md`** — plain-English recipes. "To add a checklist item,
   tell Claude: …". "To change the gold color, edit `theme.css`". The five things she'll
   actually want to change on day one.
5. **A live walkthrough** — screen share, she makes one real change herself end to end, and
   pushes it. She won't believe it works until she's done it once.

---

## Open questions for Allison

1. **Brand.** "Mattheis & Co." is my placeholder in the mock. Real name, and is she under a
   brokerage whose branding has to appear? Brokerages have rules about this.
2. **Loan column visibility.** Does the buyer see the loan side at all? It's her lender
   partner's workflow and some of it is internal. My default hides the raw condition lines
   but shows the loan milestones — needs her ruling.
3. **Seller-side transactions.** Her checklist is buyer-shaped. Does she need a seller
   variant, or is one list fine for now?
4. **Team size.** "Changeable for my team" — how many people, and do they each need a login
   or does she manage everything?
5. **Does the buyer's phone matter?** If she's texting clients links, most will open on a
   phone. That moves mobile from Phase 5 to Phase 3.

---

## Notes

- No DWD branding anywhere. This is Allison's business, not Dixon's.
- The gold here is *her* palette from her inspo, and has nothing to do with the Tamara Mark.
  Do not import DWD brand assets into this repo.
