# How to change things

Recipes for the stuff you'll actually want to change. Copy the bold line into
Claude Code and send it.

You don't need to open any files yourself. Claude does that part.

---

## Things you can do without Claude at all

These are built into the app. Just click.

### Add or remove a checklist step
Go to **Settings → Checklists**. Pick Buyer or Listing, pick Real Estate side or
Loan side, then add, rename, reorder, or delete steps. The **Has date / No date**
button controls whether that step gets a date next to it.

Changes apply to **new** transactions. Deals already in progress keep the checklist
they started with, so nothing shifts under you mid-deal.

### Build your seller checklist
Same screen. Click **Listing / Seller** → **Real Estate side**. It's empty because
only you know your listing workflow. Add your steps.

Leave the **Loan side** empty for listings and the whole Loan section disappears
from seller transactions, which is usually right.

### Upload your logos
**Settings → Branding.** Two sections, one per company.

Upload the version of your logo made for **dark backgrounds** — usually the white
or reversed file. If your brokerage doesn't allow its logo on dark at all, tick the
checkbox and the top bar becomes a light band instead.

### Change your brand colors
Same screen. Each company has an accent color. Paste the exact hex code from your
brand guidelines.

---

## Things to ask Claude for

### Change how something looks

> **Make the closing countdown number bigger on phones.**

> **The gold is too yellow. Make it warmer, closer to bronze.**

> **The address text is hard to read on light photos. Fix that.**

### Add a field

> **Add a "Buyer's mailing address" field to the contacts section.**

> **I need a place to put the MLS number on each transaction. Put it near the address.**

### Change what clients see

> **Hide the utility companies from the client view until closing is within 2 weeks.**

> **Add a short welcome message at the top that I can write per transaction.**

### Change the wording

> **Change "Funded!!" to "Congratulations, you own it!"**

> **The countdown should say "Closing today!" when it's zero days.**

### Something's wrong

> **The dates are showing one day early.**

> **This looks broken on my iPhone.** *(screenshot it and paste the picture in)*

---

## How to see your changes

Your terminal needs to be running `npm run dev`. Then just refresh the browser.
Most changes show up instantly without even refreshing.

To check the phone layout without a phone: in Chrome, right-click the page →
**Inspect** → click the little phone icon at the top left of the panel that opens.

---

## Saving your work and putting it online

> **Save my changes and put them live.**

Claude handles the rest. If you want to be careful, say:

> **Save my changes but don't put them live yet — I want to look first.**

---

## Two rules

**Never paste passwords, API keys, or client financial details into a chat.**
If Claude needs a key, it'll tell you which file to put it in yourself.

**When something breaks, paste the error.** Copy the red text, paste it, say "this
broke." That's the whole technique. You're not expected to diagnose anything.

---

## The one thing not to touch

Don't ask Claude to "let clients edit their own page" or "make the transaction data
public." The client link works because it's read-only and unguessable. Making it
writable or public would expose every client's information to every other client.

If you want a client to be able to send you something, ask for it the other way:

> **Add a way for clients to send me a note that only I can see.**
