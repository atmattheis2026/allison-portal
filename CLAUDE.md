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

**`get_shared_lead` must never name columns directly (2026-09-24).** Her live
database isn't guaranteed to have every migration's columns. plpgsql only checks
column names when the function runs, so one missing column broke Heather's
client page twice (071, 072). Migration 073 reads every row through `to_jsonb()`
and guards each section with its own `exception` block. Keep it that way when
adding fields: add a key to the matching `jsonb_build_object`, never
`v_lead.<col>`.
Since 074 it also returns `transaction`: the full `get_shared_transaction()`
payload for the lead's `converted_transaction_id`. When that's present,
`ClientLeadView` renders the full `Dashboard` (the same view as the deal's /t/
link) with the lead's own updates and referral form underneath. A client
under contract keeps their /l/ link (leads aren't archived on conversion since
055), and before 074 that link showed none of the deal's progress.

**Her live database didn't match the migrations for deal visibility (found
2026-10-01).** It still had 019's `transactions.team_select` with no
`is_platform_admin()` bypass (023 was partly pasted, see 043), so Allison's
deals depended on a Settings › Team entry; deleting a duplicate roster entry
hid all of them. Migration 078 reinstalls 023's policy. Lesson: deleting a
`team_members` row cascades its `transaction_assignees` and can cut someone
off; and check her real database (SQL Editor, impersonating with
`request.jwt.claims` + `set local role authenticated`) before trusting that a
migration file reflects what's live.
Settings › Team now warns before removing an entry that someone signs in
with, that "sees every transaction", or that is assigned to deals, and tags
entries linked to a sign-in "Signs in" so she keeps the right duplicate.
Never put `begin … rollback` in the same SQL Editor paste as a fix: the
editor runs the paste as one batch, so the rollback undid 078 the first time.
Agent/lender pickers (deal + client file) list the people tagged for the job
first, then "Others on your team" (everyone else), so the right person can
always be picked even if their tags are wrong. **Broker associate counts as
an agent and mortgage broker as a lender** (Allison, 2026-10-01); picking
someone sets the deal's realtor/lender title to match their tag.
**Everything on a deal is editable (2026-10-01):** checklist step names (✎,
this deal only; not the two steps with fill-in lines, which `groupAfter`
matches by name), posted Updates (Edit/Delete; edits don't re-email the
client, only inserts trigger `notify_client`), the final price after closing,
and the deal type (Buyer/Listing/Loan only; changing it doesn't touch the
checklist). This supersedes "updates are never edited" in NotesBoard's note.
**Agent/lender per deal is history, on purpose.** Changing the agent/lender on
a client file also updates their *current* deal only while it's open
(`syncCurrentDeal` in `AdminLead.tsx`); closed and cancelled deals keep
whoever worked them (Allison: "I need agent specific transactions").

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
the Loan section is absent. That is data-driven, not a special case in code —
adding loan steps to the seller template would bring it back.

**Page layout (since 2026-09-24):** modeled on a title-company portal she liked.
(Client view and phones; her editing view on a computer uses the desk layout below.)
Desktop is two columns — every detail card (checklists, offer, home info,
updates, contacts) stacked in one wide left column, and the Status Tracker
(vertical, "Step X of N complete") plus the closing countdown pinned on the
right (`.layout` / `.maincol` / `.sidecol`). Phone is one stack with the
tracker above the details. Card titles are plain readable headings, not tiny
all-caps labels; client-side contacts show name over role with email/call
buttons on the right.

**Readability rule (2026-09-24):** Allison found small, letter-spaced, pale
gold all-caps labels "too hard to read" — twice. Section headings use `.eyebrow`,
which is now a plain 17px bold dark heading (not tiny spaced caps). Body text is
17px, grey text colors (`--ink-dim`, `--ink-faint`) were darkened, and nothing in
the app should go below ~13px or use letter-spacing wider than ~.08em. Text in
gold should use `--gold-bright` (the darker gold), not `--gold`.

