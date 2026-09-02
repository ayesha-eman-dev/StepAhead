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

/** Shape returned when opportunities array is empty. */
export interface FallbackPayload {
  recommendations: FallbackRecommendation[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function geminiEndpoint(): string {
  const model = process.env.GEMINI_MODEL ?? "";
  const key = process.env.GEMINI_API_KEY ?? "";
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
}

/** Fires a single Gemini generateContent request with a 10-second timeout.
 *  Returns the raw text from candidates[0] or null on any failure.
 */
async function callGemini(promptText: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(geminiEndpoint(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }],
      }),
    });

    if (!res.ok) return null;

    const data = (await res.json()) as GeminiResponse;
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
    return text;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Strips markdown code fences (```json ... ``` or ``` ... ```) from a string. */
function stripCodeFences(raw: string): string {
  return raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
}

// ---------------------------------------------------------------------------
// Mode A — MatchResult batch prompt
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
  "note": "<1–2 plain-text sentences explaining the match — no markdown>",
  "missingSkills": ["<skill from opportunity not in student skills>"],
  "summary": "<plain text, max 120 chars, must mention at least one skill or field>"
}

Rules:
- relevance "Strong": student skills and interests closely match the opportunity.
- relevance "Moderate": partial overlap.
- relevance "Light": weak or tangential match.
- missingSkills: skills in the opportunity's skills array absent from the student's skills array. Empty array if none.
- summary: ≤ 120 characters, must reference at least one skill or field from the opportunity.
- Return exactly ${opportunities.length} elements — one per opportunity, in the same order.

Student profile:
${JSON.stringify(profile, null, 2)}

Opportunities (return one result per opportunity in this order):
${JSON.stringify(oppPayload, null, 2)}`;
}

function validateMatchResults(
  parsed: unknown,
  expectedCount: number,
): MatchResult[] | null {
  if (!Array.isArray(parsed)) return null;
  if (parsed.length !== expectedCount) return null;

  for (const item of parsed) {
    if (
      typeof item !== "object" ||
      item === null ||
      typeof (item as Record<string, unknown>).opportunityId !== "string" ||
      !["Strong", "Moderate", "Light"].includes(
        (item as Record<string, unknown>).relevance as string,
      ) ||
      typeof (item as Record<string, unknown>).note !== "string" ||
      !Array.isArray((item as Record<string, unknown>).missingSkills) ||
      typeof (item as Record<string, unknown>).summary !== "string"
    ) {
      return null;
    }
  }

  return parsed as MatchResult[];
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

Provide exactly 3 recommendations tailored to this student. Each recommendation must be one of:
- "platform": a specific external platform or website where they can find relevant opportunities (e.g. LinkedIn, Unstop, Rozee.pk, Internshala, PSEB portals, Kaggle, GitHub)
- "tip": a concrete, actionable career or skill-building tip relevant to their field
- "action": a specific next step they can take this week

Return ONLY a valid JSON object — no markdown fences, no explanations — in this exact shape:
{
  "recommendations": [
    {
      "type": "platform" | "tip" | "action",
      "title": "<short title, max 60 chars>",
      "body": "<2–3 sentences. Encouraging, highly professional, executive tone. Specific and actionable.>",
      "url": "<optional: direct URL if type is platform, omit otherwise>"
    }
  ]
}

Requirements:
- Exactly 3 items in the recommendations array.
- Tone: encouraging, highly professional, polished executive — never generic or patronising.
- Be specific to the student's field, skills, and Pakistani context where relevant.
- If suggesting platforms, prefer those with significant Pakistani student user bases or remote-friendly listings.`;
}

function validateFallback(parsed: unknown): FallbackPayload | null {
  if (typeof parsed !== "object" || parsed === null) return null;

  const obj = parsed as Record<string, unknown>;
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

  return parsed as FallbackPayload;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1. Parse body
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json([]);
  }

  const { opportunities, profile } = body;

  // Basic shape guards
  if (!profile || typeof profile !== "object") {
    return NextResponse.json([]);
  }

  // -------------------------------------------------------------------------
  // Mode B: empty opportunities — return fallback recommendations
  // -------------------------------------------------------------------------
  if (!Array.isArray(opportunities) || opportunities.length === 0) {
    const prompt = buildFallbackPrompt(profile);
    const raw = await callGemini(prompt);

    if (!raw) {
      return NextResponse.json({ recommendations: [] } satisfies FallbackPayload);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(stripCodeFences(raw));
    } catch {
      return NextResponse.json({ recommendations: [] } satisfies FallbackPayload);
    }

    const validated = validateFallback(parsed);
    if (!validated) {
      return NextResponse.json({ recommendations: [] } satisfies FallbackPayload);
    }

    return NextResponse.json(validated);
  }

  // -------------------------------------------------------------------------
  // Mode A: opportunities provided — return MatchResult[]
  // -------------------------------------------------------------------------
  if (!Array.isArray(opportunities)) {
    return NextResponse.json([]);
  }

  const prompt = buildMatchPrompt(opportunities, profile);
  const raw = await callGemini(prompt);

  if (!raw) return NextResponse.json([]);

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFences(raw));
  } catch {
    return NextResponse.json([]);
  }

  const validated = validateMatchResults(parsed, opportunities.length);
  if (!validated) return NextResponse.json([]);

  return NextResponse.json(validated);
}
