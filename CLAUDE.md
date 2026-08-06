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
        Login.tsx         magic-link sign in          /login
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

## Still to do

- Seller checklist — she builds it herself in Settings › Checklists
- Both company logos — she uploads them in Settings › Branding
- Print stylesheet
- Team management for her five people
- New-transaction creation flow