**Desk layout for her editing view (2026-10-01).** At 1200px and up, the
editing view (`editable`) renders `DeskLayout` in `Dashboard.tsx` instead of
the stacked page: a summary strip (photo, address, client/agent/lender, status,
Closing / Next due / Overdue chips, `deskActions` buttons), the tracker as one
line (`HRail`), Real Estate | Loan | Updates-tabs + "On this deal" in three
columns, then `ContactsTable` (client, utility and agent-only contacts in one
table) beside Offer + Home Info. Built for a transaction coordinator at a
desk; Allison approved it from a mockup. It reuses the same sections and
handlers, so it can't drift from the client view. The client page and every
phone keep the old layout. `useDeskLayout()` (`lib/useDeskLayout.ts`) is a
`useSyncExternalStore` on matchMedia, so it can't go stale like the old
read-once hook. **Tab order is part of the design:** checklist = checkbox →
date → next step; contacts = name → phone → email → address → next row. The
✕/⋯ buttons and the always-open section headers are `tabIndex={-1}` so they
don't interrupt that. `AdminNav` turns into a fixed dark side menu at 1200px+
(`.sidenav` in `theme.css`, `body:has(.sidenav)` shifts the page), on every
admin page.
**Side menu file lists (2026-10-01).** On a computer, Transactions, Active
Clients and Closed in the side menu each fold open (▸, with a count) to list
their files (`useSideFileLists` / `SideGroup` in `AdminNav.tsx`); the open
state is remembered per title in localStorage, the current file is
highlighted. The lists are plain selects, filtered to her `team_id`, so
**who sees which file is decided by RLS, not by the menu**: a transaction
coordinator (role) or "sees every transaction" person sees every file,
everyone else only what they're assigned to. Migration 077 brought client
files (`leads` select + `lead_visible()`) in line with deals: it adds the TC
role and the assigned lender (`lender_member_id`) to who can see a file.
If 077 isn't run, the menu still works with the old, narrower lead rule.
Every title folds open now (2026-10-01): Resource Library (folders, opening
via `/admin/resources?folder=<id>`, then every document/link, opening the file
itself), Rolodex (everyone, one entry per name+phone, each linking to
`/admin/rolodex?q=<name>`), Agent Recruiting (agents), Settings (its four
tabs via `?tab=`). A search box shows once a list passes 6 items, and always
for the Rolodex.

**"Home Page" is now labeled "Resource Library" (2026-10-01, Allison's
request).** Only the visible labels changed; the route, table and file names
(`/admin/resources`, `resources`, `AdminResources.tsx`, `useCanSeeHomePage`)
did not. Older notes below that say "Home Page" mean this page.

**Duplicates (2026-10-01).** The Rolodex groups rows into one entry per
person (`groupPeople` in `AdminRolodex.tsx`: same name and a matching phone
or email, or no phone/email on one side), with each deal/file/saved entry as
a chip underneath; ✕ on a chip removes only that entry. "Possible duplicate"
now means two *different* entries sharing a phone or email. New Active Client
(`NewLead` in `AdminLeads.tsx`) checks the team's files for the same name,
phone or email first and lists them, with "Create anyway".
The "On this deal" card (realtor/LO pickers + who-can-see chips) is folded to
one summary line with a **Change** button (`DeskTeamCard`); on the stacked
layout the "Assigned to" card does the same. Allison: set once, rarely changed.

**Client file on a computer (2026-10-01).** `AdminLead.tsx` at 1200px+
(`useDeskLayout`): full width (`.leaddesk`), and `.leadgrid` gets a third
column holding Updates plus the just-for-you cards (Personal details,
Referrals, Documents, General notes), which otherwise sit above/below the
grid (`updatesCard` / `tailCards` variables). Card titles there are readable
headings, not Settings-style gold caps. The duplicate "tap a name to assign"
chip card was removed: agent/lender are assigned only by the dropdowns in
"What do they need?", folded to one line with **Change**, filtered to people
tagged for the job and one entry per name (`choicesFor`). Her roster really
does contain duplicate names (same person invited twice), so keep that dedupe.
`patchLead` checks the update's error and shows "Last change didn't save"
in the header (it used to fail silently). The "Other" loan type box checks
`'loan_type_other' in lead` (migration 059) and shows the one-line SQL to run
when the column is missing, same idea as the Loan referral card.
Documents card (2026-10-01): `DocumentsList` in `AdminLead.tsx`, slim rows
(type badge, name clamped to 2 lines, short date, small ✕ that still
confirms), newest 5 then "Show all N", a search box past 8 files. The three
guide buttons are one "+ Create…" menu beside "+ Upload". She found the
full-size rows with a Delete button each "very overwhelming".

