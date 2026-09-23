const { generateDraft } = require("../lib/gemini");
const { sendMessage } = require("../lib/telegram");

const START_TEXT =
  "Send me a topic or brief (e.g. \"reformulating for humid climates\" or " +
  "\"why we don't publish clinical trial data yet\") and I'll draft a " +
  "LinkedIn post in Meera's voice and post it to the Skinstinct channel.";

function isAuthorized(userId) {
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

  // Always ack Telegram with 200 quickly-ish; we still await the work below
  // since this is low-traffic personal use, but any error must not surface
  // as a Telegram retry loop.
  try {
    const update = req.body || {};
    const message = update.message;

    if (!message || typeof message.text !== "string") {
      res.status(200).send("ok");
      return;
    }

    const senderChatId = message.chat.id;
    const senderId = message.from && message.from.id;
    const text = message.text.trim();

    if (!isAuthorized(senderId)) {
      res.status(200).send("ok");
      return;
    }

    if (text === "/start" || text === "/help") {
      await sendMessage(senderChatId, START_TEXT);
      res.status(200).send("ok");
      return;
    }

    await sendMessage(senderChatId, "Drafting...");

    const draft = await generateDraft(text);

    const targetChatId = process.env.TARGET_CHAT_ID;
    await sendMessage(targetChatId, draft);
    await sendMessage(senderChatId, "Posted to the channel:\n\n" + draft);

    res.status(200).send("ok");
  } catch (err) {
    console.error(err);
    try {
      const update = req.body || {};
      const senderChatId = update.message && update.message.chat.id;
      if (senderChatId) {
        await sendMessage(
          senderChatId,
          "Something went wrong generating that draft: " + err.message
        );
      }
    } catch (_) {
      // swallow secondary failures, we already logged the original error
    }
    res.status(200).send("ok");
  }
};
