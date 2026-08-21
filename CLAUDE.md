# Project context for Claude

You are working with **Allison Mattheis**, a realtor. She is new to coding — treat
her as a smart person who does not know or want to know software vocabulary.

## How to work with Allison

- **Explain in plain English.** Never say "component," "state," "props," "migration,"
  or "deploy" without saying what it means in the same sentence.
- **Just do it.** She wants the change, not a menu of ways to make the change.
  Ask only when getting it wrong would cost her real work.
- **Show, don't describe.** After a change, tell her what to look at and where.
- **She will describe things visually** — "make it pop more," "that looks squished."
  Interpret it, make a call, and show her.
- If she asks for something risky, say so in one sentence and offer the safe version.

## What this is

A transaction portal for her real estate business. Each property transaction gets a
page. She edits it; her clients view it read-only through a secret link she texts them.

Built from her own spec (Aug 2026) and a dark-navy-and-gold reference design.

## Layout

```
allison-portal/
  app/                    the website
    src/
      theme.css           ALL COLORS AND FONTS. Start here for any look change.
      components/
        Dashboard.tsx     the transaction page itself — client and admin both use it
        Dashboard.css     how that page looks
      pages/
        ClientView.tsx    what her clients see        /t/<token>
        AdminList.tsx     her list of transactions    /admin
        AdminTransaction.tsx  her editing view        /admin/t/<id>
        AdminSettings.tsx  branding + checklist editor /admin/settings
        AdminNetworkLeads.tsx  Agent Recruiting list   /admin/network
        MentorHome.tsx    a mentor's own filtered list /mentor
        AdminResources.tsx  Database Manager reference page /admin/resources
        Login.tsx         magic-link sign in          /login
      components/
        NetworkAgentDetail.tsx  agent page, shared by staff (/admin/network/:id)
                                 and mentors (/mentor/:id) via a `viewer` prop
      lib/
        types.ts          the shape of the data
        supabase.ts       database connection + demo mode
        demoData.ts       sample data used when there's no database
  supabase/migrations/    the database structure
  mock/                   the original static design mocks (reference only)
```

## Running it

```
cd app
npm run dev
```

Typecheck before saying something works: `cd app && npx tsc --noEmit -p tsconfig.app.json`

## Things that will break the app if you change them

**Do not weaken `get_shared_transaction`.** It is the only thing anonymous visitors
can call. It is `SECURITY DEFINER`, which means it runs with elevated rights on
purpose. If a client needs to see a new field, add it to that function's JSON — never
by granting table access to `anon`. Granting anon access to a table would expose
every client's transaction to every other client.

**Do not remove RLS policies.** Every table is locked to the user's team. Turning
that off means her whole business is readable by anyone with the app's public key.

**Client-side "can they see this" checks must account for `is_platform_admin`,
not just team_members roles.** Found and fixed 2026-08-19: `useIsDatabaseManager()`
and the Rolodex check in `AdminNav.tsx` only checked `team_members.roles`/
`sees_all_transactions`, never `profiles.is_platform_admin` — but RLS policies
almost everywhere OR in `is_platform_admin()` as a full bypass. Allison's own
account has the flag but no `admin` team role, so for her specifically the
database was willing to let her do things (create a Home Page folder, see
Rolodex) that the UI simply never showed her the door to. Any new "should I
show this button/link" check needs the same OR, or it'll silently diverge
from what RLS actually allows — and it'll look like "the page is missing,"
not like a permissions bug, which makes it much harder to diagnose from a
bug report alone.

**Milestones are rows, not code.** To add or remove a checklist step, she does it in
Settings › Checklists. Do not hard-code checklist items into components.

**Dates are `YYYY-MM-DD` strings and must be parsed as local time.** There's a
`parseLocal()` helper in `Dashboard.tsx` — use it. `new Date('2026-07-26')` parses as
UTC midnight and displays as July 25th in Florida, which would show every client the
wrong closing date.

**Mobile is the primary surface.** Most clients open the link on a phone. `Dashboard.css`
is mobile-first — the base styles are the phone, and the `@media (min-width: 900px)`
block is desktop. Check the phone layout before calling anything done.

**Two brands, on purpose.** The real estate company owns the top bar and `--gold`.
The lending company owns the Loan section and `--lend`. Do not merge them; realtors
and lenders are separate businesses with separate compliance rules.

## Demo mode

With no `.env.local`, the app runs on `demoData.ts` and shows a banner saying so.
This is intentional. It means the app always renders something instead of a blank
page, and it lets design work happen without touching real client data.

Real credentials go in `app/.env.local`:

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

That file is gitignored and must stay that way. Never commit keys.

**Disclaimers ship empty on purpose.** Each brand has a `disclaimer_text` field shown
in the page footer. Never pre-fill it with plausible-looking compliance language — her
brokerage and her lender have to approve the exact wording, and fake legal text that
looks real is worse than an empty footer.