**Editing is inline, not a separate form.** The admin view is the same Dashboard
component with `editable`, so the thing she changes is the thing her client sees.
Inputs are styled invisible until focused (`.inlineEdit`). Don't build a separate
"edit transaction" form — it would immediately drift from the client view.

**Anything editable must be editable on a phone.** The address exists twice in the
DOM: once inside the photo (phone) and once beside it (desktop), with CSS hiding
one. Both are editable. If you add a new editable field, check it isn't living only
inside `.headline`, which is `display:none` on a phone.

**Per-transaction checklist changes (2026-09-27).** On her editing view each
step has a ✕ ("remove from this transaction" — a condo needs no survey, a cash
buyer no appraisal), a "+ Add a step to this transaction" form (name, where it
goes, date or not), and a "Removed from this transaction" list with Put back.
Removing sets `milestones.internal_only = true`, which `get_shared_transaction`
already filters out — so no new column and no change to that function. The
row keeps its checkmark/date, and Put back returns it to the same spot.
`AdminTransaction.tsx` fetches the hidden rows itself (`hiddenMilestones`),
same as agent-only contacts. Nothing here touches the Settings master lists.

**Cancelling a transaction (2026-10-01).** "Cancel transaction" on her editing
view sets `status = 'fell_through'` (label now "Cancelled"); nothing is deleted.
The Transactions list hides cancelled deals behind a "Cancelled (N)" button, and
"Make active again" sets the status back. It also runs `reactivate_lead` on any
client file pointing at the deal, so "Convert to transaction" works for their
next deal (the old one stays in Deal history). **Not `archived_at`** —
`get_shared_transaction` refuses archived deals, so her own editing page
couldn't open one again.
Right after cancelling, if a client file pointed at the deal, a card on the
same page asks "Is <client> still an active client?" then "Have they started
on a new property?" (`CancelFollowUp` in `AdminTransaction.tsx`). "New
property" takes an address and runs `convert_lead_to_transaction` from their
file, then opens the new deal. Every answer leaves a dated line in the file's
**Personal details** (`lead_personal_notes`), never the Updates board
(`lead_notes`), because that board is client-visible and emails the client on
every insert. "Not active" does not archive the file: archiving hides it with
no way back in the app and turns off their client link.
The client file is found through Deal history (`lead_transactions`), not
`leads.converted_transaction_id`: cancelling clears that pointer, so looking
it up there broke cancel → make active → cancel again (2026-10-01). "Make
active again" points the file back at the deal unless the file has since
moved on to a different deal.
Picking "Cancelled" in the status dropdown runs the same cancel (no confirm,
she already chose it), and picking any other status on a cancelled deal runs
"Make active again" — so the questions appear either way.

**Roster dropdowns are filtered to the deal's own team (2026-10-01).**
`team_members` RLS lets `is_platform_admin()` read every team's roster, so an
unfiltered `select('*')` on her account filled the Realtor/Loan Officer
dropdowns with other teams' people and duplicate names. `AdminTransaction`
loads `team_id = <deal's team>` plus whoever is already on the deal;
`AdminLead` loads the client file's team. `pickerList()` in `Dashboard.tsx`
always includes the person already chosen (even if untagged) and shows each
name once. Other pages (`AdminList`, `AdminLeads`, `AdminClosed`, ...) still
load unfiltered rosters for their chips.

**Contact names suggest as you type (2026-10-01).** On her editing view, a
contact's name box (client-visible and Agent Only contacts) lists matching
people as she types: `NameWithSuggestions` in `Dashboard.tsx`, matching the
start of the first or last name, same contact type first. Picking one fills
name, phone, email, photo, and the address/note if it has one. The list is
built in `AdminTransaction.tsx` (`loadContactBook` → `buildSuggestions`)
from `saved_contacts` plus every named contact on the team's deals, both
filtered to the deal's `team_id` (platform-admin reads every team), one entry
per name+phone.

**Loan referral box (2026-10-01, migration 076).** A client file with
`wants_loan` has a "Loan referral" card under Loan Info: source
(`LOAN_REFERRAL_SOURCES`), referred by, their contact info, notes. Separate
from the real estate `referral_source` in "Agent transaction info" (EPIC/eXp
fields); don't merge them. Internal only (`get_shared_lead` lists its keys
explicitly). If 076 isn't run on her database the columns are missing from
`select('*')`, and the card shows how to run it instead of fields that would
silently fail to save.

