# Meera Pillai Voice — Telegram Automation

Drop a raw note into the capture channel (`-1004403413050`) →

1. Gemini scores it against a 5-axis publishability rubric. Below 6/10:
   rejected with feedback, nothing else runs.
2. Gemini extracts the core idea, industry, and 3–5 Google News search
   queries from the note.
3. Those queries are run against Google News RSS in parallel, results are
   deduped, and a single Gemini call scores every candidate article for
   genuine relevance (never just the first result).
4. If (and only if) something clears the relevance bar, it's handed to
   drafting as supporting context — the note is always the primary
   source, never the news.
5. Gemini drafts a LinkedIn post in Meera Pillai's voice (using
   `lib/voice-skill.js` + `lib/corpus.js` as the style reference, plus the
   note + core idea + optional news context).
6. The finished draft — with a news-source verification block appended
   if news was used — is posted back into that same channel.

## How it works

- `api/webhook.js` — Vercel serverless function; Telegram calls this on
  every message. Orchestrates the pipeline above end to end.
- `lib/scoring.js` — the publishability rubric (5 axes, 0–10, pass at 6)
  and `scoreNote()`, judging the raw note's substance, not its phrasing.
- `lib/note-analysis.js` — `analyzeNote()` extracts the core idea,
  industry, topics, and Google News search queries from a passing note.
- `lib/google-news.js` — `fetchGoogleNews()` / `parseRSS()` (hand-rolled,
  no dependency) pull and normalize Google News RSS results;
  `rankNewsRelevance()` scores every candidate in one batched Gemini
  call; `selectNews()` picks the best one above the relevance bar
  (**7/10** — stricter than the note-scoring bar, since a weak match is
  worse than none), preferring articles from the last 7 days.
- `lib/voice-skill.js` — the Voice DNA / generation rules.
- `lib/corpus.js` — the 15-piece source corpus, used as few-shot style
  reference.
- `lib/gemini.js` — `draftLinkedInPost()`, the final drafting call: takes
  the note, core idea, and optional news article, returns the post text
  only.
- `lib/telegram.js` — thin wrapper around the Telegram Bot API.

### The scoring rubric

Each note is scored 0–2 on five axes (10 total), pass at **6/10**:

1. **Specificity & Evidence** — a real number, mechanism, or verifiable
   fact, not just an opinion.
2. **Structural/Narrative Fit** — enough material to fill one of her
   three recurring shapes (misconception→mechanism→consequence→ask;
   anecdote→decision→practice; data pattern→fix→result).
3. **Contrarian/Non-Obvious Insight Value** — corrects a misconception or
   surfaces something the industry doesn't say out loud.
4. **Audience Relevance** — on-brand for Skinstinct / formulation science
   / founder transparency.
5. **Actionability Potential** — implies a concrete action a reader could
   take, not just an observation.

Below 6/10, the bot replies with the score, a per-axis breakdown, and
specific feedback on what would strengthen the note — no draft is
generated.

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
| `GEMINI_MODEL` | `gemini-flash-latest` (or another Gemini model) |
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

The bot reads it, scores it, researches it, drafts the post, and replies
in the same channel with the finished draft — no DM step, no separate
command. No new env vars or API keys are needed for the news layer —
Google News RSS is keyless and everything else reuses `GEMINI_API_KEY`.

## Local dev

There's no local server here (Vercel serverless functions are the
runtime) — test by deploying and messaging the real bot. If you want a
local loop, `vercel dev` (after `npm i -g vercel` and `vercel login`)
will serve `api/webhook.js` on localhost and you can point Telegram at it
via a tunnel (e.g. ngrok) instead of the production URL.
