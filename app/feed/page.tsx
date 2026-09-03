"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getOpportunities } from "@/lib/opportunities";
import {
  fetchRemoteOpportunities,
  filterExpired,
  sortOpportunities,
  computeCompatibilityScore,
} from "@/lib/matching";
import { LOCATIONS } from "@/lib/locations";
import type { Opportunity, StudentProfile, MatchResult } from "@/types";
import type {
  FallbackRecommendation,
  FallbackPayload,
} from "@/app/api/relevance/route";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = "stepahead_profile";
const ACTIVITY_KEY = "stepahead_activity";

const CATEGORY_OPTIONS = [
  "All",
  "internship",
  "hackathon",
  "competition",
  "workshop",
  "course",
] as const;

const MODE_OPTIONS = ["All", "remote", "hybrid", "onsite"] as const;

const LOCATION_CHIPS = [
  "All",
  "Lahore",
  "Karachi",
  "Islamabad",
  "Remote",
] as const;

const MOCK_PROFILE: StudentProfile = {
  degree: "Bachelor",
  field: "Computer Science",
  semester: "4",
  skills: ["Python", "JavaScript"],
  interests: ["web development", "machine learning"],
  preferredTypes: ["internship", "hackathon"],
  preferredLocation: "Remote",
  preferredMode: "remote",
};

// ---------------------------------------------------------------------------
// Inline SVG icons (no external dependency)
// ---------------------------------------------------------------------------

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}

function SparklesIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
      <path d="M5 3v4" />
      <path d="M19 17v4" />
      <path d="M3 5h4" />
      <path d="M17 19h4" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

function isStudentProfile(value: unknown): value is StudentProfile {
  if (!value || typeof value !== "object") return false;
  const p = value as StudentProfile;
  return (
    typeof p.degree === "string" &&
    typeof p.field === "string" &&
    typeof p.semester === "string" &&
    Array.isArray(p.skills) &&
    Array.isArray(p.interests) &&
    Array.isArray(p.preferredTypes) &&
    typeof p.preferredLocation === "string" &&
    typeof p.preferredMode === "string"
  );
}