**Clients page = three columns (2026-10-01, Allison's design).** "Active
Clients" is now labeled "Clients" (route and file names unchanged). On
`/admin/leads` (`AdminLeads.tsx`): **Under contract** (automatic, lead_status
'under_contract') | **Upcoming** ('active') | **Nurture** ('nurture', 6+ months
out), stacked on a phone; **Inactive** ('inactive') folds below. Each card
shows the client's most recent Update under their name (just one, Allison: keeps it clean), a stage dropdown, and a
scheduled follow-up (`next_followup` date + `followup_note`, private); due or
overdue follow-ups are highlighted and counted at the top, and Upcoming/Nurture
sort by follow-up date. The client file has the same stage + follow-up fields
in "What do they need?". Migration 079 adds the two statuses and columns; until
it's run the page hides those controls and says what to run. The cancel flow's
"not active right now" now moves the client to Nurture.
Built for a book of ~600 clients (2026-10-01): cards drag between Upcoming,
Nurture and the Inactive button (Under contract is never a drop target or
draggable — it follows the deal). The follow-up is one small button per card
(`FollowUpButton`) that opens a box with date + note, Save / Mark done; the box
is `position: fixed` from the button's spot because the columns scroll on a
computer and would cut it off. Search (name, phone, email, follow-up note,
latest update), agent / buyer-loan / "Follow-ups due" filters, and Sort by
(default: "My order"). Latest-update loading is in batches of 100 ids (one
long URL fails).
**Compact cards + her own order (2026-10-01, migration 080).** Cards are two
lines: name (wraps to 2 lines max) + calendar-and-date follow-up button + "⋯"
menu (`CardMenu`: Move to Upcoming/Nurture/Inactive, which is also how phones
move cards since drag doesn't work on touch; Copy client link; Delete), then
agent · buyer/loan · broker agreement. The latest update is one line. Dropping
a card on another card places it above/below (`placeCard`), saved in
`leads.board_position` (smaller = higher; null = not placed, shown on top, which
is where new clients and moved-in cards land). It works while filtered: the
order is computed on the whole column as sorted, hidden clients included. If
another sort is showing, or neighbors have no position, the whole column is
renumbered in the on-screen order and the sort switches to "My order";
otherwise only the moved card changes (midpoint). Without 080 the page says
which file to run.
**Favorite clients (2026-10-01, migration 081).** `leads.starred`: a ☆/★
button before the name on each card and on the client file's Buyer bar, a
"★ Favorites" filter on the Clients page, and a faint gold card background.
For repeat buyers she talks to often. It doesn't change the order; her own
drag order does that. Without 081 the star says which file to run.
**Stars are per person since migration 082** (`lead_stars`, one row per
client + person, `author_name` stored for initials): Allison does loans and
TC work for Ryan and Rich, so the same client can be a favorite for one and
not another. Your ☆/★ is yours; others' stars show as a grey ★ and initials on
the card's second line ("★ AM, RG"). The Favorites filter offers My / each
person's / Anyone's. Visibility rides on `leads` RLS; you can only add or
remove your own star. 082 copies 081's shared stars to Allison. If 082 isn't
run, the page falls back to 081's shared `starred` column.
A **Color key** sits under the search row (`.clientkey`, a `<details>`): open
on a computer, one tap-to-open line on a phone. It uses the real dot, chip
and star styles, so keep it in step if a color changes.
Buyer broker agreement is color coded on each card (first thing on line 2, so
a phone never cuts it off): green "Broker agmt ✓", amber "Broker agmt ends
<date>" within 30 days of `buyer_broker_expires`, red-orange "No broker agmt"
or "Broker agmt expired". Not shown for loan-only or under-contract clients.
The follow-up date chips were taken out of the key (Allison: cluttered).

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
- **Contacts use an explicit Save/Cancel form, not auto-save-on-keystroke**
  (changed 2026-08-21 — the original inline-edit pattern below is
  superseded). A saved contact renders read-only (name/role/phone/email/
  note as plain text) with Edit and Delete buttons; Edit opens that one
  contact into a form (local draft state, nothing written until Save).
  "+ Add a contact" works the same way — draft-only until Save inserts it.
  Cancel on either discards the draft with no write. This was a direct fix
  for "totally open to mistakes if someone accidentally changes something"
  — the old version patched Supabase on every single keystroke via
  `onPatched`, so a stray click into a field could silently overwrite real
  data. See `ContactFields`/`ContactDraft`/`draftToPatch` in
  `AdminResources.tsx`.

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

## Loan Options Worksheet

Added 2026-09-26. Route `/admin/leads/:id/loan-worksheet`
(`AdminLoanWorksheet.tsx`), reached from the **+ Loan options worksheet**
button in a client's Documents card. It's her branded rate sheet for new loan
clients: rate table, then client details (pre-filled from the lead), up to three
loans picked for a side-by-side monthly payment, then a three-page client sheet
(`components/LoanSheetPages.tsx`), which is saved as a PDF into the client's
Documents (`lead_documents` + `media` bucket, same as an upload) or downloaded.

- **Rate table is team-wide**, one row per team in `loan_rate_sheets`
  (migration 075, with the same `not is_mentor()` wall as other team tables).
  If 075 hasn't been run on her live database, `loadRateSheet()` falls back to
  this browser's localStorage and the page shows a banner saying so. Keep
  that fallback; her live database isn't guaranteed to have every migration.
- **Client details are never stored** except inside the saved PDF. That's on
  purpose, so no borrower financial details sit in a new table.
- **The client sheet is a fixed printed design**, 816×1056 px per page, and
  deliberately keeps the worksheet's own look (small spaced caps, Roboto
  light plus Cormorant italic, bundled in `assets/loan-sheet/`). The app's
  readability rule applies to the editing screen, not to these pages.
  Branding is The Mattheis Team + The Surek Group only; never add a brokerage
  logo to it (Allison's instruction). Its lending disclosures are the wording
  she approved for the printed worksheet; don't reword them.
- All client-sheet classes are prefixed `s-` inside `.sp`, because the app's
  global classes (`.hero`, `.fill`, `.chk`, ...) broke the layout otherwise.
- PDFs are built in the browser with html2canvas + jsPDF (loaded only when a
  button is pressed) from an unscaled off-screen copy of the pages.

## VA Buyer Guide

Added 2026-09-27. `/admin/va-guide` (a general handout) and
`/admin/leads/:id/va-guide` (a greeting with the client's name, plus a
"Save PDF to client file" button), reached from **+ VA buyer guide** in a
client's Documents card. Four printed pages (`components/VaGuidePages.tsx`)
in the same fixed design as the Loan Options Worksheet client sheet (shares
its CSS and `lib/sheetPdf.ts`): welcome + Rich Surek veteran note, benefits +
funding fee + Florida disabled-veteran property tax breaks, closing costs,
next steps. **No specific numbers on it, on purpose** — no rates, no
funding fee percentages, no dollar examples, no concession or exemption
amounts (Allison, 2026-09-27: "just in case it doesn't work that way for a
client"). It describes what each benefit/cost is and says the Loan Estimate
has the real numbers. Don't add figures back without her asking.
The final disclosure reuses the approved worksheet wording plus a
not-affiliated-with-VA line.

**FHA vs Conventional guide** (added 2026-09-28): `/admin/fha-conv-guide` and
`/admin/leads/:id/fha-conv-guide`, button **+ FHA vs conventional guide** in
Documents. Pages are `components/FhaConvGuidePages.tsx`; both guides share
one screen, `pages/AdminGuide.tsx` (pick with `kind`). Same no-numbers rule,
except the 20% mortgage insurance line and "as little as 3% (conventional) /
3.5% (FHA) down for qualified buyers": Allison wants buyers to feel
homeownership is within reach. Never say or imply conventional needs a large
down payment.

**Guides can be sent as Allison or Rich** (2026-09-28): a "Sent from" switch
on the guide screen (`?from=rich`). The sender is a `Signer` (`ALLISON` /
`RICH` in `LoanSheetPages.tsx`) and drives the signature, logo row, apply QR,
contact line and fine print (`components/GuideParts.tsx`). Rich's copies never
show The Mattheis Team. His VA guide is written in his own voice as a Navy
veteran, not about him. Real estate pieces for Rich use the epic | eXp Realty
logo (he's eXp, not the luxury division); loan-only guides have no brokerage
logo. Any detail still null on `RICH` prints as a [placeholder].

## Still to do

- Both company logos — she uploads them in Settings › Branding
- Wiring Settings saves to the database (the screens work, saving needs Supabase)
- Print stylesheet
- Team management for her five people
- Saved lenders, so she picks a repeat lender instead of retyping
