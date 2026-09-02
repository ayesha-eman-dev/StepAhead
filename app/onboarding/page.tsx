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
          This stays in your browser under{" "}
          <span className="font-medium text-neutral-800">stepahead_profile</span>
          . Nothing is sent to a server from this page.
        </p>

        <form onSubmit={handleSubmit} className="mt-12 space-y-10">
          <div className="grid gap-6 sm:grid-cols-2">
            <label className="block text-sm font-medium text-neutral-800">
              Degree
              <input
                required
                name="degree"
                value={profile.degree}
                onChange={(event) =>
                  setProfile((current) => ({
                    ...current,
                    degree: event.target.value,
                  }))
                }
                placeholder="B.Tech"
                className={inputClass}
              />
            </label>
            <label className="block text-sm font-medium text-neutral-800">
              Field
              <input
                required
                name="field"
                value={profile.field}
                onChange={(event) =>
                  setProfile((current) => ({
                    ...current,
                    field: event.target.value,
                  }))
                }
                placeholder="Computer Science"
                className={inputClass}
              />
            </label>
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

          <fieldset>
            <legend className="text-sm font-medium text-neutral-800">
              Skills
            </legend>
            <p className="mt-1 text-sm text-neutral-500">
              Choose all that apply.
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {skillOptions.map((skill) => (
                <label
                  key={skill}
                  className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800"
                >
                  <input
                    type="checkbox"
                    checked={profile.skills.includes(skill)}
                    onChange={() =>
                      setProfile((current) => ({
                        ...current,
                        skills: toggleValue(current.skills, skill),
                      }))
                    }
                    className="rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  {skill}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-medium text-neutral-800">
              Interests
            </legend>
            <p className="mt-1 text-sm text-neutral-500">
              Choose all that apply.
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {interestOptions.map((interest) => (
                <label
                  key={interest}
                  className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800"
                >
                  <input
                    type="checkbox"
                    checked={profile.interests.includes(interest)}
                    onChange={() =>
                      setProfile((current) => ({
                        ...current,
                        interests: toggleValue(current.interests, interest),
                      }))
                    }
                    className="rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  {interest}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-medium text-neutral-800">
              Preferred types
            </legend>
            <p className="mt-1 text-sm text-neutral-500">
              What kinds of opportunities do you want in your feed?
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {PREFERRED_TYPES.map((type) => (
                <label
                  key={type}
                  className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm capitalize text-neutral-800"
                >
                  <input
                    type="checkbox"
                    checked={profile.preferredTypes.includes(type)}
                    onChange={() =>
                      setProfile((current) => ({
                        ...current,
                        preferredTypes: toggleValue(
                          current.preferredTypes,
                          type,
                        ),
                      }))
                    }
                    className="rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  {type}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-6 sm:grid-cols-2">
            <label className="block text-sm font-medium text-neutral-800">
              Preferred location
              <select
                required
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
                <option value="">Select a location</option>
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
                required
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
                <option value="">Select a mode</option>
                {PREFERRED_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {mode}
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
