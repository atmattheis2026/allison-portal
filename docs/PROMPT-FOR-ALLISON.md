# The prompt to send Allison

Send her the block below. She opens Claude Code and pastes the whole thing as her
first message.

**Before sending:** replace `<REPO URL>` with the real clone URL. If the repo is
private she can't clone it without authenticating, which is a wall for her — make it
public for setup (there are no keys or client data in it; `.env.local` is gitignored)
and flip it private later once she's signed in to GitHub.

---

I'm Allison. I'm a realtor, not a programmer — I've never used a terminal and I don't know any coding words. A friend built me a web app and I need to get it running on my Mac. This is my first time using you.

Please set this up for me. Here's how I need you to work:

- Do everything you possibly can yourself. Don't hand me a list of things to go do.
- When you genuinely need me to do something you can't (type my password, click a button in a system window, download something from a website), STOP and give me numbered steps in plain English. Tell me exactly what to click and what it should look like when it worked. Then wait for me to say I'm done.
- Never assume I know a word. No "repo," "dependencies," "CLI," "package manager" unless you explain it in the same sentence.
- If something fails, don't explain the error to me. Just fix it, or tell me the one thing you need from me to fix it.
- Check your own work. Don't tell me it's done until you've confirmed it's actually running.

Here's what needs to happen:

1. Figure out what's already on my Mac and what's missing. I most likely have nothing set up.
2. I need git and Node. Install whatever's missing. If installing needs my password or needs me to click through an installer window, walk me through it one step at a time.
3. Download the project from here: <REPO URL>
   Put it somewhere sensible in my Documents folder.
4. Install what the project needs, then start it.
5. Open it in my browser so I can actually see it, and tell me what I'm looking at.
6. Read the CLAUDE.md file inside the project — it has notes from my friend about how the app works and what not to break. Also read SETUP.md and docs/HOW-TO-CHANGE-THINGS.md so you know what I've already been told.

The app is a transaction portal for my real estate business. It runs on fake sample data right now, on purpose, so it should work immediately without any database or passwords.

Two things to know:
- Don't ask me to create any accounts or sign up for anything. My friend is handling all of that.
- If you ever need a password or a key from me, tell me which file to put it in and I'll do it myself. Don't ask me to type it into the chat.

When everything's running, give me a short summary of what you did and what I can try next. Keep it to a few sentences.

---

## What she'll hit, and what her Claude should handle

| Step | Needs her | What it looks like |
|---|---|---|
| Xcode command line tools | Yes | A macOS window pops up asking to install. She clicks Install and waits several minutes. This is how she gets git. |
| Homebrew (if used) | Yes | Wants her Mac password in the terminal. Typing shows nothing on screen — that's normal and she'll think it's broken. |
| Node | Maybe | Via Homebrew it's automatic. Via the nodejs.org installer she double-clicks and clicks Next. |
| Clone | No | Works unauthenticated if the repo is public. |
| `npm install` | No | A minute of scrolling text. |
| `npm run dev` | No | Prints a localhost URL. |

The invisible-password thing is the most likely place she panics. Worth texting her
that one detail directly before she starts.