function readProfile(): StudentProfile | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isStudentProfile(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function readActivitySignal(): Record<string, number> {
  try {
    const raw = localStorage.getItem(ACTIVITY_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    )
      return {};
    return parsed as Record<string, number>;
  } catch {
    return {};
  }
}

function incrementViewCount(opportunityId: string): void {
  try {
    const signal = readActivitySignal();
    signal[opportunityId] = (signal[opportunityId] ?? 0) + 1;
    localStorage.setItem(ACTIVITY_KEY, JSON.stringify(signal));
  } catch {
    // silently ignore
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dedupe(opportunities: Opportunity[]): Opportunity[] {
  const seen = new Set<string>();
  return opportunities.filter((o) => {
    if (seen.has(o.id)) return false;
    seen.add(o.id);
    return true;
  });
}

function scoreBadgeClass(score: number): string {
  if (score >= 70)
    return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
  if (score >= 40) return "bg-amber-50 text-amber-700 ring-1 ring-amber-200";
  return "bg-neutral-100 text-neutral-500 ring-1 ring-neutral-200";
}

function relevanceBadgeClass(relevance: MatchResult["relevance"]): string {
  if (relevance === "Strong")
    return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
  if (relevance === "Moderate")
    return "bg-amber-50 text-amber-700 ring-1 ring-amber-200";
  return "bg-neutral-100 text-neutral-500 ring-1 ring-neutral-200";
}

function formatDeadline(deadline: string): string {
  const ts = Date.parse(deadline);
  if (isNaN(ts)) return deadline;
  return new Date(ts).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ---------------------------------------------------------------------------
// ChipGroup
// ---------------------------------------------------------------------------

function ChipGroup<T extends string>({
  label,
  options,
  selected,
  multi,
  onChange,
}: {
  label: string;
  options: readonly T[];
  selected: T[];
  multi: boolean;
  onChange: (next: T[]) => void;
}) {
  function toggle(opt: T) {
    if (opt === ("All" as T)) {
      onChange(["All" as T]);
      return;
    }
    if (!multi) {
      onChange(
        selected.includes(opt) && selected.length === 1
          ? ["All" as T]
          : [opt],
      );
      return;
    }
    const withoutAll = selected.filter((s) => s !== ("All" as T));
    const next = withoutAll.includes(opt)
      ? withoutAll.filter((s) => s !== opt)
      : [...withoutAll, opt];
    onChange(next.length === 0 ? ["All" as T] : next);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium uppercase tracking-wider text-neutral-400">
        {label}
      </span>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const active = selected.includes(opt);
          return (
            <button
              key={opt}
              type="button"
              onClick={() => toggle(opt)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors capitalize ${
                active
                  ? "bg-indigo-600 text-white"
                  : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
              }`}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty-state card
// ---------------------------------------------------------------------------

function EmptyStateCard({
  recommendations,
  loading,
}: {
  recommendations: FallbackRecommendation[];
  loading: boolean;
}) {
  const typeLabel: Record<FallbackRecommendation["type"], string> = {
    platform: "Platform",
    tip: "Tip",
    action: "Action",
  };
  const typeBadge: Record<FallbackRecommendation["type"], string> = {
    platform: "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100",
    tip: "bg-amber-50 text-amber-700 ring-1 ring-amber-100",
    action: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
  };

  return (
    <div className="rounded-xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
      <div className="px-8 py-10 text-center border-b border-neutral-100">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-indigo-50 text-indigo-500">
          <SearchIcon className="h-7 w-7" />
        </div>
        <h3 className="mt-4 text-lg font-semibold text-neutral-900">
          No opportunities match your current filters
        </h3>
        <p className="mt-2 max-w-md mx-auto text-sm text-neutral-500">
          Try broadening your location, mode, or category selection — or review
          the personalised suggestions below.
        </p>
      </div>

      <div className="px-8 py-6">
        {loading ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="flex items-center gap-2 text-sm text-neutral-400">
              <SparklesIcon className="h-4 w-4 animate-pulse text-indigo-400" />
              <span className="animate-pulse">
                Generating personalised recommendations…
              </span>
            </div>
          </div>
        ) : recommendations.length > 0 ? (
          <>
            <div className="flex items-center gap-2 mb-4">
              <SparklesIcon className="h-4 w-4 text-indigo-500" />
              <p className="text-sm font-semibold text-neutral-700">
                AI-powered suggestions for you
              </p>
            </div>
            <ul className="space-y-3">
              {recommendations.map((rec, i) => (
                <li
                  key={i}
                  className="rounded-lg border border-neutral-100 bg-neutral-50 p-4"
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`mt-0.5 inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${typeBadge[rec.type]}`}
                    >
                      {typeLabel[rec.type]}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-neutral-900">
                        {rec.title}
                      </p>
                      <p className="mt-1 text-sm leading-relaxed text-neutral-600">
                        {rec.body}
                      </p>
                      {rec.url && (
                        <a
                          href={rec.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline"
                        >
                          Visit →
                        </a>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-center text-sm text-neutral-400 py-4">
            Adjust your filters above to find matching opportunities.
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Opportunity card
// ---------------------------------------------------------------------------

function OpportunityCard({
  opportunity,
  score,
  matchResult,
  expanded,
  profile,
  onToggle,
}: {
  opportunity: Opportunity;
  score: number;
  matchResult: MatchResult | undefined;
  expanded: boolean;
  profile: StudentProfile;
  onToggle: () => void;
}) {
  // Per-card AI insight state — fetched lazily on first expand
  const [cardAi, setCardAi] = useState<MatchResult | null | "loading" | "error">(null);
  const hasFetchedRef = useRef(false);

  useEffect(() => {
    if (!expanded) return;
    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;
    setCardAi("loading");

    fetch("/api/relevance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        opportunities: [opportunity],
        profile,
      }),
    })
      .then(async (res) => {
        if (!res.ok) { setCardAi("error"); return; }
        const data = (await res.json()) as MatchResult[];
        if (Array.isArray(data) && data.length > 0 && data[0]) {
          setCardAi(data[0]);
        } else {
          setCardAi("error");
        }
      })
      .catch(() => setCardAi("error"));
  }, [expanded, opportunity, profile]);

  // Use batch match result if available and card AI hasn't loaded yet
  const displayAi: MatchResult | null =
    cardAi === "loading" || cardAi === "error" || cardAi === null
      ? (matchResult ?? null)
      : cardAi;

  const isCardAiLoading = cardAi === "loading" && !matchResult;

  const isExpired = Date.parse(opportunity.deadline) < Date.now();
  const deadlineLabel = isExpired
    ? "Expired"
    : `Application Deadline: ${formatDeadline(opportunity.deadline)}`;

  const matchedSkills = opportunity.skills.filter((s) =>
    profile.skills.includes(s),
  );

  return (
    <article className="rounded-xl border border-neutral-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      {/* Card header — always visible, click to expand */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left p-5"
        aria-expanded={expanded}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium capitalize text-indigo-700 ring-1 ring-indigo-100">
                {opportunity.category}
              </span>
              {displayAi && (
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${relevanceBadgeClass(displayAi.relevance)}`}
                >
                  {displayAi.relevance} Match
                </span>
              )}
            </div>
            <h2 className="mt-2 text-base font-semibold leading-snug text-neutral-900">
              {opportunity.title}
            </h2>
            <p className="mt-0.5 text-sm text-neutral-500">
              {opportunity.organization}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-1 text-sm font-semibold tabular-nums ${scoreBadgeClass(score)}`}
            >
              {score}% Match
            </span>
            <span
              className={`text-xs ${isExpired ? "text-red-400" : "text-neutral-400"}`}
            >
              {isExpired
                ? "Expired"
                : `Deadline: ${formatDeadline(opportunity.deadline)}`}
            </span>
          </div>
        </div>

        <p className="mt-3 text-sm leading-relaxed text-neutral-600 line-clamp-2">
          {opportunity.shortDescription}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-1 text-xs text-neutral-400">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            {opportunity.location}
          </span>
          <span className="text-neutral-200">·</span>
          <span className="text-xs capitalize text-neutral-400">
            {opportunity.mode}
          </span>
          {!opportunity.isFree && (
            <>
              <span className="text-neutral-200">·</span>
              <span className="text-xs text-amber-600 font-medium">Paid</span>
            </>
          )}
        </div>
      </button>

      {/* Expanded content — no layout shift because it appends below */}
      {expanded && (
        <div className="border-t border-neutral-100 px-5 pb-6 pt-5 space-y-5">
          {/* Gemini AI Advice Box */}
          {isCardAiLoading ? (
            <div className="rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3">
              <div className="flex items-center gap-2 text-indigo-500">
                <SparklesIcon className="h-4 w-4 animate-pulse" />
                <span className="text-xs font-medium animate-pulse">
                  Analysing match with Gemini…
                </span>
              </div>
            </div>
          ) : displayAi ? (
            <div className="rounded-lg border border-indigo-100 bg-indigo-50 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <SparklesIcon className="h-4 w-4 text-indigo-600" />
                <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
                  Gemini AI Insight
                </p>
                <span
                  className={`ml-auto inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${relevanceBadgeClass(displayAi.relevance)}`}
                >
                  {displayAi.relevance} Match
                </span>
              </div>

              {displayAi.summary && (
                <p className="text-sm font-medium text-indigo-900">
                  {displayAi.summary}
                </p>
              )}
              <p className="text-sm leading-relaxed text-indigo-800">
                {displayAi.note}
              </p>

              {/* Matched skills */}
              {matchedSkills.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-indigo-600 mb-1.5">
                    Matched skills:
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {matchedSkills.map((skill) => (
                      <span
                        key={skill}
                        className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Missing skills */}
              {displayAi.missingSkills.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-indigo-600 mb-1.5">
                    Skills to develop:
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {displayAi.missingSkills.slice(0, 5).map((skill) => (
                      <span
                        key={skill}
                        className="rounded-full bg-white px-2.5 py-0.5 text-xs font-medium text-indigo-700 ring-1 ring-indigo-200"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {/* Application deadline — full label in expanded view */}
          <p className="text-xs text-neutral-500">
            <span className="font-medium">{deadlineLabel}</span>
          </p>

          {/* Full description */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-2">
              About
            </p>
            <p className="text-sm leading-relaxed text-neutral-700">
              {opportunity.fullDescription}
            </p>
          </div>

          {/* All skills */}
          {opportunity.skills.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-2">
                Skills Required
              </p>
              <div className="flex flex-wrap gap-1.5">
                {opportunity.skills.map((skill) => (
                  <span
                    key={skill}
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      profile.skills.includes(skill)
                        ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                        : "bg-neutral-100 text-neutral-600"
                    }`}
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Eligibility */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-2">
              Eligibility
            </p>
            <p className="text-sm leading-relaxed text-neutral-700">
              {opportunity.eligibility}
            </p>
          </div>

          {/* Source note */}
          {opportunity.sourceNote && (
            <p className="text-xs text-neutral-400 italic">
              {opportunity.sourceNote}
            </p>
          )}

          {/* CTA */}
          <a
            href={opportunity.applicationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700"
          >
            Apply now →
          </a>
        </div>
      )}
    </article>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function FeedPage() {
  const router = useRouter();

  const [hasMounted, setHasMounted] = useState(false);
  const [profile, setProfile] = useState<StudentProfile>(MOCK_PROFILE);
  const [usingMockProfile, setUsingMockProfile] = useState(false);
  const [allOpportunities, setAllOpportunities] = useState<Opportunity[]>([]);
  const [activitySignal, setActivitySignal] = useState<Record<string, number>>({});

  // Filters — initialised to "All"; pre-selected from profile on mount
  const [selectedLocations, setSelectedLocations] = useState<string[]>(["All"]);
  const [selectedModes, setSelectedModes] = useState<string[]>(["All"]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>(["All"]);

  // Batch AI results (top-20 shortlist)
  const [matchResults, setMatchResults] = useState<Map<string, MatchResult>>(
    new Map(),
  );
  const [aiLoading, setAiLoading] = useState(false);

  // Empty-state fallback
  const [fallbackRecs, setFallbackRecs] = useState<FallbackRecommendation[]>([]);
  const [fallbackLoading, setFallbackLoading] = useState(false);

  // Card expand tracking
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Debounce ref for batch AI calls
  const aiDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---------------------------------------------------------------------------
  // Mount
  // ---------------------------------------------------------------------------

  useEffect(() => {
    setHasMounted(true);

    const stored = readProfile();
    if (!stored) {
      router.push("/onboarding");
      return;
    }
    setProfile(stored);
    setUsingMockProfile(false);

    // Pre-select filters from profile
    if (stored.preferredLocation) {
      setSelectedLocations([stored.preferredLocation]);
    }
    if (stored.preferredMode) {
      setSelectedModes([stored.preferredMode]);
    }
    if (stored.preferredTypes.length > 0) {
      setSelectedCategories(stored.preferredTypes);
    }

    setActivitySignal(readActivitySignal());

    async function loadOpportunities() {
      const seed = getOpportunities();
      const live = await fetchRemoteOpportunities();
      const merged = dedupe([...seed, ...live]);
      const active = filterExpired(merged);
      setAllOpportunities(active);
    }
    void loadOpportunities();
  }, [router]);

  // ---------------------------------------------------------------------------
  // Derived: filtered + sorted list
  // ---------------------------------------------------------------------------

  const filteredOpportunities = (() => {
    if (!hasMounted) return [];
    return sortOpportunities(
      allOpportunities.filter((opp) => {
        const locMatch =
          selectedLocations.includes("All") ||
          selectedLocations.some((l) => l === opp.location);
        const modeMatch =
          selectedModes.includes("All") ||
          selectedModes.some((m) => m === opp.mode);
        const catMatch =
          selectedCategories.includes("All") ||
          selectedCategories.some((c) => c === opp.category);
        return locMatch && modeMatch && catMatch;
      }),
      profile,
      activitySignal,
    );
  })();

  // ---------------------------------------------------------------------------
  // Batch AI — debounced on filter change
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!hasMounted) return;
    if (aiDebounceRef.current) clearTimeout(aiDebounceRef.current);

    if (filteredOpportunities.length === 0) {
      setMatchResults(new Map());
      setFallbackLoading(true);
      setFallbackRecs([]);

      aiDebounceRef.current = setTimeout(async () => {
        try {
          const res = await fetch("/api/relevance", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ opportunities: [], profile }),
          });
          if (res.ok) {
            const data = (await res.json()) as FallbackPayload;
            if (Array.isArray(data.recommendations)) {
              setFallbackRecs(data.recommendations);
            }
          }
        } catch {
          // silently ignore
        } finally {
          setFallbackLoading(false);
        }
      }, 400);

      return;
    }

    setFallbackRecs([]);
    setAiLoading(true);
    const shortlist = filteredOpportunities.slice(0, 20);

    aiDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/relevance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ opportunities: shortlist, profile }),
        });
        if (res.ok) {
          const data = (await res.json()) as MatchResult[];
          if (Array.isArray(data)) {
            const map = new Map<string, MatchResult>();
            data.forEach((r) => map.set(r.opportunityId, r));
            setMatchResults(map);
          }
        }
      } catch {
        // silently ignore
      } finally {
        setAiLoading(false);
      }
    }, 400);

    return () => {
      if (aiDebounceRef.current) clearTimeout(aiDebounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    hasMounted,
    filteredOpportunities.length,
    selectedLocations.join(),
    selectedModes.join(),
    selectedCategories.join(),
    profile,
  ]);

  // ---------------------------------------------------------------------------
  // Card expand
  // ---------------------------------------------------------------------------

  function handleToggleCard(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        incrementViewCount(id);
        setActivitySignal(readActivitySignal());
      }
      return next;
    });
  }

  // ---------------------------------------------------------------------------
  // Pre-mount shell
  // ---------------------------------------------------------------------------

  if (!hasMounted) {
    return (
      <div className="min-h-screen bg-neutral-50 font-[family-name:var(--font-geist-sans)]" />
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const resultCount = filteredOpportunities.length;

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 font-[family-name:var(--font-geist-sans)]">
      {/* Sticky header */}
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link
            href="/"
            className="text-sm font-semibold tracking-tight text-indigo-600"
          >
            StepAhead
          </Link>
          <div className="flex items-center gap-4">
            {usingMockProfile && (
              <span className="hidden sm:inline text-xs text-amber-600 bg-amber-50 rounded-full px-3 py-1 ring-1 ring-amber-200">
                Demo profile
              </span>
            )}
            <Link
              href="/onboarding"
              className="text-sm font-medium text-neutral-600 transition-colors hover:text-indigo-600"
            >
              Edit profile
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 pb-24 pt-8">
        {/* Title + result count */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
            Your opportunities
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            {resultCount === 0
              ? "No opportunities match your criteria."
              : `${resultCount} opportunit${resultCount === 1 ? "y" : "ies"} match your criteria`}
            {aiLoading && (
              <span className="ml-2 text-indigo-400 animate-pulse">
                · AI insights loading…
              </span>
            )}
          </p>
        </div>

        {/* Filter bar */}
        <div className="mb-8 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm space-y-4">
          <ChipGroup
            label="Location"
            options={LOCATION_CHIPS}
            selected={selectedLocations}
            multi={true}
            onChange={setSelectedLocations}
          />
          <ChipGroup
            label="Mode"
            options={MODE_OPTIONS}
            selected={selectedModes}
            multi={false}
            onChange={setSelectedModes}
          />
          <ChipGroup
            label="Category"
            options={CATEGORY_OPTIONS}
            selected={selectedCategories}
            multi={true}
            onChange={setSelectedCategories}
          />

          {/* Full location list */}
          <details>
            <summary className="cursor-pointer text-xs font-medium text-indigo-600 hover:underline list-none">
              More locations ▾
            </summary>
            <div className="mt-3 flex flex-wrap gap-2">
              {LOCATIONS.map((loc) => {
                const active = selectedLocations.includes(loc);
                return (
                  <button
                    key={loc}
                    type="button"
                    onClick={() => {
                      const withoutAll = selectedLocations.filter(
                        (l) => l !== "All",
                      );
                      const next = withoutAll.includes(loc)
                        ? withoutAll.filter((l) => l !== loc)
                        : [...withoutAll, loc];
                      setSelectedLocations(
                        next.length === 0 ? ["All"] : next,
                      );
                    }}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      active
                        ? "bg-indigo-600 text-white"
                        : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                    }`}
                  >
                    {loc}
                  </button>
                );
              })}
            </div>
          </details>
        </div>

        {/* Results */}
        {resultCount === 0 ? (
          <EmptyStateCard
            recommendations={fallbackRecs}
            loading={fallbackLoading}
          />
        ) : (
          <div className="space-y-4">
            {filteredOpportunities.map((opp) => (
              <OpportunityCard
                key={opp.id}
                opportunity={opp}
                score={computeCompatibilityScore(profile, opp)}
                matchResult={matchResults.get(opp.id)}
                expanded={expandedIds.has(opp.id)}
                profile={profile}
                onToggle={() => handleToggleCard(opp.id)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
