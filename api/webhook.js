const { generateDraft } = require("../lib/gemini");
const { scoreNote, SCORE_THRESHOLD } = require("../lib/scoring");
const { sendMessage } = require("../lib/telegram");

const AXIS_LABELS = {
  specificity: "Specificity",
  structural_fit: "Structural fit",
  contrarian_value: "Contrarian value",
  audience_relevance: "Audience relevance",
  actionability: "Actionability",
};

function formatRejection(total, breakdown, feedback) {
  const line = Object.entries(breakdown)
    .map(([key, val]) => `${AXIS_LABELS[key]} ${val}/2`)
    .join(" · ");
  return `Score: ${total}/10 — not quite there yet.\n\n${line}\n\n${feedback}`;
}

function isAuthorizedUser(userId) {
  const allowList = (process.env.ALLOWED_USER_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (allowList.length === 0) return true;
  return allowList.includes(String(userId));
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(200).send("ok");
    return;
  }

  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (expectedSecret) {
    const gotSecret = req.headers["x-telegram-bot-api-secret-token"];
    if (gotSecret !== expectedSecret) {
      res.status(401).send("unauthorized");
      return;
    }
  }

  try {
    const update = req.body || {};
    // A regular group/supergroup delivers "message"; a broadcast channel
    // delivers "channel_post" instead. Support both.
    const post = update.message || update.channel_post;

    if (!post || typeof post.text !== "string") {
      res.status(200).send("ok");
      return;
    }

    const chatId = post.chat.id;
    const targetChatId = process.env.TARGET_CHAT_ID;
    const text = post.text.trim();

    // Only react inside the configured capture channel, and only to the
    // note text itself (not commands, not the bot's own replies).
    if (String(chatId) !== String(targetChatId)) {
      res.status(200).send("ok");
      return;
    }
    if (text.startsWith("/")) {
      res.status(200).send("ok");
      return;
    }
    if (post.from && !isAuthorizedUser(post.from.id)) {
      res.status(200).send("ok");
      return;
    }

    const { total, breakdown, feedback } = await scoreNote(text);

    if (total < SCORE_THRESHOLD) {
      await sendMessage(chatId, formatRejection(total, breakdown, feedback));
      res.status(200).send("ok");
      return;
    }

    const draft = await generateDraft(text);
    await sendMessage(chatId, draft);

    res.status(200).send("ok");
  } catch (err) {
    console.error(err);
    try {
      const update = req.body || {};
      const post = update.message || update.channel_post;
      const chatId = post && post.chat.id;
      if (chatId) {
        await sendMessage(
          chatId,
          "Something went wrong generating that draft: " + err.message
        );
      }
    } catch (_) {
      // swallow secondary failures, we already logged the original error
    }
    res.status(200).send("ok");
  }
};
