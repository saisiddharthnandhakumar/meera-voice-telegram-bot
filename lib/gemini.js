const { VOICE_SKILL } = require("./voice-skill");
const { CORPUS } = require("./corpus");

const SYSTEM_INSTRUCTION = `${VOICE_SKILL}

------------------------------------------------
FULL SOURCE CORPUS (verbatim, for style reference only — never copy a
sentence from it into a new draft; it demonstrates voice, not content to
reuse)
------------------------------------------------
${CORPUS}

------------------------------------------------
OUTPUT FORMAT
------------------------------------------------
Return ONLY the finished draft text (no preamble like "Here's a draft",
no markdown headers, no quotation marks around it, no commentary about the
Voice Fidelity Check). If the request lacks a real number/statistic the
post would need and the user didn't supply one, write the post around
what's known and note in the draft's own words that a specific figure
should be confirmed before publishing, rather than inventing a number.`;

async function generateDraft(topic) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const body = {
    system_instruction: {
      parts: [{ text: SYSTEM_INSTRUCTION }],
    },
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `Write a LinkedIn post for Meera on this topic/brief:\n\n${topic}`,
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.8,
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? "";
  if (!text.trim()) {
    throw new Error("Gemini returned an empty response");
  }
  return text.trim();
}

module.exports = { generateDraft };
