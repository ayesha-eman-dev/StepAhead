import { NextRequest, NextResponse } from "next/server";
import type { Opportunity, StudentProfile, MatchResult } from "@/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RequestBody {
  opportunities: Opportunity[];
  profile: StudentProfile;
}

/** Gemini REST response envelope (minimal shape we care about). */
interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
}

/** A single recommendation item returned in the empty-opportunities fallback. */
export interface FallbackRecommendation {
  type: "platform" | "tip" | "action";
  title: string;
  body: string;
  url?: string;
}

/** A suggested opportunity object returned in the empty-opportunities fallback. */
export interface SuggestedOpportunity {
  title: string;
  organization: string;
  category: string;
  description: string;
  skills: string[];
  mode: string;
  location: string;
  applicationUrl?: string;
}

/** Shape returned when opportunities array is empty. */
export interface FallbackPayload {
  recommendations: FallbackRecommendation[];
  suggestedOpportunities: SuggestedOpportunity[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function geminiEndpoint(): string {
  const model = process.env.GEMINI_MODEL ?? "";
  const key = process.env.GEMINI_API_KEY ?? "";
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
}

/**
 * Fires a single Gemini generateContent request with a 20-second timeout.
 * Enforces JSON mode via generationConfig. Returns the raw text from
 * candidates[0] or null on any failure.
 */
async function callGemini(promptText: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);

  try {
    const res = await fetch(geminiEndpoint(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.2,
        },
      }),
    });

    if (!res.ok) {
      console.error("Gemini API Error Status:", res.status, await res.text());
      return null;
    }

    const data = (await res.json()) as GeminiResponse;
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
    return text;
  } catch (error) {
    console.error("Gemini fetch exception:", error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Extracts the first JSON array or object from a raw string using regex,
 * handling cases where models wrap output in markdown fences or prose.
 */
function extractJson(raw: string): string {
  const match = raw.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
  return match ? match[0] : raw;
}

/**
 * Safely parses JSON from a Gemini response string, using regex extraction
 * first to handle any residual fences or surrounding prose.
 * Returns null on any parse failure rather than throwing.
 */
function safeParseJson(raw: string): unknown {
  try {
    return JSON.parse(extractJson(raw));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Mode A — MatchResult batch prompt + chunking
// ---------------------------------------------------------------------------

function buildMatchPrompt(
  opportunities: Opportunity[],
  profile: StudentProfile,
): string {
  const oppPayload = opportunities.map((o) => ({
    id: o.id,
    title: o.title,
    skills: o.skills,
    interests: o.interests,
    category: o.category,
    location: o.location,
  }));

  return `You are a career-matching assistant for university students. Given the student profile and opportunity list below, return ONLY a valid JSON array — no markdown fences, no explanations, no extra text.

Each element must correspond to exactly one opportunity (same order as input) and use this exact shape:
{
  "opportunityId": "<copy id from input>",
  "relevance": "<Strong | Moderate | Light>",
  "summary": "<1 sentence match summary — plain text, max 120 chars, must mention at least one skill or field>",
  "note": "<1–2 sentences on fit — plain text, no markdown>",
  "missingSkills": ["<skill from opportunity not in student skills>"],
  "actionableAdvice": "<1 sentence career advice — name a specific library, project idea, or portfolio step tailored to the candidate's skill gaps>"
}

Rules:
- relevance "Strong": student skills and interests closely match the opportunity.
- relevance "Moderate": partial overlap.
- relevance "Light": weak or tangential match.
- missingSkills: skills in the opportunity's skills array absent from the student's skills array. Empty array if none.
- summary: ≤ 120 characters, must reference at least one skill or field from the opportunity.
- actionableAdvice: must name at least one specific library, tool, project idea, or portfolio improvement directly relevant to the student's degree and the opportunity's required skills. Maximum 40 words. No generic advice.
- Return exactly ${opportunities.length} elements — one per opportunity, in the same order.

Student profile:
${JSON.stringify(profile, null, 2)}

Opportunities (return one result per opportunity in this order):
${JSON.stringify(oppPayload, null, 2)}`;
}

/**
 * Validates and normalises a parsed Gemini response into MatchResult[].
 * Soft validation: coerces missing or invalid optional fields to sensible
 * defaults so a single bad field does not discard the entire batch.
 * Only returns null when the structure is fundamentally unrecoverable
 * (not an array, wrong length, or missing opportunityId).
 */
function validateMatchResults(
  parsed: unknown,
  expectedCount: number,
): MatchResult[] | null {
  if (!Array.isArray(parsed)) return null;
  if (parsed.length !== expectedCount) return null;

  const results: MatchResult[] = [];

  for (const item of parsed) {
    if (typeof item !== "object" || item === null) return null;

    const r = item as Record<string, unknown>;

    // opportunityId is load-bearing — must be a string
    if (typeof r.opportunityId !== "string") return null;

    // relevance — coerce invalid values to "Light"
    const relevance = ["Strong", "Moderate", "Light"].includes(r.relevance as string)
      ? (r.relevance as "Strong" | "Moderate" | "Light")
      : "Light";

    // summary — coerce to empty string if missing
    const summary = typeof r.summary === "string" ? r.summary : "";

    // note — coerce to empty string if missing
    const note = typeof r.note === "string" ? r.note : "";

    // missingSkills — coerce to empty array if missing or wrong type
    const missingSkills = Array.isArray(r.missingSkills)
      ? (r.missingSkills as unknown[]).filter((s): s is string => typeof s === "string")
      : [];

    // actionableAdvice — optional, coerce non-string to undefined
    const actionableAdvice =
      typeof r.actionableAdvice === "string" ? r.actionableAdvice : undefined;

    results.push({
      opportunityId: r.opportunityId,
      relevance,
      summary,
      note,
      missingSkills,
      ...(actionableAdvice !== undefined ? { actionableAdvice } : {}),
    });
  }

  return results;
}

/**
 * Splits opportunities into batches of at most `size`, calls Gemini
 * concurrently for each batch, and merges the MatchResult arrays.
 * Returns an empty array if any batch fails to parse correctly.
 */
async function batchMatchResults(
  opportunities: Opportunity[],
  profile: StudentProfile,
  batchSize = 8,
): Promise<MatchResult[]> {
  const chunks: Opportunity[][] = [];
  for (let i = 0; i < opportunities.length; i += batchSize) {
    chunks.push(opportunities.slice(i, i + batchSize));
  }

  const batchPromises = chunks.map(async (chunk) => {
    const prompt = buildMatchPrompt(chunk, profile);
    const raw = await callGemini(prompt);
    if (!raw) return null;
    const parsed = safeParseJson(raw);
    return validateMatchResults(parsed, chunk.length);
  });

  const batchResults = await Promise.all(batchPromises);

  // If any batch failed, return what we have (partial results are useful)
  const merged: MatchResult[] = [];
  for (const result of batchResults) {
    if (result !== null) {
      merged.push(...result);
    }
  }
  return merged;
}

// ---------------------------------------------------------------------------
// Mode B — Fallback recommendations prompt (empty opportunities)
// ---------------------------------------------------------------------------

function buildFallbackPrompt(profile: StudentProfile): string {
  return `You are a senior career advisor helping a university student in Pakistan who has just completed their profile but found no matching opportunities in their area right now.

Student profile:
- Degree: ${profile.degree}
- Field: ${profile.field}
- Semester: ${profile.semester}
- Skills: ${profile.skills.join(", ") || "not specified"}
- Interests: ${profile.interests.join(", ") || "not specified"}
- Preferred opportunity types: ${profile.preferredTypes.join(", ") || "any"}
- Preferred location: ${profile.preferredLocation || "flexible"}
- Preferred mode: ${profile.preferredMode || "flexible"}

Provide exactly 3 recommendations — one of each type, in this order:
1. type "platform" — name a top verified channel where this student can find opportunities right now (LinkedIn, PSEB, GitHub, Unstop, Rozee.pk, Kaggle, or similar). Include a direct URL.
2. type "tip" — give one actionable, field-specific tip on expanding skill keywords or broadening mode/location filters to surface more matches.
3. type "action" — give one immediate step the student can take this week to update their profile competencies or review open global remote programmes relevant to their field.

Also provide exactly 2 suggested opportunities — realistic roles or programmes this student could apply to given their profile.

Return ONLY a valid JSON object — no markdown fences, no explanations — in this exact shape:
{
  "recommendations": [
    {
      "type": "platform",
      "title": "<short title, max 60 chars>",
      "body": "<1–2 sentences. Professional, specific, actionable. Under 40 words.>",
      "url": "<direct URL to the platform>"
    },
    {
      "type": "tip",
      "title": "<short title, max 60 chars>",
      "body": "<1–2 sentences on expanding filters or skill keywords. Under 40 words.>"
    },
    {
      "type": "action",
      "title": "<short title, max 60 chars>",
      "body": "<1–2 sentences on an immediate profile or programme action. Under 40 words.>"
    }
  ],
  "suggestedOpportunities": [
    {
      "title": "<role or programme title>",
      "organization": "<plausible organization or company name>",
      "category": "<e.g. Internship | Research | Freelance | Competition | Fellowship>",
      "description": "<1–2 sentences max describing the opportunity and why it fits this student. Under 40 words.>",
      "skills": ["<relevant skill 1>", "<relevant skill 2>"],
      "mode": "<Remote | On-site | Hybrid>",
      "location": "<city or 'Remote'>",
      "applicationUrl": "<optional: a real or representative URL where similar roles are listed>"
    }
  ]
}

Requirements:
- Exactly 3 items in recommendations: one platform, one tip, one action — in that order.
- Exactly 2 items in suggestedOpportunities, each tailored to the student's degree, field, and skills.
- Tone: executive-level polish — direct, professional, never generic or patronising.
- Keep all text fields concise: body and description must be under 40 words each.
- Be specific to the student's field, skills, and Pakistani context where relevant.
- suggestedOpportunities must name recognizable organizations or well-known programme types.`;
}

function validateFallback(parsed: unknown): FallbackPayload | null {
  if (typeof parsed !== "object" || parsed === null) return null;

  const obj = parsed as Record<string, unknown>;

  // Validate recommendations
  if (!Array.isArray(obj.recommendations)) return null;
  if (obj.recommendations.length !== 3) return null;

  for (const item of obj.recommendations) {
    if (
      typeof item !== "object" ||
      item === null ||
      !["platform", "tip", "action"].includes(
        (item as Record<string, unknown>).type as string,
      ) ||
      typeof (item as Record<string, unknown>).title !== "string" ||
      typeof (item as Record<string, unknown>).body !== "string"
    ) {
      return null;
    }
  }

  // Validate suggestedOpportunities
  if (!Array.isArray(obj.suggestedOpportunities)) return null;
  if (obj.suggestedOpportunities.length !== 2) return null;

  for (const opp of obj.suggestedOpportunities) {
    if (
      typeof opp !== "object" ||
      opp === null ||
      typeof (opp as Record<string, unknown>).title !== "string" ||
      typeof (opp as Record<string, unknown>).organization !== "string" ||
      typeof (opp as Record<string, unknown>).category !== "string" ||
      typeof (opp as Record<string, unknown>).description !== "string" ||
      !Array.isArray((opp as Record<string, unknown>).skills) ||
      typeof (opp as Record<string, unknown>).mode !== "string" ||
      typeof (opp as Record<string, unknown>).location !== "string"
    ) {
      return null;
    }
  }

  return parsed as FallbackPayload;
}

// ---------------------------------------------------------------------------
// Route handler — single POST export
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Parse body
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json([]);
  }

  const { opportunities, profile } = body;

  // Basic shape guard
  if (!profile || typeof profile !== "object") {
    return NextResponse.json([]);
  }

  // -------------------------------------------------------------------------
  // Mode B: no opportunities — return fallback recommendations
  // -------------------------------------------------------------------------
  if (!Array.isArray(opportunities) || opportunities.length === 0) {
    const prompt = buildFallbackPrompt(profile);
    const raw = await callGemini(prompt);

    const empty: FallbackPayload = { recommendations: [], suggestedOpportunities: [] };

    if (!raw) return NextResponse.json(empty satisfies FallbackPayload);

    const parsed = safeParseJson(raw);
    if (!parsed) return NextResponse.json(empty satisfies FallbackPayload);

    const validated = validateFallback(parsed);
    if (!validated) return NextResponse.json(empty satisfies FallbackPayload);

    return NextResponse.json(validated);
  }

  // -------------------------------------------------------------------------
  // Mode A: opportunities provided — chunk into batches of 8, run concurrently
  // -------------------------------------------------------------------------
  const results = await batchMatchResults(opportunities, profile, 8);
  return NextResponse.json(results);
}