**Seller transactions have no loan side.** Her listing checklist has no loan steps, so
the Loan section is absent and the page runs two columns. That is data-driven, not a
special case in code — adding loan steps to the seller template would bring it back.

**Editing is inline, not a separate form.** The admin view is the same Dashboard
component with `editable`, so the thing she changes is the thing her client sees.
Inputs are styled invisible until focused (`.inlineEdit`). Don't build a separate
"edit transaction" form — it would immediately drift from the client view.

**Anything editable must be editable on a phone.** The address exists twice in the
DOM: once inside the photo (phone) and once beside it (desktop), with CSS hiding
one. Both are editable. If you add a new editable field, check it isn't living only
inside `.headline`, which is `display:none` on a phone.

## Agent Recruiting (recruiting/training/mentorship)

Labeled "Agent Network" until 2026-08-13 — every user-visible label now says
"Agent Recruiting" (nav link, page header, Settings tab), matching the
"Recruiting" category label on the Home Page. File/table names
(`AdminNetworkLeads.tsx`, `network_agents`, `/admin/network`) are unchanged.

Added 2026-08-12, migration `064_agent_network.sql`. This is a *second* walled-off
area inside the same app — for tracking people she's recruiting or mentoring into
the business, separate from her real estate clients. Three pieces:

- **`network_agents`** — the primary list (Settings-adjacent nav link "Agent
  Network"). One row per person, lifecycle tracked by `status` (lead → training →
  active → inactive), not separate tables — same reasoning as `leads`.
- **Mentors** are their own roster (`mentors` table), *not* `team_members`. A
  mentor is not necessarily one of her five office people.
- **A mentor gets their own login**, scoped to only the agent(s) assigned to
  them — never her transactions, clients, or the rest of her staff roster.

**Do not put a mentor in `team_members`.** That table (and `brands`,
`saved_lenders`, the checklist templates, `saved_contacts`) has always used one
flat "anyone on the team can read/write this" policy. A mentor sharing the same
`team_id` as her real staff would get the run of all of it unless walled off —
migration 064 does that by excluding `profiles.role = 'mentor'` from every one
of those policies. If you add a *new* team-wide table later, it needs the same
`and not is_mentor()` treatment, or a mentor signing in sees more than intended.

**Two separate invite codes, on purpose.** `teams.invite_code` (staff) and
`teams.mentor_invite_code` (mentors) are different columns, checked by different
functions (`join_team_with_code` vs `join_as_mentor`). The code someone is given
is what decides their role — not a checkbox they tick themselves. Never merge
these into one code with a role picker in the UI.

## Home Page / Resources (Database Manager reference page)

