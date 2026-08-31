# StepAhead — Project Context (locked — do not deviate without asking)

## Stack (fixed, no substitutions)

* Next.js 14, App Router, TypeScript, Tailwind CSS. One repo, frontend + API routes together.
* No database. No auth/login.
* Opportunity data: static `/data/opportunities.json`.
* Student profile: browser `localStorage` only (key: `stepahead\_profile`), never sent anywhere except in-request to `/api/relevance`.
* AI: Google Gemini, called only from `/app/api/relevance/route.ts`. Model name from `process.env.GEMINI\_MODEL`, key from `process.env.GEMINI\_API\_KEY`. Never hardcode either.
* Deploy target: Vercel.

## Core data types (see /types/index.ts once created)

* `Opportunity`: id, title, organization, category, shortDescription, fullDescription, skills\[], interests\[], eligibility, location, mode, deadline, isFree, applicationUrl, sourceStatus ("verified"|"seeded"), sourceNote?
* `StudentProfile`: degree, field, semester, skills\[], interests\[], preferredTypes\[], preferredLocation, preferredMode
* `MatchResult`: { opportunityId: string, relevance: "Strong"|"Moderate"|"Light", note: string } — the exact shape `/api/relevance` returns. Defined early (Prompt 1), not used until Prompt 8.
* `MatchResult`: opportunityId, compatibilityScore (number, 0–100, multiple of 5), relevance? ("Strong"|"Moderate"|"Light"), note? (string) — relevance/note are optional since they only exist when the AI call succeeds

## Two separate scoring signals — never merge these

1. **Compatibility Score** (deterministic, always present): `computeCompatibilityScore(profile, opportunity)` in `/lib/matching.ts`.

   * skills overlap `(matched/profile.skills.length)\*40`
   * interests overlap `(matched/profile.interests.length)\*30`
   * `+15` category in preferredTypes
   * `+15` location or mode match
   * Exclude past-deadline opportunities before scoring. Round total to nearest 5. This is what sorts the feed and is the only thing shown if AI is unavailable.
2. **AI Relevance** (optional, from Gemini via `/api/relevance`): `{opportunityId, relevance: "Strong"|"Moderate"|"Light", note}` for a shortlist only. On any failure, return `\[]` — never fabricate a relevance value. Purely additive on top of the score; does not affect sort order or fallback.

## Hard rules for every implementation step

* Inspect existing code before changing anything.
* Make only the change requested — don't refactor, rewrite, or "improve" unrelated files.
* No new dependencies unless explicitly asked for.
* No paid services, ever.
* Don't invent a database, auth, or a different AI provider even if it seems easier.
* After implementing, run the app and report what changed + any errors, in plain terms (I'm not an experienced debugger — explain fixes clearly).

## Data sourcing rule

`sourceStatus: "verified"` only for real, currently-known opportunities with a genuine org name and real link. Everything else is `"seeded"` with a generic (not fake-realistic) org name and `sourceNote` explaining it's a placeholder.

