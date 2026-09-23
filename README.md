# Meera Pillai Voice — Telegram Automation

DM the bot a topic → it drafts a LinkedIn post in Meera Pillai's voice
(via Gemini, using `lib/voice-skill.js` + `lib/corpus.js` as the style
reference) → it posts the draft straight to the Skinstinct Telegram
channel, and confirms back to you.

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

### 4. Find your Telegram user ID (to lock ALLOWED_USER_IDS down)

Message the bot once with `ALLOWED_USER_IDS` left blank in Vercel, then
check the Vercel function logs for `message.from.id`, or message
`@userinfobot` on Telegram directly. Add that ID to `ALLOWED_USER_IDS` in
Vercel and redeploy so only you can trigger generation.

### 5. Add the bot to the target channel

The bot must be an **admin** (or at least a member with post permission)
of the channel/group behind `-1004403413050`, otherwise `sendMessage` to
that chat will fail with a 403.

## Using it

DM the bot (not the channel) with a topic, e.g.:

```
why label percentages for actives are meaningless without pH and delivery base
```

It replies "Drafting...", generates the post, sends it to the channel,
and confirms back to you with the final text.

## Local dev

There's no local server here (Vercel serverless functions are the
runtime) — test by deploying and messaging the real bot. If you want a
local loop, `vercel dev` (after `npm i -g vercel` and `vercel login`)
will serve `api/webhook.js` on localhost and you can point Telegram at it
via a tunnel (e.g. ngrok) instead of the production URL.
