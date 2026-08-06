# Getting set up

Hi Allison. This is the boring part, and it's the part you got stuck on. Do it once
and you never do it again.

You do **not** need to understand any of this. You're installing four things so that
Claude can do the work on your computer. That's it.

Take your time. Nothing here can break anything.

---

## What you're installing and why

| Thing | What it actually is |
|---|---|
| **Node** | The engine that runs the website on your computer |
| **Git** | The thing that saves your work and puts it online |
| **VS Code** | The window everything happens in |
| **Claude Code** | Claude, living inside VS Code |

The one that stopped you last night was Git. There are a hundred confusing
download pages for it. **There is exactly one correct link below.** Ignore
everything else you find by searching.

---

## Step 1 — Node

Go to **https://nodejs.org**

Click the big green button on the **left** that says **LTS**. Not the other one.

Open the file it downloads. Click Next through everything. Don't change any settings.

---

## Step 2 — Git

**Mac:** skip this. You already have it. Really.

**Windows:** go to **https://git-scm.com/download/win** and click
**"64-bit Git for Windows Setup"**.

Open the file. Click Next through **every single screen** without changing anything.
There are a lot of screens and they all look alarming. The defaults are correct.
Do not read them. Just click Next.

> This is where you went wrong before. There's no "a Git" to pick — the
> installer just asks a lot of questions you don't need to answer.

---

## Step 3 — VS Code

Go to **https://code.visualstudio.com** and click the big blue Download button.

Install it. Open it. It'll look empty and intimidating. That's normal.

---

## Step 4 — Claude Code

Inside VS Code, look at the **left edge** for an icon that looks like four small
squares (Extensions). Click it.

In the search box, type **Claude Code**. Click **Install** on the one by Anthropic.

Sign in when it asks.

---

## Step 5 — Get your project

In VS Code, press:

- **Windows:** `Ctrl` + `Shift` + `P`
- **Mac:** `Cmd` + `Shift` + `P`

A little box appears at the top. Type **git clone** and press Enter.

Paste in the link Dixon sent you, and press Enter. Pick a folder when it asks —
Documents is fine. When it says "would you like to open it," say **yes**.

---

## Step 6 — Turn it on

In VS Code's top menu: **Terminal → New Terminal**. A panel opens at the bottom.

Type this and press Enter:

```
cd app
```

Then this, and press Enter:

```
npm install
```

Wait. It'll print a lot of gibberish for a minute or two. That's fine.

Then:

```
npm run dev
```

It'll print a web address like `http://localhost:5199`. Hold **Ctrl** (or **Cmd**)
and click it.

**Your portal opens in your browser.** You're done.

To stop it, click in that terminal panel and press `Ctrl` + `C`.
To start it again later, it's just `npm run dev`.

---

## Step 7 — Actually using Claude

Open Claude Code in VS Code (the icon in the left bar, or `Ctrl`/`Cmd` + `Esc`).

Type what you want in plain English. You don't write code. You describe the change.

Real examples that work:

> Add a checklist step called "HOA approval received" after the survey steps

> Make the gold color a bit warmer

> The closing countdown should say "closing today!" instead of 0

> Add a spot for the buyer's mailing address in the contacts section

Claude makes the change and you refresh your browser to see it.

---

## When something goes wrong

**Tell Claude.** Copy whatever red text you see, paste it into Claude Code, and say
"this broke." That's the whole technique. It's what Dixon does.

You cannot permanently break this. Every version of your work is saved, and anything
can be undone.

---

## If you get truly stuck

Text Dixon. He set this up and can see exactly what you're looking at.
