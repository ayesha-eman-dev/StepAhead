# Requirements Document

## Introduction

This spec covers two additive features for the StepAhead Next.js application:

1. **Pakistan Location Support** — introduce a canonical `/lib/locations.ts` file that lists all valid location values, including Pakistani tech hubs (Lahore, Karachi, Islamabad, plus the existing set). All location-consuming code (matching logic, feed filters) must import from this single source.

2. **AI Match Score, Summarizer & Skill Gap** — extend the existing single batched Gemini call in `/app/api/relevance/route.ts` so each `MatchResult` also returns `missingSkills: string[]` and `summary: string`. Add a `localStorage`-only view-count activity signal used as a minor secondary sort nudge on the feed. Extend `types/index.ts` accordingly.

Both features are strictly additive. The Onboarding page, home page, `lib/opportunities.ts`, and `data/opportunities.json` schema are unchanged except that `data/opportunities.json` gains new seeded entries whose `location` values reference Pakistani hubs.

---

## Glossary

- **App**: The StepAhead Next.js 14 application.
- **Location_Registry**: The module exported from `/lib/locations.ts`; the single canonical source of all valid location string values.
- **Opportunity**: A record in `/data/opportunities.json` conforming to the `Opportunity` interface in `/types/index.ts`.
- **StudentProfile**: The student's self-described profile stored in `localStorage` under the key `stepahead_profile`, conforming to the `StudentProfile` interface in `/types/index.ts`.
- **Compatibility_Score**: The deterministic numeric score (0–100, rounded to nearest 5) computed by `computeCompatibilityScore` in `/lib/matching.ts`.
- **MatchResult**: The per-opportunity object returned by `/app/api/relevance/route.ts`, conforming to the `MatchResult` interface in `/types/index.ts`.
- **Relevance_API**: The Next.js API route at `/app/api/relevance/route.ts` that makes exactly one batched Gemini call per feed load.
- **Activity_Signal**: A `localStorage`-only record of per-opportunity view counts, used as a minor secondary sort nudge on the feed.
- **Feed**: The ranked opportunity listing page at `/app/feed/page.tsx`.
- **Gemini**: The Google Gemini model accessed via `process.env.GEMINI_API_KEY` and `process.env.GEMINI_MODEL`. Never hardcoded.
- **Pakistani_Hubs**: The city values Lahore, Karachi, and Islamabad that must be present in the Location_Registry.

---

## Requirements

### Requirement 1: Canonical Location Registry

**User Story:** As a developer, I want a single file that defines all valid location values, so that matching logic and feed filters stay consistent and new locations are added in one place only.

#### Acceptance Criteria

1. THE Location_Registry SHALL export a constant array named `LOCATIONS` declared with an `as const` assertion that contains, at minimum, the following location strings: `"Remote"`, `"Lahore"`, `"Karachi"`, `"Islamabad"`, `"Bengaluru"`, `"Pune"`, `"Chennai"`, `"Delhi"`, `"Mumbai"`, `"Hyderabad"`, `"Jaipur"`, `"Kolkata"`, `"Ahmedabad"`, `"Kanpur"`, `"London"`, `"Singapore"`, `"United States (NASA centers)"`.
2. THE Location_Registry SHALL contain no duplicate entries in the `LOCATIONS` array; each string in `LOCATIONS` SHALL appear exactly once.
3. WHEN `/lib/matching.ts` requires a location list, THE matching module SHALL import `LOCATIONS` from `/lib/locations.ts` and SHALL NOT define its own location array.
4. WHEN `/app/feed/page.tsx` renders a location filter, THE Feed SHALL import `LOCATIONS` from `/lib/locations.ts` and SHALL NOT hardcode location values inline.
5. THE `LOCATIONS` export SHALL be declared with `as const` so that its type is a readonly tuple of string literals and callers cannot mutate the array at runtime.
6. WHEN any `location` value appears in `/data/opportunities.json`, THAT value SHALL also appear in `LOCATIONS`; if a new entry is added to `opportunities.json` with a location string not yet in `LOCATIONS`, the build SHALL fail with a TypeScript type error.

---

### Requirement 2: Pakistan-Location Seeded Opportunities

