# StepAhead — Project Context (locked — do not deviate without asking)

## Stack (fixed, no substitutions)
- Next.js 14, App Router, TypeScript, Tailwind CSS. One repo, frontend + API routes together.
- No database. No auth/login.
- Opportunity data: static `/data/opportunities.json`.
- Student profile: browser `localStorage` only (key: `stepahead_profile`), never sent anywhere except in-request to `/api/relevance`.
- AI: Google Gemini, called only from `/app/api/relevance/route.ts`. Model name from `process.env.GEMINI_MODEL`, key from `process.env.GEMINI_API_KEY`. Never hardcode either.
- Deploy target: Vercel.

## Core data types (see /types/index.ts once created)
- `Opportunity`: id, title, organization, category, shortDescription, fullDescription, skills[], interests[], eligibility, location, mode, deadline, isFree, applicationUrl, sourceStatus ("verified"|"seeded"), sourceNote?
- `StudentProfile`: degree, field, semester, skills[], interests[], preferredTypes[], preferredLocation, preferredMode
- `MatchResult`: { opportunityId: string, relevance: "Strong"|"Moderate"|"Light", note: string, missingSkills: string[], summary: string } — the exact shape `/api/relevance` returns. All fields present only when the AI call succeeds; on failure the route returns `[]`, never partial/fabricated fields.

## Locations
- Location values include the existing global/remote options plus Pakistani tech hubs: Lahore, Karachi, Islamabad (extendable). Defined in `/lib/locations.ts`, imported wherever a location list is needed (filters, matching logic). This file is the single place new locations get added — no other file should hardcode its own location list.
- The Onboarding page's own location field is NOT to be edited directly; if it currently hardcodes locations rather than importing from `/lib/locations.ts`, that's a flagged pre-execution note, not something to fix automatically.

## Two separate scoring signals — never merge these
1. **Compatibility Score** (deterministic, always present): `computeCompatibilityScore(profile, opportunity)` in `/lib/matching.ts`.
   - skills overlap `(matched/profile.skills.length)*40`
   - interests overlap `(matched/profile.interests.length)*30`
   - `+15` category in preferredTypes
   - `+15` location or mode match
   - Exclude past-deadline opportunities before scoring. Round total to nearest 5. This is what sorts the feed and is the only thing shown if AI is unavailable.
2. **AI Relevance + Insights** (optional, from Gemini via `/api/relevance`, ONE batched call per feed load — never a second AI route): returns `MatchResult[]` (relevance, note, missingSkills, summary) for a shortlist only. On any failure, return `[]` — never fabricate any of these fields. Purely additive on top of the score; does not affect sort order or fallback.
3. **Local activity signal** (optional, `localStorage` only, no backend): view counts per opportunityId, used only as a minor secondary sort nudge among similarly-scored opportunities. Never a primary sort factor, never tied to a "career goals" field (that field doesn't exist in StudentProfile — do not add logic depending on it).

## Hard rules for every implementation step
- Inspect existing code before changing anything.
- Make only the change requested — don't refactor, rewrite, or "improve" unrelated files.
- No new dependencies unless explicitly asked for.
- No paid services, ever.
- Don't invent a database, auth, or a different AI provider even if it seems easier.
- After implementing, run the app and report what changed + any errors, in plain terms (I'm not an experienced debugger — explain fixes clearly).

## Data sourcing rule
`sourceStatus: "verified"` only for real, currently-known opportunities with a genuine org name and real link. Everything else is `"seeded"` with a generic (not fake-realistic) org name and `sourceNote` explaining it's a placeholder.