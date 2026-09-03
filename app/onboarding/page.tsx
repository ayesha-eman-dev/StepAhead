"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getOpportunities } from "@/lib/opportunities";
import type { StudentProfile } from "@/types";

const STORAGE_KEY = "stepahead_profile";

const emptyProfile: StudentProfile = {
  degree: "",
  field: "",
  semester: "",
  skills: [],
  interests: [],
  preferredTypes: [],
  preferredLocation: "",
  preferredMode: "",
};

const PREFERRED_TYPES = [
  "internship",
  "hackathon",
  "competition",
  "workshop",
  "course",
] as const;

const PREFERRED_MODES = ["remote", "onsite", "hybrid"] as const;

const DEGREE_OPTIONS = ["BS", "B.Com", "BBA", "BE", "MS", "Other"] as const;

const FIELD_OPTIONS = [
  "Software Engineering",
  "Computer Science",
  "Data Science",
  "Electrical Engineering",
  "Mechanical Engineering",
  "Finance",
  "Marketing",
  "Architecture",
  "Other",
] as const;

/** Convert any string to Title Case */
function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/(?:^|\s)\S/g, (c) => c.toUpperCase());
}

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) =>
    a.localeCompare(b),
  );
}

function isStudentProfile(value: unknown): value is StudentProfile {
  if (!value || typeof value !== "object") return false;
  const profile = value as StudentProfile;
  return (
    typeof profile.degree === "string" &&
    typeof profile.field === "string" &&
    typeof profile.semester === "string" &&
    Array.isArray(profile.skills) &&
    Array.isArray(profile.interests) &&
    Array.isArray(profile.preferredTypes) &&
    typeof profile.preferredLocation === "string" &&
    typeof profile.preferredMode === "string"
  );
}

function toggleValue(list: string[], value: string) {
  return list.includes(value)
    ? list.filter((item) => item !== value)
    : [...list, value];
}