**User Story:** As a student based in Pakistan, I want to see seeded opportunity entries that reference Pakistani city locations, so that the feed includes relevant location-matched results for Lahore, Karachi, and Islamabad.

#### Acceptance Criteria

1. WHEN the App loads opportunity data, THE App SHALL include at least one seeded `Opportunity` record whose `location` value is `"Lahore"`, at least one whose `location` value is `"Karachi"`, and at least one whose `location` value is `"Islamabad"`.
2. THE seeded Opportunity records for Pakistani locations SHALL have `sourceStatus` set to `"seeded"` and SHALL have a `sourceNote` whose value is the string `"placeholder — not a real listing"`.
3. THE seeded Opportunity records SHALL conform to the `Opportunity` interface in `/types/index.ts` with all required string fields non-empty, `id` values unique across the entire `opportunities.json` array, and array fields (`skills`, `interests`) containing at least one element each.
4. THE existing entries in `/data/opportunities.json` SHALL NOT be modified; only new array entries appended at the end of the array are permitted.

---

### Requirement 3: Extended MatchResult Type

**User Story:** As a developer, I want the `MatchResult` interface to include `missingSkills` and `summary` fields, so that the feed UI can display skill-gap and summary information returned by the AI.

#### Acceptance Criteria

1. THE `MatchResult` interface in `/types/index.ts` SHALL include the field `missingSkills: string[]`; an empty array is a valid value when the student's skills cover all of the opportunity's required skills.
2. THE `MatchResult` interface in `/types/index.ts` SHALL include the field `summary: string`.
3. THE existing fields `opportunityId: string`, `relevance: "Strong" | "Moderate" | "Light"`, and `note: string` SHALL remain unchanged in the `MatchResult` interface.
4. THE `Opportunity` interface and `StudentProfile` interface in `/types/index.ts` SHALL remain unchanged.

---

### Requirement 4: Single-Call AI Relevance with Skill Gap and Summary

**User Story:** As a student, I want each matched opportunity to show me what skills I'm missing and a short AI-written summary, so that I understand the match quality without needing to read the full description.

#### Acceptance Criteria

1. WHEN the Feed page requests AI relevance for a shortlist of between 1 and 20 Opportunity records and a StudentProfile, THE Relevance_API SHALL make exactly one HTTP request to the Gemini API per feed load.
2. THE Relevance_API SHALL return a `MatchResult[]` where each element includes `opportunityId`, `relevance`, `note`, `missingSkills`, and `summary`.
3. WHEN the Gemini API call succeeds, THE Relevance_API SHALL populate `missingSkills` with an array of skill name strings that appear in the Opportunity's `skills` list but are absent from the StudentProfile's `skills` list; an empty array is valid when there are no missing skills.
4. WHEN the Gemini API call succeeds, THE Relevance_API SHALL populate `summary` with a non-empty string of no more than 120 characters that references at least one skill or field from the Opportunity record.
5. IF the Gemini API call fails for any reason (network error, quota exceeded, malformed response, or timeout after 10 seconds), THEN THE Relevance_API SHALL return an empty array `[]` and SHALL NOT return partial or fabricated `MatchResult` objects.
6. IF the Gemini API returns a response that contains fewer `MatchResult` objects than the number of Opportunity records submitted, THEN THE Relevance_API SHALL treat the entire response as a failure and SHALL return an empty array `[]`.
7. THE Relevance_API SHALL read the Gemini model name exclusively from `process.env.GEMINI_MODEL` and the API key exclusively from `process.env.GEMINI_API_KEY`; neither value SHALL be hardcoded.
8. THE App SHALL NOT create a second API route or make a second Gemini call for any purpose covered by this spec.
9. THE Compatibility_Score computed by `/lib/matching.ts` SHALL remain the primary sort key for feed ranking and SHALL NOT be affected by the AI relevance result.

---

### Requirement 5: Compatibility Score Implementation

**User Story:** As a student, I want opportunities ranked by how well they match my profile, so that the most relevant listings appear at the top of my feed.

#### Acceptance Criteria