Four sections as of 2026-08-19 (migration `068_loans_category.sql` added
`loans` as its own `ResourceCategory` — Allison wanted it separate from
`general` so loan folders don't get buried among unrelated docs): Recruiting
(`agents`), For Transactions (`transactions`), Loans (`loans`), General
(`general`). Adding a fifth category means widening the check constraint on
BOTH `resources.category` and `resource_folders.category` (they're separate
constraints, easy to update one and miss the other) plus `ResourceCategory`
in `types.ts` and the `CATEGORIES` array in `AdminResources.tsx`.

Added 2026-08-12, migration `065_resources.sql`, relabeled "Home Page" and
moved to the front of the nav the same day — `AdminResources.tsx` and the
`resources` table/route are still named for what it stores, but every
user-visible label says "Home Page," not "Resources." A private page —
Database Managers only, both to view and to edit — for docs and links worth
keeping handy about agents and transactions (forms, saved links, policy
docs), not tied to any one transaction or lead. Gated with
`is_database_manager()`, which already existed (migration 052, for deleting
a transaction).

**It's also the landing page for Database Managers**, once per browser tab:
`AdminList.tsx` (the `/admin` transactions list) redirects a Database Manager
to `/admin/resources` the first time they load `/admin` in a session
(tracked with a `sessionStorage` flag, not by changing where the magic-link
email points). After that first bounce, `/admin` behaves normally for the
rest of the session — including the "Transactions" nav link, which also
points at `/admin`. **Do not make this redirect unconditional** (e.g. check
role on every `/admin` load with no session flag) — that would turn
"Transactions" in the nav into a trap that always bounces a Database Manager
straight back to Home Page, since both links point at the same URL.

**It's first in `AdminNav`'s item list, before Transactions** — Allison's
choice, so it reads as the true home base for a Database Manager rather than
just another item in the row.

**File uploads reuse the existing `media` storage bucket**, same as
`lead_documents` — see the migration file for why that's an intentional
match to existing precedent rather than a weaker security choice.

**Folders, added 2026-08-13 (migration `066_resource_folders.sql`).** Each
section can now have folders, and a Database Manager can grant a SPECIFIC
PERSON (not a role — Allison was explicit about this) access to one folder.
That person can then view and add/remove files inside that one folder, from
the same `/admin/resources` page, but can't create/rename/delete the folder
or see/change who else has access to it. Key points for whoever touches this
next:

- A grant is to a `team_members` row OR a `mentors` row, never both — see
  `resource_folder_access`'s check constraint. Mentors aren't team_members
  (migration 064), so the ACL has to span both.
- `can_access_resource_folder()` is the one function both `resource_folders`'
  select policy and `resources`' grant-based policy call — change the rule
  there, not in two places.
- Unfiled resources (`folder_id` null) are UNCHANGED: still strictly
  Database-Manager-only, exactly as migration 065 left them. Folders are a
  new, narrower door — not a widening of the old one.
- **The nav link and the redirect are two different gates, don't conflate
  them.** `useCanSeeHomePage()` (Database Manager OR has any folder grant)
  controls whether "Home Page" shows up in `AdminNav` and on `MentorHome`.
  The once-per-session landing redirect in `AdminList.tsx` is still
  Database-Manager-only — a granted agent or mentor can reach the page via
  the nav link, but doesn't get auto-landed there at sign-in.
- Mentors reach it via a "Home Page" link on `MentorHome.tsx`, shown only
  when `useCanSeeHomePage()` is true for them — most mentors will never see
  it, since most won't have a grant.

## HOA / property tax lookup (Home Info)

Two edge functions, deliberately layered rather than one:

- **`fetch-link-preview`** — given the transaction's listing link, fetches
  that one page and greps it for HOA/tax/school district/county
  (`extractHomeFacts()`). Several sites (Zillow especially) block a plain
  server fetch outright, so this often comes back empty.
- **`search-home-facts`** — the fallback, added 2026-08-13. No listing link,
  or the link came back without HOA/tax: searches the open web for the
  transaction's address (DuckDuckGo's no-JS HTML results page, no API key,
  no account, no cost — Allison was explicit about not wanting to pay for a
  property-data API) and tries a few of the results instead of the one
  blocked link. Still best-effort — county tax pages vary wildly in format,
  so this often finds less than a human clicking around would.

Both return through the same UI: `HomeInfoSection` in `Dashboard.tsx` has one
"Look it up" button that tries `onFetchListingPreview` first (if there's a
link) and falls back to `onSearchHomeFacts` automatically when that comes up
empty. It shows which page a found value came from (`sourceUrl`) so she can
click through and verify — same "needs to be verified" disclaimer either
way. `AdminLead.tsx`'s `fillHomeFacts()` runs the identical two-step lookup
automatically right after "Convert to transaction," not just on manual click.

**Don't skip the fallback to save a request.** The direct-link fetch failing
silently (empty result, no error) is indistinguishable from it succeeding
with nothing to find — always try the web-search fallback when the direct
fetch comes back without `hoa_fee`/`property_tax`, don't assume "no listing
link" is the only case that needs it.

## Home Page folder notes + notifications

Added 2026-08-19, migration `067_resource_folder_notes.sql`. Each folder gets
its own free-typed running log (`resource_folder_notes`) — same shape and
same `notelist`/`note`/`notemeta`/`noteauthor`/`notewhen`/`notebody`/`noteadd`
CSS classes as the Updates board on transactions/leads (migrations 008, 056).
Same access rule as everything else in a folder: `can_access_resource_folder()`.

**Notifications are opt-in per note, not per person and not a digest.**
Allison was explicit: notified, but not every time. She picked "whoever
posts decides" over the other two options (a per-person subscribe toggle, or
a daily digest) — there is no notification-preference table anywhere in this
schema, on purpose. The person posting a note checks a box; if checked, the
client calls the `notify-resource-folder-note` edge function right after the
insert, which emails everyone in `resource_folder_access` for that folder
(minus the poster) via Resend — same email-sending pattern as
`notify-client`/`send-team-invite` (`RESEND_API_KEY` env var, HTML template
inline in the function). **Do not build a scheduled digest or a
per-person subscribe column for this without her asking again** — both were
explicitly considered and turned down.

`resource_folder_notes.notified` records whether a send actually happened
(shown as a small "Notified" tag in the UI) — it's set by the edge function
after sending, not by the client optimistically.

## Home Page nested folders + contacts

Added 2026-08-19, migration `069_folder_nesting_and_contacts.sql` — built for
Allison's Loans scenario: a top-level folder per loan type (DSCR,
Conventional, ...), a subfolder per lender inside that, each folder holding
its own docs/notes/contacts.

