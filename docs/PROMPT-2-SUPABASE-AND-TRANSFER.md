# Prompt 2 — database + moving the repo to her

Send when she's got the app running on demo data and is ready to make it real.

**Two steps need Dixon**, and the prompt tells her to text you at exactly the right
moments so she isn't left guessing:

1. **GitHub transfer.** Only the current owner can start it. When she texts you her
   GitHub username, go to
   `https://github.com/dixxxvhb/allison-portal/settings` → Danger Zone → Transfer,
   type her username, confirm. She then gets an email to accept.
2. **Nothing else.** Supabase is entirely hers and her Claude can drive it.

**After the transfer completes**, make the repo private — her client data model and
business workflow no longer need to be public, and the reason it was public (letting
her clone without a login) is gone.

---

Okay, the app is working on fake data. Now I want to make it real, and I want it all under my own accounts instead of my friend Dixon's.

Same rules as before: do everything you can yourself, and when you need me, stop and give me numbered plain-English steps and wait. Don't use words I won't know without explaining them.

There are two separate jobs. Do them in this order.

**JOB 1 — Give the app a real database so my work actually saves.**

I need a Supabase account. It's free. Walk me through signing up at supabase.com — I'll use my Google account. Then walk me through making a new project. Tell me what to pick for the region (I'm in Florida) and warn me about anything I'm about to click that I can't undo.

When the project exists, there are some database setup files in the project folder under supabase/migrations. Run them against my new project, in order, from 001 to 004. Figure out the best way to do that and tell me if you need me to click anything.

Then the app needs to know where my database is. It needs two values from my Supabase project settings. Tell me exactly where to find them and which file to paste them into — I'll do that part myself, you don't need to see them.

Important: there are several keys in that settings page. One of them is a secret admin key that must never go into this app. Tell me clearly which one I want and which one I must not touch, and check I've used the right one before we move on.

After that, restart the app. That yellow "demo data" banner at the top should be gone. I'll need to sign in with my email — set that up so it works, and tell me what to expect. The first time I sign in it should ask me to set up my workspace. Walk me through it and then confirm my checklists actually got created.

Then test it properly before telling me it's done: make a fake transaction, tick some boxes, refresh the page, and prove to me the changes stuck. If they didn't stick, fix it, don't explain it.

**JOB 2 — Move the code from Dixon's GitHub to mine.**

Right now the project lives in Dixon's GitHub account. I want it in mine.

Walk me through making a free GitHub account if I don't have one. Then tell me my username and tell me to text it to Dixon — he has to start the transfer from his side, I can't do it from mine. Then wait for me.

Dixon will start it and I'll get an email asking me to accept. Walk me through accepting it.

Once it's mine, the copy on my computer is still pointing at Dixon's old address. Fix that so it points at mine, and prove it worked by saving a small change and sending it up.

**A few things:**

- Don't put any passwords or keys in our chat. Tell me the file and I'll type them in.
- Don't spend money. Everything here should be free. If anything asks for a card, stop and tell me before I click.
- Don't delete anything of Dixon's.
- When it's all done, give me a short summary and tell me the one thing I should try next.

---

## What her Claude will hit

| Step | Needs her | Watch out |
|---|---|---|
| Supabase signup | Yes | Google sign-in, fast |
| New project | Yes | Database password gets generated — save it, she'll never see it again. Region: `us-east-1`. |
| Migrations 001–004 | Mostly no | Easiest path is pasting each file into the Supabase SQL editor in order. Order matters — 004 depends on functions from 002 and 003. |
| `.env.local` | Yes | **The anon/publishable key, never the service_role key.** service_role bypasses every RLS policy; in a browser app it would hand the whole database to anyone who opens dev tools. |
| Magic-link email | Maybe | Supabase's built-in email sender is rate-limited but fine for one user. |
| First sign-in | Yes | Hits the new one-time setup screen, which creates her team, brands, and all four checklists. |
| GitHub account | Yes | — |
| Transfer | **Dixon starts it** | She can only accept. |
| Remote update | No | `git remote set-url origin`. |

## Free-tier note worth telling her

A free Supabase project pauses after about a week with no activity. Client page views
count as activity, so a live deal keeps it awake. If she goes quiet between
transactions, the first client to open a link might hit a paused database and a slow
first load. Not a problem now; worth knowing before a client is the one who finds it.