1. THE `/lib/matching.ts` module SHALL export a function `computeCompatibilityScore(profile: StudentProfile, opportunity: Opportunity): number`.
2. WHEN `computeCompatibilityScore` is called with a `profile` whose `skills` array is non-empty and `interests` array is non-empty, THE Compatibility_Score SHALL be computed as: `(skillsMatched / profile.skills.length) * 40` + `(interestsMatched / profile.interests.length) * 30` + `15 if opportunity.category is in profile.preferredTypes` + `15 if opportunity.location === profile.preferredLocation OR opportunity.mode === profile.preferredMode`. String comparisons for `category`, `location`, and `mode` SHALL be case-sensitive exact matches.
3. WHEN `computeCompatibilityScore` is called with a `profile` whose `skills` array is empty or `interests` array is empty, THE function SHALL treat the corresponding component as 0 rather than performing a division by zero.
4. WHEN `computeCompatibilityScore` is called, THE function SHALL round the computed total to the nearest 5 using "round half up" semantics (i.e., `Math.round(total / 5) * 5`) before returning.
5. THE `computeCompatibilityScore` function SHALL return a value in the closed interval [0, 100] for any `StudentProfile` and `Opportunity` input where all required fields are present.
6. WHEN an `Opportunity`'s `deadline` field represents a date strictly before the current calendar date (compared at midnight UTC), THE Feed SHALL exclude that Opportunity from scoring and from the displayed results.
7. WHEN `profile.skills` is non-empty and `profile.interests` is non-empty, THE `computeCompatibilityScore` function SHALL return a higher or equal score for an Opportunity whose `skills` array is a strict superset of another Opportunity's `skills` array relative to `profile.skills`, compared to the Opportunity with fewer matching skills.

---

### Requirement 6: Feed Page

**User Story:** As a student, I want a feed page that shows ranked opportunities after I complete onboarding, so that I can browse and act on listings that fit my profile.

#### Acceptance Criteria

1. WHEN a student navigates to `/feed` with a valid `stepahead_profile` entry in `localStorage`, THE Feed SHALL display the ranked list of Opportunity records whose `deadline` field is greater than or equal to today's local calendar date, sorted by Compatibility_Score descending.
2. WHEN two or more Opportunity records have equal Compatibility_Scores, THE Feed SHALL apply the Activity_Signal view count stored under the `stepahead_activity` localStorage key as a secondary sort key, ordering opportunities with lower view counts before those with higher view counts.
3. WHEN the Relevance_API returns a non-empty `MatchResult[]` for an Opportunity, THE Feed SHALL display the `relevance` label, `note`, and `summary` alongside that Opportunity's card, and SHALL display at most 5 items from the `missingSkills` array.
4. WHEN the Relevance_API returns an empty array `[]`, THE Feed SHALL display only the Compatibility_Score and Opportunity details without any AI-derived fields.
5. THE Feed SHALL NOT display fabricated `relevance`, `note`, `missingSkills`, or `summary` values for any Opportunity when AI data is unavailable.
6. WHEN a student navigates to `/feed` without a `stepahead_profile` entry in `localStorage`, THE Feed SHALL redirect the student to `/onboarding`.
7. THE Feed SHALL display a location filter control with an initial "All Locations" option and one option per entry in `LOCATIONS` imported from `/lib/locations.ts`, in the same order as the `LOCATIONS` array.
8. WHEN the student selects a specific location in the filter control, THE Feed SHALL display only Opportunity records whose `location` field exactly matches the selected value; WHEN the student selects "All Locations", THE Feed SHALL display all non-expired records without a location restriction.

---

### Requirement 7: Activity Signal (View Count)

**User Story:** As a student, I want the feed to gently surface opportunities I haven't interacted with yet, so that highly-relevant but unviewed listings aren't buried by ones I've already seen.

#### Acceptance Criteria

