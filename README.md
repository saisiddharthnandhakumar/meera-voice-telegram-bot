# Meera Pillai Voice — Telegram Automation

Drop a raw note into the capture channel (`-1004403413050`) → the bot
drafts a LinkedIn post in Meera Pillai's voice (via Gemini, using
`lib/voice-skill.js` + `lib/corpus.js` as the style reference) → the
finished draft is posted back into that same channel.

## How it works

- `api/webhook.js` — Vercel serverless function; Telegram calls this on
  every message sent to the bot.
- `lib/voice-skill.js` — the Voice DNA / generation rules.
- `lib/corpus.js` — the 15-piece source corpus, used as few-shot style
  reference.
- `lib/gemini.js` — calls the Gemini API with the above as system
  instruction.
- `lib/telegram.js` — thin wrapper around the Telegram Bot API.

## One-time setup

### 1. Push to GitHub, import into Vercel

Already done if you're reading this from the deployed repo. If not:

```bash
git init && git add . && git commit -m "Initial commit"
gh repo create <name> --private --source=. --push
```

Then in the Vercel dashboard: **Add New → Project → Import** the GitHub
repo.

### 2. Set environment variables in Vercel

Project → Settings → Environment Variables. Add all of these
(`.env.example` documents each one):

| Key | Value |
|---|---|
| `TELEGRAM_BOT_TOKEN` | your bot token from @BotFather |
| `TARGET_CHAT_ID` | `-1004403413050` |
| `GEMINI_API_KEY` | your Gemini API key |
| `GEMINI_MODEL` | `gemini-2.5-flash` (or another Gemini model) |
| `TELEGRAM_WEBHOOK_SECRET` | any random string you invent |
| `ALLOWED_USER_IDS` | your Telegram numeric user ID (see below) |

Redeploy after adding them (Vercel doesn't hot-reload env vars into a
running deployment).

### 3. Point Telegram at the deployed URL

Locally, with a `.env` file (copy `.env.example` → `.env` and fill in
`TELEGRAM_BOT_TOKEN` + `TELEGRAM_WEBHOOK_SECRET` — the same values you put
in Vercel):

```bash
npm run set-webhook -- https://<your-project>.vercel.app
```

Verify it took:

```bash
npm run get-webhook-info
```

### 4. Add the bot to the capture channel

The bot must be a **member with post/read permission** (admin, if it's a
broadcast channel rather than a group) of the chat behind
`-1004403413050` — otherwise it never sees messages posted there, and
`sendMessage` back to that chat will fail with a 403.

### 5. (Optional) Restrict who can trigger generation

`ALLOWED_USER_IDS` only applies to messages that carry a `from.id` (i.e.
a regular group/supergroup). Leave it blank while testing; if you want to
lock it down later, find your numeric Telegram user ID via
`@userinfobot`, add it to `ALLOWED_USER_IDS` in Vercel, and redeploy.

## Using it

Post a raw note/topic directly into the capture channel, e.g.:

```
why label percentages for actives are meaningless without pH and delivery base
```

The bot reads it, generates the post, and replies in the same channel
with the finished draft — no DM step, no separate command.

## Local dev

There's no local server here (Vercel serverless functions are the
runtime) — test by deploying and messaging the real bot. If you want a
local loop, `vercel dev` (after `npm i -g vercel` and `vercel login`)
will serve `api/webhook.js` on localhost and you can point Telegram at it
via a tunnel (e.g. ngrok) instead of the production URL.
