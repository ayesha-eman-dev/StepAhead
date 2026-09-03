import type { Opportunity, StudentProfile } from "@/types";

// ---------------------------------------------------------------------------
// 1. Deadline filtering
// ---------------------------------------------------------------------------

/**
 * Returns opportunities whose deadline is today or in the future.
 *
 * Handles both plain date strings ("YYYY-MM-DD") and full ISO timestamps
 * ("2025-01-15T00:00:00Z") so that live API results (e.g. Himalayas) are
 * compared accurately without dropping valid opportunities.
 *
 * Comparison is date-only at midnight UTC: a deadline of "today" is included.
 *
 * @param now - injectable for deterministic testing; defaults to new Date()
 */
export function filterExpired(
  opportunities: Opportunity[],
  now: Date = new Date(),
): Opportunity[] {
  // Normalise "now" to midnight UTC for a clean date-only comparison.
  const todayUtc = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );

  return opportunities.filter((opp) => {
    // Date.parse handles both "YYYY-MM-DD" (treated as UTC by spec) and full
    // ISO timestamp strings. Fall back to including the opportunity if the
    // string is unparseable (NaN) so we never silently drop a listing.
    const raw = Date.parse(opp.deadline);
    if (isNaN(raw)) return true;

    // Normalise the parsed timestamp to midnight UTC for date-only comparison.
    const d = new Date(raw);
    const deadlineUtc = Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate(),
    );
    return deadlineUtc >= todayUtc;
  });
}

// ---------------------------------------------------------------------------
// 2. Compatibility scoring
// ---------------------------------------------------------------------------

/**
 * Deterministic compatibility score in [0, 100], rounded to the nearest 5.
 *
 * Formula:
 *   skills component    = (skillsMatched / profile.skills.length) * 40
 *   interests component = (interestsMatched / profile.interests.length) * 30
 *   type bonus          = +15 if opportunity.category is in profile.preferredTypes
 *   location/mode bonus = +15 if location matches preferredLocation OR mode matches preferredMode
 *
 * Division-by-zero guard: empty skills or interests array contributes 0.
 * Rounding: Math.round(raw / 5) * 5  (round-half-up to nearest 5).
 * Clamped to [0, 100].
 */
export function computeCompatibilityScore(
  profile: StudentProfile,
  opportunity: Opportunity,
): number {
  // Skills component (case-sensitive exact match)
  const skillsComponent =
    profile.skills.length > 0
      ? (opportunity.skills.filter((s) => profile.skills.includes(s)).length /
          profile.skills.length) *
        40
      : 0;

  // Interests component (case-sensitive exact match)
  const interestsComponent =
    profile.interests.length > 0
      ? (opportunity.interests.filter((i) => profile.interests.includes(i))
          .length /
          profile.interests.length) *
        30
      : 0;

  // Preferred type bonus
  const typeComponent = profile.preferredTypes.includes(opportunity.category)
    ? 15
    : 0;

  // Location / mode bonus
  const locationComponent =
    opportunity.location === profile.preferredLocation ||
    opportunity.mode === profile.preferredMode
      ? 15
      : 0;

  const raw =
    skillsComponent + interestsComponent + typeComponent + locationComponent;

  // Round to nearest 5 and clamp to [0, 100]
  return Math.min(100, Math.max(0, Math.round(raw / 5) * 5));
}

// ---------------------------------------------------------------------------
// 3. Sorting
// ---------------------------------------------------------------------------

/**
 * Returns a new sorted array (input is not mutated).
 *
 * Sort keys:
 *   1. Compatibility score — descending (higher score first)
 *   2. Activity signal view count — ascending among ties (unviewed first)
 */
export function sortOpportunities(
  opportunities: Opportunity[],
  profile: StudentProfile,
  activitySignal: Record<string, number>,
): Opportunity[] {
  return [...opportunities].sort((a, b) => {
    const scoreA = computeCompatibilityScore(profile, a);
    const scoreB = computeCompatibilityScore(profile, b);

    if (scoreB !== scoreA) return scoreB - scoreA; // higher score first

    // Tiebreak: lower view count first (unviewed opportunities surface first)
    const viewsA = activitySignal[a.id] ?? 0;
    const viewsB = activitySignal[b.id] ?? 0;
    return viewsA - viewsB;
  });
}

