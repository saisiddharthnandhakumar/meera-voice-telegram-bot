const { VOICE_SKILL } = require("./voice-skill");

const ANALYSIS_INSTRUCTION = `${VOICE_SKILL}

------------------------------------------------
NOTE ANALYSIS TASK
------------------------------------------------
Analyze the raw note below (not a finished post) and extract:

- core_idea: one sentence stating what Meera is actually trying to say.
- industry: the industry/market this note sits in.
- topics: 3-5 short topic tags relevant to the note.
- search_queries: 3-5 short, specific Google News search queries (2-5
  words each) designed to surface current news that could add useful
  context to this note. Do NOT just repeat the raw note as a query -
  extract the underlying industry/topic terms a journalist would use.

Return structured JSON only.`;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    core_idea: { type: "string" },
    industry: { type: "string" },
    topics: { type: "array", items: { type: "string" } },
    search_queries: { type: "array", items: { type: "string" } },
  },
  required: ["core_idea", "industry", "topics", "search_queries"],
};

async function analyzeNote(noteText) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || "gemini-flash-latest";
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const body = {
    system_instruction: { parts: [{ text: ANALYSIS_INSTRUCTION }] },
    contents: [
      { role: "user", parts: [{ text: `Note:\n\n${noteText}` }] },
    ],
    generationConfig: {
      temperature: 0.3,
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
    throw new Error("Gemini returned an empty analysis response");
  }

  const parsed = JSON.parse(raw);
  return {
    core_idea: String(parsed.core_idea || "").trim(),
    industry: String(parsed.industry || "").trim(),
    topics: Array.isArray(parsed.topics) ? parsed.topics.map(String) : [],
    search_queries: Array.isArray(parsed.search_queries)
      ? parsed.search_queries.slice(0, 5).map(String)
      : [],
  };
}

function generateSearchQueries(analysis) {
  return analysis.search_queries;
}

module.exports = { analyzeNote, generateSearchQueries };