- `resource_folders.parent_folder_id` is self-referencing, nullable — null
  is top-level (every folder before this migration). `category` is still
  set on every folder including subfolders, always inherited from the
  top-level ancestor; it's only used for which section to render under.
- **Access is inherited down the chain.** `can_access_resource_folder()`
  walks up `parent_folder_id` (a recursive CTE) — a grant on any ancestor,
  including the folder itself, is enough. Granting the top-level "DSCR
  loans" folder gives someone every lender subfolder inside it automatically
  — that's the point, not an accident. Contacts (`resource_folder_contacts`)
  use this exact same function; there's no separate contacts permission.
- **Known limitation, left alone on purpose:** granting a subfolder directly
  (skipping its parent) makes that subfolder selectable via RLS, but the UI
  only reaches a subfolder by drilling into a *visible* parent tile
  (`FolderDetail` filters `allFolders` by `parent_folder_id` for its own
  subfolder list) — so a subfolder granted without its parent won't be
  reachable for that person. Recommend granting the top-level folder instead.
  Don't build a fetch-orphaned-subfolders-separately fix unless she
  specifically asks for that case.
- Contacts are edited inline (create a blank row, then type into it) —
  same pattern as `lead_priorities`/appointments in `AdminLead.tsx`, not a
  separate add-then-save form like `AddResource` uses for docs/links.

**Navigation UI, rebuilt 2026-08-21** — the first version showed every folder
fully expanded, recursively, all at once (an accordion). Allison rejected it
as "too busy... messy and hard to see what belongs where" and asked for
something "familiar to all computer users": Explorer/Finder/Google-Drive-
style icons you click to open, one folder's contents visible at a time.

- `AdminResources.tsx` keeps `pathByCategory: Record<string, string[]>` —
  one drill-down path per top-level category (agents/transactions/loans/
  general), e.g. `{loans: ['fold-dscr', 'fold-summit']}`. An empty path means
  "show the category's own top-level folders," not any folder's contents.
- `FolderTile` renders one clickable gold folder icon (`FolderIcon`, inline
  SVG, no icon library) + name; clicking it pushes that folder's id onto the
  category's path. Used both for a category's top-level folders and for a
  `FolderDetail`'s own subfolders — same component either way.
- `FolderDetail` is the "opened folder" view: a breadcrumb row (built by
  `buildCrumbs`, each non-current crumb clickable to jump straight back to
  that depth) above a gold-tinted panel (`rgba(201,164,76,0.06)` background,
  `var(--gold-soft)` border — the same wash used for "current step"
  elsewhere in the app) containing a "← Back" button, then in order: the
  folder's own docs, its subfolder `FolderTile`s (if any) + "+ New folder",
  contacts (only if it has no subfolders — see below), then notes. Only the
  currently-open folder's contents render — never a parent's and a child's
  content at the same time.
- **Contacts only render on a "leaf" folder** (`subfolders.length === 0`),
  added 2026-08-21 per Allison's feedback. A category folder like "DSCR
  loans" that just holds lender folders has no Contacts section — there's no
  person to call for a loan *type*. A lender folder like "Summit Lending"
  (no children) still shows Contacts, matching her original ask ("open their
  folder, I can see documents, loan requirements, notes and the best contact
  people"). This is computed live from `subfolders.length`, not a stored
  flag — if she ever adds a subfolder to what was a leaf folder, its
  Contacts section will disappear on next load. That's expected; don't
  "fix" it without her asking.
- Deleting the currently-open folder (`FolderDetail`'s "Delete folder"
  button) navigates back to its parent afterward — `deleteFolder` in
  `AdminResources.tsx` returns a boolean (true = actually deleted, false =
  the user cancelled the confirm) specifically so the caller knows whether
  to pop the path.

**Folder contacts also show in the Rolodex, added 2026-08-21.**
`AdminRolodex.tsx`'s `load()` now also queries `resource_folder_contacts`
(joined to `resource_folders` for the folder's name, shown as context —
e.g. "Home Page — Summit Lending") and merges those into Professional
Contacts as a new row `kind: 'folder'`. No new access logic was needed: this
table's own RLS (`can_access_resource_folder`) already restricts a `select`
to folders the signed-in person can reach, so a person only sees a folder
contact in their Rolodex if they could already see that folder on the Home
Page — a grant on the folder is enough, nothing folder-contact-specific to
maintain. Deleting a `kind: 'folder'` row from the Rolodex deletes straight
from `resource_folder_contacts`. There's no deep link back to the specific
folder (Home Page navigation is client-side path state, not a URL) — the
row's link just goes to `/admin/resources`.

## Still to do

- Both company logos — she uploads them in Settings › Branding
- Wiring Settings saves to the database (the screens work, saving needs Supabase)
- Print stylesheet
- Team management for her five people
- Saved lenders, so she picks a repeat lender instead of retyping