1. WHEN a student views an Opportunity's detail page or expands an Opportunity card, THE App SHALL increment the view count for that `opportunityId` in `localStorage` by exactly 1 and SHALL NOT send this data to any server.
2. THE Activity_Signal view count for any `opportunityId` SHALL be a non-negative integer at all times; the view count SHALL default to 0 for any `opportunityId` with no stored entry, SHALL only increase, and SHALL persist across page reloads within the same browser origin.
3. THE Activity_Signal SHALL be used only as a secondary sort factor among Opportunity records with equal Compatibility_Scores; opportunities with a lower view count SHALL be ranked higher than those with a higher view count, so that unviewed listings appear before already-viewed ones.
4. IF `localStorage` is unavailable or throws an error while reading or writing the Activity_Signal, THEN THE Feed SHALL treat the Activity_Signal value as 0 for all opportunities and SHALL continue to display results ordered by Compatibility_Score only, without surfacing an error message to the student.
5. THE Activity_Signal SHALL NOT be used for any purpose other than the secondary sort nudge described in this requirement; rank by career goals is out of scope.

---

### Requirement 8: No Regression on Existing Behaviour

**User Story:** As a developer, I want all additive changes to leave currently working pages and modules untouched, so that nothing breaks during incremental delivery.

#### Acceptance Criteria

1. THE `/app/onboarding/page.tsx` file SHALL NOT be modified as part of this feature; its `locationOptions` will automatically include Pakistani city names because those appear in new seeded Opportunity records that `useMemo` processes from `getOpportunities()`.
2. THE `/app/page.tsx` file SHALL NOT be modified as part of this feature.
3. THE `/lib/opportunities.ts` file SHALL NOT be modified as part of this feature.
4. IF `types/index.ts` is modified to extend `MatchResult`, THEN THE modification SHALL be additive only; no existing field SHALL be removed or renamed.
5. WHEN all new files and modifications described in this spec are applied, THE TypeScript compiler SHALL report zero new compilation errors compared to the baseline before this feature was implemented.
6. WHEN the application is running, THE routes `/` and `/onboarding` SHALL each return HTTP 200 with the same rendered HTML structure as before this feature was implemented.

---

## Correctness Properties

The following properties SHALL be verified by property-based tests in the project's test suite.

### P1 — Compatibility Score Bounds

FOR ALL valid `StudentProfile` inputs with at least one skill and at least one interest, and FOR ALL non-expired `Opportunity` inputs, `computeCompatibilityScore(profile, opportunity)` SHALL return a value `n` such that `0 <= n <= 100`.

### P2 — Compatibility Score Monotonicity

FOR ALL pairs of `Opportunity` records `A` and `B` that are identical in every field except that `A.skills` is a strict superset of `B.skills` relative to `profile.skills`, `computeCompatibilityScore(profile, A)` SHALL be greater than or equal to `computeCompatibilityScore(profile, B)`.

### P3 — Deadline Exclusion

FOR ALL `Opportunity` records whose `deadline` is strictly before the current date, THE Feed's filtered opportunity list SHALL not contain that record.

### P4 — AI Response Shape

WHEN the Relevance_API returns a non-empty array, FOR ALL elements `r` in the returned array, `r` SHALL have: `typeof r.opportunityId === "string"`, `["Strong","Moderate","Light"].includes(r.relevance)`, `typeof r.note === "string"`, `Array.isArray(r.missingSkills)`, and `typeof r.summary === "string"`.

### P5 — AI Failure Fallback

WHEN the Gemini API call throws any error or returns a non-200 response, THE Relevance_API SHALL return an array with length equal to 0.

### P6 — Activity Signal Non-Negative

FOR ALL `opportunityId` values recorded in the Activity_Signal, the stored view count SHALL be an integer greater than or equal to 0, and repeated increment operations SHALL never produce a value lower than the value before the operation.

### P7 — Location Registry Completeness

THE `LOCATIONS` array exported from `/lib/locations.ts` SHALL contain `"Lahore"`, `"Karachi"`, and `"Islamabad"`. FOR ALL strings `loc` in `LOCATIONS`, `LOCATIONS.filter(l => l === loc).length === 1` (no duplicates).

### P8 — Score Rounding

FOR ALL outputs `n` of `computeCompatibilityScore`, `n === Math.round(n / 5) * 5` (result is a multiple of 5, using round-half-up semantics).

### P9 — Score Division-by-Zero Safety

FOR ALL `StudentProfile` inputs where `profile.skills` is an empty array or `profile.interests` is an empty array, `computeCompatibilityScore(profile, opportunity)` SHALL return a value in [0, 100] without throwing a runtime error.