// ---------------------------------------------------------------------------
// Pill/chip selector component
// ---------------------------------------------------------------------------
function PillSelector({
  options,
  selected,
  onToggle,
  titleCase = true,
}: {
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  titleCase?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {options.map((opt) => {
        const active = selected.includes(opt);
        const label = titleCase ? toTitleCase(opt) : opt;
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onToggle(opt)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-all border ${
              active
                ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                : "bg-white text-neutral-600 border-neutral-200 hover:border-indigo-300 hover:text-indigo-600"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Searchable select with "Other" option
// ---------------------------------------------------------------------------
function SearchableSelect({
  label,
  options,
  value,
  onChange,
  placeholder,
  inputClass,
}: {
  label: string;
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  inputClass: string;
}) {
  const isOther = value !== "" && !options.slice(0, -1).includes(value);
  const [showCustom, setShowCustom] = useState(isOther);

  function handleSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    const v = e.target.value;
    if (v === "Other") {
      setShowCustom(true);
      onChange("");
    } else {
      setShowCustom(false);
      onChange(v);
    }
  }

  // Determine what the select should show
  const selectValue = showCustom ? "Other" : value;

  return (
    <label className="block text-sm font-medium text-neutral-800">
      {label}
      <select
        value={selectValue}
        onChange={handleSelect}
        className={inputClass}
      >
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
      {showCustom && (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`Type your ${label.toLowerCase()}…`}
          className={`${inputClass} mt-2`}
          autoFocus
        />
      )}
    </label>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const opportunities = getOpportunities();
  const [profile, setProfile] = useState<StudentProfile>(emptyProfile);
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState("");

  const skillOptions = useMemo(
    () =>
      uniqueSorted([
        ...opportunities.flatMap((item) => item.skills),
        ...profile.skills,
      ]),
    [opportunities, profile.skills],
  );

  const interestOptions = useMemo(
    () =>
      uniqueSorted([
        ...opportunities.flatMap((item) => item.interests),
        ...profile.interests,
      ]),
    [opportunities, profile.interests],
  );

  const locationOptions = useMemo(
    () => uniqueSorted(opportunities.map((item) => item.location)),
    [opportunities],
  );

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      if (isStudentProfile(parsed)) {
        setProfile(parsed);
        setIsEditing(true);
      }
    } catch {
      // Ignore unreadable stored data and show an empty form.
    }
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (profile.skills.length === 0) {
      setError("Select at least one skill.");
      return;
    }
    if (profile.interests.length === 0) {
      setError("Select at least one interest.");
      return;
    }
    if (profile.preferredTypes.length === 0) {
      setError("Select at least one opportunity type.");
      return;
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    router.push("/feed");
  }

  const inputClass =
    "mt-1 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100";

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 font-[family-name:var(--font-geist-sans)]">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-6 py-6">
        <Link
          href="/"
          className="text-sm font-semibold tracking-tight text-indigo-600"
        >
          StepAhead
        </Link>
        <span className="text-sm text-neutral-500">Saved on this device</span>
      </header>

      <main className="mx-auto max-w-3xl px-6 pb-24 pt-4">
        <h1 className="text-3xl font-semibold tracking-tight text-neutral-900">
          {isEditing ? "Edit your profile" : "Tell us about you"}
        </h1>
        <p className="mt-3 max-w-xl text-neutral-600">
          Your profile is saved locally on this device. Nothing is sent to a
          server from this page.
        </p>

        <form onSubmit={handleSubmit} className="mt-12 space-y-10">
          {/* Degree & Field — searchable selects */}
          <div className="grid gap-6 sm:grid-cols-2">
            <SearchableSelect
              label="Degree"
              options={DEGREE_OPTIONS}
              value={profile.degree}
              onChange={(v) => setProfile((p) => ({ ...p, degree: v }))}
              placeholder="Select a degree"
              inputClass={inputClass}
            />
            <SearchableSelect
              label="Field"
              options={FIELD_OPTIONS}
              value={profile.field}
              onChange={(v) => setProfile((p) => ({ ...p, field: v }))}
              placeholder="Select a field"
              inputClass={inputClass}
            />
            <label className="block text-sm font-medium text-neutral-800 sm:col-span-2">
              Semester
              <input
                required
                name="semester"
                value={profile.semester}
                onChange={(event) =>
                  setProfile((current) => ({
                    ...current,
                    semester: event.target.value,
                  }))
                }
                placeholder="5"
                className={inputClass}
              />
            </label>
          </div>

          {/* Skills */}
          <fieldset>
            <legend className="text-sm font-medium text-neutral-800">
              Skills
            </legend>
            <p className="mt-1 text-sm text-neutral-500">
              Choose all that apply.
            </p>
            <PillSelector
              options={skillOptions}
              selected={profile.skills}
              onToggle={(skill) =>
                setProfile((p) => ({
                  ...p,
                  skills: toggleValue(p.skills, skill),
                }))
              }
            />
          </fieldset>

          {/* Interests */}
          <fieldset>
            <legend className="text-sm font-medium text-neutral-800">
              Interests
            </legend>
            <p className="mt-1 text-sm text-neutral-500">
              Choose all that apply.
            </p>
            <PillSelector
              options={interestOptions}
              selected={profile.interests}
              onToggle={(interest) =>
                setProfile((p) => ({
                  ...p,
                  interests: toggleValue(p.interests, interest),
                }))
              }
            />
          </fieldset>

          {/* Preferred types */}
          <fieldset>
            <legend className="text-sm font-medium text-neutral-800">
              Preferred opportunity types
            </legend>
            <p className="mt-1 text-sm text-neutral-500">
              What kinds of opportunities do you want in your feed?
            </p>
            <PillSelector
              options={[...PREFERRED_TYPES]}
              selected={profile.preferredTypes}
              onToggle={(type) =>
                setProfile((p) => ({
                  ...p,
                  preferredTypes: toggleValue(p.preferredTypes, type),
                }))
              }
            />
          </fieldset>

          {/* Preferred location & mode */}
          <div className="grid gap-6 sm:grid-cols-2">
            <label className="block text-sm font-medium text-neutral-800">
              Preferred location
              <select
                name="preferredLocation"
                value={profile.preferredLocation}
                onChange={(event) =>
                  setProfile((current) => ({
                    ...current,
                    preferredLocation: event.target.value,
                  }))
                }
                className={inputClass}
              >
                <option value="">All locations</option>
                {locationOptions.map((location) => (
                  <option key={location} value={location}>
                    {location}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium text-neutral-800">
              Preferred mode
              <select
                name="preferredMode"
                value={profile.preferredMode}
                onChange={(event) =>
                  setProfile((current) => ({
                    ...current,
                    preferredMode: event.target.value,
                  }))
                }
                className={inputClass}
              >
                <option value="">All modes</option>
                {PREFERRED_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {toTitleCase(mode)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {error ? (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-6 py-3 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700"
          >
            {isEditing ? "Save and view feed" : "Save and continue"}
          </button>
        </form>
      </main>
    </div>
  );
}