// ---------------------------------------------------------------------------
// 4. Himalayas remote jobs fetch
// ---------------------------------------------------------------------------

/** Shape of a single job item returned by the Himalayas public API. */
interface HimalayasJob {
  id?: unknown;
  title?: unknown;
  companyName?: unknown;
  description?: unknown;
  applicationUrl?: unknown;
  url?: unknown;
  skills?: unknown;
  isRemote?: unknown;
}

/** Shape of the Himalayas API response envelope. */
interface HimalayasResponse {
  jobs?: HimalayasJob[];
}

/**
 * Fetches up to 10 remote tech jobs from the Himalayas public API and maps
 * them into the Opportunity interface shape.
 *
 * - Returns [] on any network error, non-200 response, or JSON parse failure.
 * - Never throws.
 * - All required Opportunity fields are populated; missing API fields fall back
 *   to safe defaults.
 * - category is inferred from title/description heuristics:
 *     "internship" if the text mentions "intern"
 *     "course"     if the text mentions "course" or "training"
 *     "internship" otherwise (closest match to a real job listing)
 */
export async function fetchRemoteOpportunities(): Promise<Opportunity[]> {
  try {
    const response = await fetch("https://himalayas.app/jobs/api?limit=10");

    if (!response.ok) return [];

    const data: HimalayasResponse =
      (await response.json()) as HimalayasResponse;

    if (!Array.isArray(data.jobs)) return [];

    const sixMonthsFromNow = new Date();
    sixMonthsFromNow.setMonth(sixMonthsFromNow.getMonth() + 6);
    const deadlineFallback = sixMonthsFromNow.toISOString().slice(0, 10);

    return data.jobs.map((job): Opportunity => {
      const rawTitle =
        typeof job.title === "string" && job.title.trim()
          ? job.title.trim()
          : "Remote Tech Opportunity";

      const rawOrg =
        typeof job.companyName === "string" && job.companyName.trim()
          ? job.companyName.trim()
          : "Unknown Company";

      const rawDescription =
        typeof job.description === "string" && job.description.trim()
          ? job.description.trim()
          : "No description available.";

      const rawUrl =
        typeof job.applicationUrl === "string" && job.applicationUrl.trim()
          ? job.applicationUrl.trim()
          : typeof job.url === "string" && job.url.trim()
            ? job.url.trim()
            : "https://himalayas.app/jobs";

      // Derive a stable id from the API id or a slug of the title + org
      const rawId =
        typeof job.id === "string" || typeof job.id === "number"
          ? `himalayas-${job.id}`
          : `himalayas-${rawTitle
              .toLowerCase()
              .replace(/\s+/g, "-")
              .slice(0, 40)}-${rawOrg
              .toLowerCase()
              .replace(/\s+/g, "-")
              .slice(0, 20)}`;

      // Infer category from title + description text
      const lowerText = `${rawTitle} ${rawDescription}`.toLowerCase();
      const category: string = lowerText.includes("intern")
        ? "internship"
        : lowerText.includes("course") || lowerText.includes("training")
          ? "course"
          : "internship";

      // Extract skills array if provided, otherwise default to empty
      const skills: string[] = Array.isArray(job.skills)
        ? (job.skills as unknown[])
            .filter(
              (s): s is string => typeof s === "string" && s.trim() !== "",
            )
            .map((s) => s.trim())
        : [];

      // Short description: first sentence of rawDescription, capped at 160 chars
      const firstSentence =
        rawDescription.split(/[.!?]/)[0] ?? rawDescription;
      const shortDescription =
        firstSentence.length > 160
          ? firstSentence.slice(0, 157) + "..."
          : firstSentence;

      return {
        id: rawId,
        title: rawTitle,
        organization: rawOrg,
        category,
        shortDescription,
        fullDescription: rawDescription,
        skills,
        interests: ["remote work", "technology"],
        eligibility:
          "Check the company's job listing for eligibility details.",
        location: "Remote",
        mode: "remote",
        deadline: deadlineFallback,
        isFree: true,
        applicationUrl: rawUrl,
        sourceStatus: "seeded",
        sourceNote:
          "live listing from Himalayas public API — verify before applying",
      };
    });
  } catch {
    return [];
  }
}
