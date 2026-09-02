# Implementation Plan: pakistan-location-ai-match

---

### PRE-EXECUTION NOTES (read before clicking Execute on anything)

**Note A — Onboarding page location list**
The completed `/app/onboarding/page.tsx` derives its location dropdown dynamically via `useMemo` from `opportunities.map(item => item.location)`. It does NOT import from `/lib/locations.ts` (which doesn't exist yet). This is intentional and correct for now — the onboarding picker will automatically surface Lahore, Karachi, and Islamabad once the new seeded `opportunities.json` entries are added (Task 2), with zero modification to the locked file. A future update to the onboarding page (outside this spec) can switch to importing from `/lib/locations.ts` directly.

**Note B — `MatchResult` type mismatch with current code**
`/types/index.ts` currently defines `MatchResult` with only `{ opportunityId, relevance, note }`. The PROJECT_CONTEXT.md specifies it should also have `missingSkills: string[]` and `summary: string`. Task 1 adds these fields. Because `/api/relevance` and `/app/feed` don't exist yet, there are no callers to break — this extension is safe to do first.

**Note C — No existing `/api/relevance`, `/lib/matching.ts`, `/lib/locations.ts`, or `/app/feed` route**
These are entirely new files. There is nothing to preserve or migrate. Every task in this spec is pure addition.

**Note D — "Rank by career goals" is blocked**
The `StudentProfile` interface does not contain a `careerGoals` field. No task in this spec adds one or depends on it. The activity signal (view counts) is the only secondary sort factor implemented here.

**Note E — Vitest + fast-check dev dependencies needed**
The test tasks (Task 8) require installing `vitest`, `@vitejs/plugin-react`, `fast-check`, and `@vitest/coverage-v8` as dev dependencies. These are the ONLY new dependencies this spec introduces. No production runtime dependencies are added.

---

## Overview

Eight sequential tasks that build the pakistan-location-ai-match feature from the ground up. Types and data come first to give every downstream task a stable foundation. The feed page wires everything together. Tests come last so they can import real implementations.

## Tasks

- [ ] 1. Extend `MatchResult` type in `/types/index.ts`
  - Open `/types/index.ts` and add `missingSkills: string[]` and `summary: string` to the `MatchResult` interface.
  - `missingSkills` accepts an empty array — that is valid when the student holds all required skills.
  - `summary` is a plain string; length constraint is enforced at the API layer, not in the type.
  - Leave `Opportunity` and `StudentProfile` interfaces completely unchanged.
  - Run `npx tsc --noEmit` after the edit and confirm zero new type errors.
  - _Satisfies: R3.1, R3.2, R3.3, R3.4, R8.4, R8.5_

- [ ] 2. Create `/lib/locations.ts` — canonical location registry
  - Create the file `/lib/locations.ts`.
  - Export `LOCATIONS` as a `const` array of string literals in the order specified by the design: `"Remote"` first, then `"Lahore"`, `"Karachi"`, `"Islamabad"`, then the remaining cities alphabetically through to `"United States (NASA centers)"`.
  - Apply `as const` so the type is a `readonly` tuple of string literals, preventing mutation.
  - Export `type Location = typeof LOCATIONS[number]` — a union of all valid location strings.
  - Do not import from any other module; this file has no runtime dependencies.
  - _Satisfies: R1.1, R1.2, R1.5_

- [ ] 3. Append Pakistani-location seeded entries to `/data/opportunities.json`
  - Append exactly three new objects at the end of the JSON array — do not modify any existing entry.
  - Entry 1: `id: "seeded-pk-lahore-01"`, `location: "Lahore"`, `category: "internship"`, `sourceStatus: "seeded"`, `sourceNote: "placeholder — not a real listing"`. All required string fields non-empty; `skills` and `interests` arrays contain at least one element each.
  - Entry 2: `id: "seeded-pk-karachi-01"`, `location: "Karachi"`, `category: "hackathon"`, same `sourceStatus` and `sourceNote`. Non-empty required fields; at least one skill and interest.
  - Entry 3: `id: "seeded-pk-islamabad-01"`, `location: "Islamabad"`, `category: "course"`, same `sourceStatus` and `sourceNote`. Non-empty required fields; at least one skill and interest.
  - All three `id` values must be unique across the entire `opportunities.json` array.
  - Run `npx tsc --noEmit` to confirm the new location strings pass the `Location` type check once `/lib/locations.ts` (Task 2) is in place.
  - _Satisfies: R2.1, R2.2, R2.3, R2.4_

- [ ] 4. Create `/lib/matching.ts` — filtering, scoring, and sorting
  - Create the file `/lib/matching.ts`. Import `LOCATIONS` from `@/lib/locations.ts` — do not define a local location array.
  - [ ] 4.1 Implement `filterExpired(opportunities: Opportunity[], now?: Date): Opportunity[]`
    - Parse each `opportunity.deadline` as `YYYY-MM-DD` at midnight UTC.
    - Exclude any opportunity whose deadline is strictly before `now` (default `new Date()`).
    - Accept `now` as an injectable parameter for deterministic testing.
    - _Satisfies: R5.6_
  - [ ] 4.2 Implement `computeCompatibilityScore(profile: StudentProfile, opportunity: Opportunity): number`
    - Apply the formula from the design: skills component `(skillsMatched / profile.skills.length) * 40`, interests component `(interestsMatched / profile.interests.length) * 30`, type bonus `+15` if `opportunity.category` is in `profile.preferredTypes`, location/mode bonus `+15` if `opportunity.location === profile.preferredLocation` OR `opportunity.mode === profile.preferredMode`.
    - Guard against division by zero: if `profile.skills` is empty the skills component is 0; if `profile.interests` is empty the interests component is 0.
    - Round the raw total with `Math.round(raw / 5) * 5` (round-half-up to nearest 5).
    - Clamp the result to `[0, 100]` with `Math.min(100, Math.max(0, score))`.
    - All string comparisons are case-sensitive exact matches.
    - _Satisfies: R5.1, R5.2, R5.3, R5.4, R5.5, R5.7_
  - [ ] 4.3 Implement `sortOpportunities(opportunities: Opportunity[], profile: StudentProfile, activitySignal: Record<string, number>): Opportunity[]`
    - Return a new array (do not mutate input).
    - Primary sort key: `computeCompatibilityScore` descending.
    - Secondary sort key (ties only): `activitySignal[opportunity.id] ?? 0` ascending — lower view count first.
    - _Satisfies: R6.1, R6.2, R7.3_

- [ ] 5. Create `/app/api/relevance/route.ts` — single-call Gemini handler
  - Create the file `/app/api/relevance/route.ts` as a Next.js App Router POST handler.
  - [ ] 5.1 Parse and validate the request body
    - Expect `{ opportunities: Opportunity[], profile: StudentProfile }`.
    - If parsing fails or the body is missing required fields, return `NextResponse.json([])` immediately.
    - _Satisfies: R4.5_
  - [ ] 5.2 Build the Gemini prompt and fire a single batched request
    - Read model name from `process.env.GEMINI_MODEL` and API key from `process.env.GEMINI_API_KEY` — never hardcode either value.
    - Build the prompt as specified in the design: system instruction embedded in the user turn, opportunity payload limited to `{ id, title, skills, interests, category, location }` per entry.
    - Create an `AbortController` with a 10-second timeout. Attach its `signal` to the `fetch` call.
    - Send exactly one HTTP request to `https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`.
    - _Satisfies: R4.1, R4.7, R4.8_
  - [ ] 5.3 Handle all failure modes and return `[]`
    - If `fetch` throws for any reason (network error, timeout via `AbortSignal`), catch and return `NextResponse.json([])`.
    - If `response.status !== 200`, return `NextResponse.json([])`.
    - If `JSON.parse` of the Gemini response text throws, return `NextResponse.json([])`.
    - If the parsed array length does not equal `opportunities.length`, return `NextResponse.json([])`.
    - If any element of the parsed array fails the shape check (`{ opportunityId: string, relevance: "Strong"|"Moderate"|"Light", note: string, missingSkills: string[], summary: string }`), return `NextResponse.json([])`.
    - Never return partial results or fabricated fields.
    - _Satisfies: R4.5, R4.6_
  - [ ] 5.4 Return the validated `MatchResult[]` on success
    - Extract the text from `candidates[0].content.parts[0].text` in the Gemini response.
    - After passing all validation steps, return `NextResponse.json(validatedArray)`.
    - Ensure `missingSkills` is populated with skills in `opportunity.skills` absent from `profile.skills`; the prompt instructs Gemini to produce this, but the route validates the field is a string array.
    - Ensure `summary` is a non-empty string of ≤ 120 characters; the prompt instructs Gemini to respect this, but the route validates shape only (string presence), not character count enforcement.
    - _Satisfies: R4.2, R4.3, R4.4_

- [ ] 6. Create `/app/feed/page.tsx` — ranked, filtered, AI-enriched feed
  - Create the file `/app/feed/page.tsx` as a `"use client"` component. Import `getOpportunities` from `@/lib/opportunities`, `LOCATIONS` from `@/lib/locations`, and the matching utilities from `@/lib/matching`.
  - [ ] 6.1 Profile guard — redirect if profile is missing or malformed
    - In a `useEffect` on mount, read `localStorage.getItem("stepahead_profile")`.
    - If the key is absent, or `JSON.parse` throws, or the parsed value does not pass an `isStudentProfile` type guard, call `router.push("/onboarding")` and return.
    - _Satisfies: R6.6_
  - [ ] 6.2 Deadline filtering
    - Call `filterExpired(getOpportunities())` to remove past-deadline entries before any scoring or display.
    - _Satisfies: R5.6, R6.1_
  - [ ] 6.3 Score computation and primary sort
    - Call `sortOpportunities(filtered, profile, activitySignal)` to produce the ranked list.
    - Use this sorted list as the source of truth for all rendering.
    - _Satisfies: R5.9, R6.1, R6.2_
  - [ ] 6.4 Activity signal read/write helpers
    - Implement `getActivitySignal(): Record<string, number>` — reads `localStorage.getItem("stepahead_activity")`, parses the JSON, returns `{}` on any error or missing key.
    - Implement `incrementViewCount(opportunityId: string): void` — reads the current signal, increments `signal[opportunityId]` by 1 (defaulting from 0), writes back to `localStorage.setItem("stepahead_activity", ...)`. Silently swallows any thrown error.
    - Both helpers must wrap all `localStorage` access in `try/catch` and default to `{}` / no-op on failure.
    - _Satisfies: R7.1, R7.2, R7.4_
  - [ ] 6.5 Fetch to `/api/relevance` and store results
    - After the sorted list is ready, POST the top-20 non-expired opportunities and the student profile to `/api/relevance`.
    - Store the returned `MatchResult[]` in state, keyed by `opportunityId` for O(1) lookup per card.
    - On any fetch error, set the AI results state to `[]` — do not surface an error message to the student.
    - _Satisfies: R4.1, R4.8, R6.4_
  - [ ] 6.6 Merge AI results into card display
    - For each opportunity card, look up the corresponding `MatchResult` by `opportunityId`.
    - If found, display `relevance`, `note`, `summary`, and up to 5 items from `missingSkills`.
    - If not found (API returned `[]` or the id is absent), display only the compatibility score and opportunity fields — show no AI-derived labels at all.
    - _Satisfies: R6.3, R6.4, R6.5_
  - [ ] 6.7 Location filter UI
    - Render a `<select>` whose first option is "All Locations" (value `""`).
    - Populate the remaining options from `LOCATIONS` imported from `@/lib/locations.ts`, in the same order as the `LOCATIONS` array — do not hardcode location strings.
    - When a specific location is selected, show only opportunities whose `location` field exactly matches the selected value (case-sensitive).
    - When "All Locations" is selected, show all non-expired opportunities without a location restriction.
    - _Satisfies: R1.4, R6.7, R6.8_
  - [ ] 6.8 Card expand — increment view count
    - When a student expands an opportunity card, call `incrementViewCount(opportunity.id)`.
    - _Satisfies: R7.1, R7.2_

- [ ] 7. Add Vitest configuration and install dev test dependencies
  - Install dev dependencies: `npm install --save-dev vitest @vitejs/plugin-react fast-check @vitest/coverage-v8` (exact current versions; no open ranges).
  - Create `vitest.config.ts` at the project root:
    ```ts
    import { defineConfig } from "vitest/config";
    import react from "@vitejs/plugin-react";
    import path from "path";

    export default defineConfig({
      plugins: [react()],
      test: {
        environment: "jsdom",
        globals: true,
      },
      resolve: {
        alias: {
          "@": path.resolve(__dirname, "."),
        },
      },
    });
    ```
  - Add `"test": "vitest --run"` and `"test:watch": "vitest"` to the `scripts` block in `package.json`.
  - Run `npm run test` to confirm the config loads without errors (no test files yet — exit 0 is expected).
  - _Satisfies: R8.5 (compiler and test infrastructure in place)_

- [ ] 8. Create property-based tests in `__tests__/`
  - Create the directory `__tests__/` at the project root.
  - [ ] 8.1 Create `__tests__/locations.test.ts` — location registry properties
    - Import `LOCATIONS` from `@/lib/locations`.
    - Import `opportunities` from `@/data/opportunities.json`.
    - **Property 7 — Location Registry Completeness and No Duplicates**: Assert `LOCATIONS` contains `"Lahore"`, `"Karachi"`, and `"Islamabad"`. Use `fc.assert(fc.property(fc.constantFrom(...LOCATIONS), loc => LOCATIONS.filter(l => l === loc).length === 1))` to verify no duplicates.
    - **Property 12 — Pakistani-Hub Entries Are Properly Seeded**: For all entries in `opportunities.json` whose `location` is `"Lahore"`, `"Karachi"`, or `"Islamabad"`, assert `sourceStatus === "seeded"` and `sourceNote === "placeholder — not a real listing"`. (Deterministic — no generation needed.)
    - _Covers: P7, P12 | Satisfies: R1.1, R1.2, R2.2_
  - [ ] 8.2 Create `__tests__/matching.test.ts` — scoring, filtering, and sorting properties
    - Import `computeCompatibilityScore`, `filterExpired`, `sortOpportunities` from `@/lib/matching`.
    - Import `LOCATIONS` from `@/lib/locations`.
    - Define fast-check arbitraries: `arbProfile` (non-empty `skills` and `interests`), `arbOpportunity` (all required fields present, `location` drawn from `fc.constantFrom(...LOCATIONS)`), `arbEmptySkillsProfile`, `arbEmptyInterestsProfile`.
    - **Property 1 — Compatibility Score Bounds**: `fc.assert(fc.property(arbProfile, arbOpportunity, (p, o) => { const n = computeCompatibilityScore(p, o); return n >= 0 && n <= 100; }), { numRuns: 100 })`.
    - **Property 2 — Compatibility Score Monotonicity**: Generate a base opportunity `B` and an opportunity `A` whose `skills` is a strict superset of `B.skills` relative to `profile.skills`. Assert `computeCompatibilityScore(p, A) >= computeCompatibilityScore(p, B)`.
    - **Property 3 — Deadline Exclusion**: `fc.assert(fc.property(fc.date({ max: new Date(Date.now() - 86400000) }), pastDate => { const opp = makeOpp(pastDate); return filterExpired([opp]).length === 0; }), { numRuns: 100 })`.
    - **Property 6 — Activity Signal Non-Negative and Monotone**: Implement `getActivitySignal`/`incrementViewCount` helpers inline in the test (or import if extracted). `fc.assert(fc.property(fc.nat(), fc.array(fc.nat({ max: 10 })), (initial, ops) => { /* simulate increments, assert count never decreases and equals initial + ops.length */ }), { numRuns: 100 })`.
    - **Property 8 — Score Rounding to Nearest 5**: `fc.assert(fc.property(arbProfile, arbOpportunity, (p, o) => { const n = computeCompatibilityScore(p, o); return n === Math.round(n / 5) * 5; }), { numRuns: 100 })`.
    - **Property 9 — Score Division-by-Zero Safety**: `fc.assert(fc.property(arbEmptySkillsProfile, arbOpportunity, (p, o) => { const n = computeCompatibilityScore(p, o); return n >= 0 && n <= 100; }), { numRuns: 100 })`. Repeat for empty interests.
    - **Property 10 — Sort Stability**: `fc.assert(fc.property(fc.array(arbOpportunity, { minLength: 1 }), arbProfile, arbActivitySignal, (opps, p, signal) => { const sorted = sortOpportunities(opps, p, signal); /* assert score(sorted[i]) >= score(sorted[i+1]); among equal scores, signal[sorted[i].id] <= signal[sorted[i+1].id] */ }), { numRuns: 100 })`.
    - **Property 11 — Location Filter Correctness**: `fc.assert(fc.property(fc.constantFrom(...LOCATIONS), fc.array(arbOpportunity), (loc, opps) => { const filtered = opps.filter(o => o.location === loc); return filtered.every(o => o.location === loc); }), { numRuns: 100 })`.
    - Also include example-based unit tests for: specific score formula values with known inputs, rounding boundary `raw=37.5 → 40`, `raw=42.4 → 40`, and `filterExpired` with today's date as the boundary.
    - _Covers: P1, P2, P3, P6, P8, P9, P10, P11 | Satisfies: R5.2, R5.3, R5.4, R5.5, R5.6, R5.7, R6.1, R6.2, R7.1, R7.2, R7.3_
  - [ ] 8.3 Create `__tests__/relevance.test.ts` — AI response shape and failure fallback properties
    - Import the `POST` handler from `@/app/api/relevance/route`.
    - Mock `fetch` globally using `vi.stubGlobal("fetch", ...)`.
    - **Property 4 — AI Response Shape**: Mock fetch to return a valid Gemini envelope whose `candidates[0].content.parts[0].text` is a JSON array of well-formed `MatchResult` objects (one per opportunity). Assert that every element `r` in the returned array satisfies: `typeof r.opportunityId === "string"`, `["Strong","Moderate","Light"].includes(r.relevance)`, `typeof r.note === "string"`, `Array.isArray(r.missingSkills)` with all elements strings, `typeof r.summary === "string"` with `r.summary.length > 0 && r.summary.length <= 120`.
    - **Property 5 — AI Failure Fallback**: Use `fc.oneof(fc.constant("network-error"), fc.constant("non-200"), fc.constant("bad-json"), fc.constant("count-mismatch"), fc.constant("timeout"))` to parameterise different failure modes. For each mode, configure the mock accordingly and assert the returned array has `length === 0`.
    - Also include example-based tests for: feed renders `missingSkills` capped at 5, feed shows no AI fields when route returns `[]`.
    - _Covers: P4, P5 | Satisfies: R4.2, R4.3, R4.4, R4.5, R4.6, R6.3, R6.4, R6.5_
  - [ ] 8.4 Run the full test suite and confirm all tests pass
    - Run `npm run test` (`vitest --run`).
    - All property-based tests must pass (minimum 100 runs each).
    - All unit/example tests must pass.
    - Fix any failures before marking this task complete.
    - _Satisfies: R8.5_

- [ ] 9. Final build verification
  - Run `npx tsc --noEmit` and confirm zero TypeScript errors.
  - Run `npm run lint` and confirm no new lint errors.
  - Run `npm run build` and confirm the Next.js build completes successfully.
  - Ensure all tasks are wired together: feed page imports locations, matching, and types; API route reads only from env vars; no locked files (`/app/onboarding/page.tsx`, `/app/page.tsx`, `/lib/opportunities.ts`) were modified.
  - _Satisfies: R8.1, R8.2, R8.3, R8.5_

## Notes

- Tasks marked with `*` postfix are optional and can be skipped for a faster MVP. No sub-tasks in this plan are marked optional because all correctness properties are load-bearing for the spec.
- Each task references specific requirements for traceability (R = Requirement clause, P = Correctness Property).
- Tasks 1–3 have no inter-dependencies and could be executed in parallel; however the order above (types → locations → data) is recommended to keep the TypeScript compiler happy at each step.
- Task 4 depends on Tasks 1 and 2. Task 5 depends on Task 1. Task 6 depends on Tasks 1, 2, 4, and 5. Task 8 depends on all implementation tasks (1–6).
- Do NOT modify `/app/onboarding/page.tsx`, `/app/page.tsx`, or `/lib/opportunities.ts` — these are locked by Requirement 8.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2", "5.1"] },
    { "id": 2, "tasks": ["3", "4.1", "4.2", "5.2", "5.3"] },
    { "id": 3, "tasks": ["4.3", "5.4"] },
    { "id": 4, "tasks": ["6.1", "6.2", "6.3", "6.4", "7"] },
    { "id": 5, "tasks": ["6.5", "6.6", "6.7", "6.8"] },
    { "id": 6, "tasks": ["8.1", "8.2", "8.3"] },
    { "id": 7, "tasks": ["8.4"] },
    { "id": 8, "tasks": ["9"] }
  ]
}
```
