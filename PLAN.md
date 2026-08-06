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

## Answers from Allison (Aug 5 2026) — these are settled

1. **Two companies, two brandings.** A real estate company and a lending company, each with
   their own rules. She is sending the new logo plus the existing loans logo.
2. **Buyers see everything, including the condition lines** — "sometimes the client has
   tasks to do." No hidden fields in v1.
3. **She needs a seller version.**
4. **Five people on her team**, but they may not use her as their lender, so **lender info
   must be changeable per transaction.**
5. **Phone is the primary client surface** — "probably the only way they'll follow."

---

## Access model

Two front doors, one codebase:

- `/t/:shareToken` — **client view.** Unguessable token, read-only, no login. This is what
  she texts the buyers.
- `/admin` — **her view.** Magic-link login. Lists all transactions, create/edit/archive,
  toggles, date pickers, photo upload, share-link copy button.

Same `<TransactionDashboard>` component both places, with an `editable` prop. One layout.

**Client view shows everything the admin view shows.** Per her answer #2, there is no
field-level filtering in v1 — the condition lines are a client to-do list, not internal
chatter. The share function still exists (it is how anon reads without table access), but
it returns the full payload. `internal_only` stays in the schema as a flag defaulting to
false, unused for now, so adding one private note later is a UI change and not a migration.

---

## Mobile is the primary surface, not a phase

Per answer #5, most client views will be on a phone. That inverts the build: the client
view is **designed mobile-first and desktop second**, and it ships in Phase 3, not Phase 5.

Phone layout:
- Photo, address, and status stack full-bleed at top.
- **Countdown sits directly under the address.** It is the one thing a buyer opens the link
  to check, and on a phone it should require zero scrolling.
- Progress rail goes **vertical** — a left-hand gold spine with the nodes down it, which
  reads better on a narrow screen than a squeezed horizontal one.
- The three columns become three collapsible sections in her stated order: Real Estate,
  Contacts, Loan. Real Estate opens by default; the other two are tappable.
- Contacts get real `tel:` and `mailto:` links. A buyer on a phone wanting the inspector's
  number should tap once, not copy a string.

Desktop keeps the three-column layout from the mock.

---

## Two-company branding

Her two companies are not a cosmetic detail; they map cleanly onto the layout.

```
brands   id, team_id, kind ('real_estate'|'lending'),
         name, logo_url, wordmark_text,
         accent_hex, accent_soft_hex
```

- The **real estate brand** owns the top brand bar and the page's primary accent.
- The **lending brand** owns the loan column header (and the loan section header on mobile),
  with its own logo lockup and, if its rules require, its own accent color.

So the page reads as one document with two signatures, which is what a co-branded
transaction actually is. Brokerage compliance usually requires the brokerage mark be
present and not subordinated, so the top bar is the safe home for it.

**Blocked until she sends both logos.** Until then the mock keeps placeholder wordmarks.
Do not guess at either company's colors — brokerages have written rules and getting it
wrong is a compliance problem, not a taste problem.

---

## Buyer vs. seller transactions

`transactions.deal_type ('buy'|'sell')`, chosen at creation and immutable after.

Because milestones are rows, this costs almost nothing: `seed_milestones(transaction_id,
deal_type)` stamps the buyer set or the seller set. Her 14 real estate + 15 loan items are
the buyer set. **The seller set needs her input** — the seller side has no loan column at
all in most deals, and gains items like listing agreement, photos/staging, going live,
showings, offer accepted, seller disclosures. Ask her to send that list the same way she
sent the first one.

On a `sell` transaction the loan column is simply absent, and the layout goes two-column
(desktop) or two-section (mobile).

---

## Lender is per-transaction, not per-team

Her team of five may each use a different lender, so the loan officer cannot be a foreign
key into her team's profiles.

- `transactions.realtor_id` → FK to `profiles`. One of her five, picked from a dropdown.
- **Lender fields live on the transaction itself**: `lender_name`, `lender_company`,
  `lender_license`, `lender_headshot_url`, `lender_phone`, `lender_email`, plus an optional
  `lending_brand_id` when it is her own lending company.

To keep that from being tedious data entry on every deal, add a `saved_lenders` table
scoped to the team — she picks a lender she has used before and it fills all six fields,
or types a new one and it is saved for next time. This is the difference between a tool she
uses and a form she resents.

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

**Phase 3 — client view, mobile-first**
`/t/:token` route, port the mock to React components, wire to the share function.
Build the phone layout first and let desktop be the enhancement, per answer #5.
Countdown computes from `closing_date`. Progress rail derives from the real estate
milestones — six named checkpoints, no separate table. `tel:`/`mailto:` on contacts.
Ship this first: it's the half she can text a client tomorrow.

**Phase 4 — admin**
Magic-link login, transaction list, create flow (buy or sell), inline editing (checkbox
toggle, date picker, contact fields, doc lines), photo + headshot upload, saved-lender
picker, "copy client link" button. Optimistic updates — she's clicking a lot of checkboxes
and shouldn't wait on a round trip.

**Phase 5 — polish**
Seller milestone set once she sends it. Print stylesheet, because realtors print things.
Team management for her five people. Brand admin for the two logos.

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

## Still needed from Allison

1. **Both logos** — the new real estate one and the existing loans one. She has committed to
   sending these. Blocks final brand styling; everything else can proceed.
2. **Written branding rules for each company**, if they exist. Minimum sizes, clear space,
   approved colors, whether the mark may sit on a dark background. Her inspo is near-black,
   and plenty of brokerage kits forbid that or require a reversed logo file.
3. **The seller checklist**, in the same format she sent the buyer one.
4. **Her five team members** — names, license numbers, headshots, and which of them need
   their own login versus her managing it.
5. **Do all five share one client-facing brand**, or does any of them carry separate
   branding? Affects whether `brands` is team-scoped or profile-scoped.

---

## Notes

- No DWD branding anywhere. This is Allison's business, not Dixon's.
- The gold here is *her* palette from her inspo, and has nothing to do with the Tamara Mark.
  Do not import DWD brand assets into this repo.
