const { VOICE_SKILL } = require("./voice-skill");

// Deliberately stricter than the note-scoring threshold: the relevance
// prompt itself instructs the model to reserve 7+ for genuine strength
// and keep weak/coincidental matches at 0-3, so 7 is the bar that matches
// what the model was actually asked to mean by its own score.
const RELEVANCE_THRESHOLD = 7;
const FRESHNESS_WINDOW_DAYS = 7;
const MAX_CANDIDATES = 15;

function buildNewsUrl(query) {
  const q = encodeURIComponent(query);
  return `https://news.google.com/rss/search?q=${q}&hl=en-IN&gl=IN&ceid=IN:en`;
}

// Never throws - a bad query/network failure degrades to "no results"
// rather than aborting the whole pipeline.
async function fetchGoogleNews(query) {
  try {
    const res = await fetch(buildNewsUrl(query));
    if (!res.ok) {
      return { ok: false, query, error: `HTTP ${res.status}` };
    }
    const xml = await res.text();
    return { ok: true, query, xml };
  } catch (err) {
    return { ok: false, query, error: err.message };
  }
}

function decodeEntities(str) {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripHtml(str) {
  // The description field arrives as XML-escaped HTML (&lt;a href=...&gt;),
  // so entities must be decoded into real "<" characters before the tag
  // strip regex has anything to match.
  return decodeEntities(str).replace(/<[^>]*>/g, "").trim();
}

function extractTag(itemXml, tag) {
  const match = itemXml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return match ? match[1].trim() : null;
}

// Hand-rolled parser for Google News RSS (verified against a live
// response: plain-escaped XML, not CDATA-wrapped). Every field resolves
// to null rather than throwing if missing.
function parseRSS(xmlText) {
  if (!xmlText) return [];
  const itemBlocks = xmlText.match(/<item>[\s\S]*?<\/item>/g) || [];

  return itemBlocks.map((block) => {
    const rawTitle = extractTag(block, "title");
    const link = extractTag(block, "link");
    const pubDate = extractTag(block, "pubDate");
    const rawDescription = extractTag(block, "description");
    const sourceMatch = block.match(/<source[^>]*>([\s\S]*?)<\/source>/i);

    return {
      title: rawTitle ? decodeEntities(rawTitle).trim() : null,
      source: sourceMatch ? decodeEntities(sourceMatch[1]).trim() : null,
      published_at: pubDate || null,
      url: link ? link.trim() : null,
      description: rawDescription ? stripHtml(rawDescription) : null,
    };
  });
}

function dedupeByUrl(articles) {
  const seen = new Set();
  const result = [];
  for (const article of articles) {
    if (!article.url || seen.has(article.url)) continue;
    seen.add(article.url);
    result.push(article);
  }
  return result;
}

const RELEVANCE_INSTRUCTION = `${VOICE_SKILL}

------------------------------------------------
NEWS RELEVANCE TASK
------------------------------------------------
You'll be given Meera's raw note, the core idea extracted from it, and a
list of candidate news articles. Score each article 0-10 on how
genuinely useful it would be as SUPPORTING context for a LinkedIn post
built primarily from the note (never as the main story). Judge:

1. Topic relevance to the note
2. Industry relevance to Skinstinct/skincare/formulation
3. Insight relevance - does it add real context, evidence, contrast, or
   a trend, not just a loose word match
4. Recency
5. Credibility of the source
6. Whether the connection to Meera's idea is natural, not forced

A weak/coincidental connection must score low (0-3). Only score 7+ if the
article would genuinely strengthen the post without distorting Meera's
original point. Return one entry per article, in the same order given,
each with relevance_score (integer 0-10) and a one-sentence reason.`;

const RANK_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    scores: {
      type: "array",
      items: {
        type: "object",
        properties: {
          relevance_score: { type: "integer" },
          reason: { type: "string" },
        },
        required: ["relevance_score", "reason"],
      },
    },
  },
  required: ["scores"],
};

async function rankNewsRelevance(note, coreIdea, articles) {
  const candidates = articles.slice(0, MAX_CANDIDATES);
  if (candidates.length === 0) return [];

  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || "gemini-flash-latest";
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const articleList = candidates
    .map(
      (a, i) =>
        `${i + 1}. "${a.title}" - ${a.source || "unknown source"} (${a.published_at || "unknown date"})\n${a.description || ""}`
    )
    .join("\n\n");

  const body = {
    system_instruction: { parts: [{ text: RELEVANCE_INSTRUCTION }] },
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `Note:\n${note}\n\nCore idea:\n${coreIdea}\n\nCandidate articles:\n${articleList}`,
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
      responseSchema: RANK_RESPONSE_SCHEMA,
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const raw = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? "";
  if (!raw.trim()) throw new Error("Gemini returned an empty relevance response");

  const parsed = JSON.parse(raw);
  const scores = Array.isArray(parsed.scores) ? parsed.scores : [];

  return candidates.map((article, i) => ({
    ...article,
    relevance_score: Math.max(0, Math.min(10, Math.round(Number(scores[i]?.relevance_score) || 0))),
    reason: String(scores[i]?.reason || "").trim(),
  }));
}

function selectNews(rankedArticles) {
  const now = Date.now();
  const isRecent = (article) => {
    if (!article.published_at) return false;
    const t = Date.parse(article.published_at);
    if (Number.isNaN(t)) return false;
    return now - t <= FRESHNESS_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  };

  const passing = rankedArticles.filter((a) => a.relevance_score >= RELEVANCE_THRESHOLD);
  if (passing.length === 0) {
    return { found: false, reason: "No sufficiently relevant recent news found." };
  }

  const recent = passing.filter(isRecent).sort((a, b) => b.relevance_score - a.relevance_score);
  const older = passing.filter((a) => !isRecent(a)).sort((a, b) => b.relevance_score - a.relevance_score);

  const best = recent[0] || older[0];
  return { found: true, article: best, isRecent: recent.length > 0 };
}

module.exports = {
  buildNewsUrl,
  fetchGoogleNews,
  parseRSS,
  dedupeByUrl,
  rankNewsRelevance,
  selectNews,
  RELEVANCE_THRESHOLD,
  FRESHNESS_WINDOW_DAYS,
};
