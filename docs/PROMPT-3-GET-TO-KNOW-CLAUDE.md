# Prompt 3 — teaching Claude who she is

Not about the portal. This is the "here's what this thing can actually do for you"
prompt — the six months of learning, compressed.

Send it when the portal is settled and she's got twenty quiet minutes. It's a
conversation, not a task, and it works badly if she's rushing.

**Design notes, in case this gets edited later:**

- It makes Claude **check what's actually available** before promising anything. A new
  user forgives "let me look" and never forgives a feature that doesn't exist.
- It asks Claude to **show one thing working before explaining anything.** Proof beats
  a roadmap.
- Questions come **a few at a time.** A 20-question intake form gets abandoned.
- It ends at **three things**, not twenty. She can come back for more.
- The **fair housing** guardrail is the single most valuable thing in here. An LLM
  writing listing copy or buyer-matching notes will cheerfully produce steering
  language that violates the Fair Housing Act. Baking that into her rules file on day
  one is worth more than any automation.
- Same for **client privacy** — realtors handle SSNs, bank statements, and pay stubs.
  She needs to know where that can and cannot go before she finds out the hard way.

---

Hi. I'm Allison. I'm a realtor in Central Florida and I just got my first app built with your help, which blew my mind a little. Now I want to know what else you can actually do for me, because I suspect I'm using about 2% of you.

I'm not technical. Explain things like you're talking to a smart friend who has never opened a terminal. No jargon without a plain-English translation in the same breath.

Please work through this in order, and take your time.

**FIRST — show me one thing, right now.**

Before you explain anything, do something small and genuinely useful, and show me the result. Your pick. I want to see it work before I hear what's possible.

**SECOND — tell me what you can actually do here.**

Not what Claude can do in general. What YOU can do, right now, on my Mac, with what's actually set up. Go look. Then tell me plainly:

- What you can do today with no setup
- What you could do if I connect something (and what "connect" means)
- What you genuinely can't do

If you're not sure whether something's available, say so instead of guessing. I'd rather hear "let me check" than be told something works and find out it doesn't.

**THIRD — get to know me.**

Interview me. Ask a few questions at a time, not a giant list, and actually respond to my answers before moving on. Make it feel like a conversation.

Cover both sides of my life:

- How I actually work day to day. What software I use, what my week looks like, what parts of my job I dread, what I do over and over, what falls through the cracks. My clients, my team, how I get business.
- Me. What I care about, what I'm bad at remembering, how I like to be talked to, what a good day looks like, what's going on outside of work.

Ask about the boring stuff too. The repetitive annoying tasks are usually where you'd help me most, and I probably won't think to mention them.

If something I say sounds like a problem you could solve, say so right then. Don't save it all for the end.

**FOURTH — write it down so you remember.**

Once you know me, set up whatever makes you remember all this next time I talk to you, so I never have to explain myself twice. Save what you learned about how I work and how I want to be talked to.

Then build me a set of standing rules for working with me. Ask me about anything you're unsure of rather than assuming.

Two things I want in those rules no matter what:

**Fair housing.** If you ever help me write listing descriptions, ads, or notes about buyers, you cannot use language that describes or steers by race, color, religion, sex, disability, familial status, or national origin. That includes the sneaky stuff — "perfect for a young family," "safe neighborhood," "walking distance to churches," describing who lives somewhere. This is a real law I can lose my license over. Flag anything questionable instead of just writing it, every single time, even when I'm in a hurry and pushing you to just get it done.

**Client privacy.** My work involves social security numbers, bank statements, pay stubs, and people's finances. Tell me clearly what's safe to share with you and what isn't, and where the line is. Then put a rule in place so you warn me if I'm about to paste something I shouldn't. I'd rather be annoyed than sorry.

**FIFTH — set up three things that will actually help me.**

Based on what you learned, pick the three highest-payoff things and set them up now. Not a plan. Actually set them up, then show me each one working.

Bias toward things that help this week over things that are impressive. If one of them is boring but saves me an hour every Monday, that's the right pick.

If any of them need me to connect an account or click something, walk me through it one step at a time.

**SIXTH — tell me what's next.**

Give me a short list — no more than five — of other things worth doing, roughly ordered by how much they'd help me versus how much hassle they'd be. One sentence each. I'll pick from it later.

Then tell me the single most useful habit I could build with you. Just one.

**Ground rules:**

- Don't spend any money or sign me up for anything paid. If something costs, stop and tell me first.
- Don't send an email, text, or message as me without showing it to me and getting a yes.
- Don't put my passwords or client details in our chat. Tell me where to put them and I'll do it myself.
- If I ask for something that's a bad idea, tell me in one sentence and offer the better version. Don't lecture me.
- I'm on the Pro plan, so I have limits. If something's going to eat a lot of my usage, say so first and offer the cheaper way.

Start with the first thing. Show me something working.

---

## What to tell her out loud

Two things the prompt can't do for her:

1. **It's a conversation.** If she treats it like a form to fill out, she gets a form's
   worth of value. If she actually talks to it, it gets good.
2. **She can interrupt it.** New users sit politely through output they don't want.
   Tell her to just start typing.

## Realtor connectors worth knowing about

Her Claude should surface what's actually available, but for reference, the ones that
tend to matter for an agent: Google Calendar and Gmail (showings, deadlines, client
threads), Google Drive (contracts, disclosures), and whatever her brokerage uses for
transaction management. MLS almost certainly has no integration — don't let her expect
one.

The highest-payoff realtor automations are usually unglamorous: deadline math from a
contract date, chasing missing documents, drafting the same six client update emails,
and turning a signed contract into a populated checklist. That last one is her portal.
