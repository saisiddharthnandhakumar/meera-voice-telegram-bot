const { VOICE_SKILL } = require("./voice-skill");

// Passing bar out of 10. Fixed editorial threshold, not per-environment
// config.
const SCORE_THRESHOLD = 6;

const SCORING_RUBRIC = `
------------------------------------------------
PUBLISHABILITY RUBRIC (score the RAW NOTE, not a finished post)
------------------------------------------------
You are scoring a rough note Meera just dropped into a capture channel —
not a draft. It has not been written yet. Judge only whether the
substance she provided is good enough to become a strong LinkedIn post in
her voice, not whether the note itself is well phrased. A one-sentence
note can still score highly if it names a real number and a clear angle;
a long note can still score low if it's vague throughout.

Score each axis 0, 1, or 2:

1. Specificity & Evidence — does the note contain (or clearly reference)
   a real number, mechanism, or verifiable fact, rather than only a vague
   opinion?
2. Structural/Narrative Fit — is there enough raw material here to fill
   one of her three recurring shapes: (A) misconception → mechanism →
   consequence → what to check, (B) personal anecdote → decision →
   present-day practice, or (C) data pattern → fix → before/after result?
   A note with no real story, mechanism, or data pattern behind it scores
   low here even if it's opinionated.
3. Contrarian/Non-Obvious Insight Value — does the note correct a
   misconception or surface something the industry doesn't say out loud,
   versus generic/obvious skincare advice?
4. Audience Relevance — is this on-brand for Skinstinct / formulation
   science / founder transparency — something her skincare-curious
   LinkedIn audience and customers would actually care about?
5. Actionability Potential — does the note contain or imply a concrete,
   specific action a reader could take (check a label, ask a supplier a
   specific question), rather than only an observation with no natural
   next step?

Return integer scores 0-2 for each axis and one or two sentences of
feedback identifying the weakest axis and what specific addition would
strengthen the note (e.g. "add the actual pH value" or "what did you
change and what changed as a result?"). Do not soften the feedback -
be direct, the way Meera would be.`;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    specificity: { type: "integer" },
    structural_fit: { type: "integer" },
    contrarian_value: { type: "integer" },
    audience_relevance: { type: "integer" },
    actionability: { type: "integer" },
    feedback: { type: "string" },
  },
  required: [
    "specificity",
    "structural_fit",
    "contrarian_value",
    "audience_relevance",
    "actionability",
    "feedback",
  ],
};

async function scoreNote(noteText) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || "gemini-flash-latest";
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const body = {
    system_instruction: {
      parts: [{ text: `${VOICE_SKILL}\n${SCORING_RUBRIC}` }],
    },
    contents: [
      {
        role: "user",
        parts: [{ text: `Score this note:\n\n${noteText}` }],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
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
  const raw = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? "";
  if (!raw.trim()) {
    throw new Error("Gemini returned an empty scoring response");
  }

  const parsed = JSON.parse(raw);
  const clamp = (n) => Math.max(0, Math.min(2, Math.round(Number(n) || 0)));

  const breakdown = {
    specificity: clamp(parsed.specificity),
    structural_fit: clamp(parsed.structural_fit),
    contrarian_value: clamp(parsed.contrarian_value),
    audience_relevance: clamp(parsed.audience_relevance),
    actionability: clamp(parsed.actionability),
  };

  const total = Object.values(breakdown).reduce((a, b) => a + b, 0);

  return { total, breakdown, feedback: String(parsed.feedback || "").trim() };
}

module.exports = { scoreNote, SCORE_THRESHOLD };
