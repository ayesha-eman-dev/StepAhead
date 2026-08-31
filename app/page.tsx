import Link from "next/link";

const steps = [
  {
    number: "1",
    title: "Tell us about you",
    description:
      "Share your degree, skills, interests, and the kinds of opportunities you want. Saved only on this device.",
  },
  {
    number: "2",
    title: "See what fits",
    description:
      "Browse internships, hackathons, competitions, workshops, and courses ranked by a clear compatibility score.",
  },
  {
    number: "3",
    title: "Read a short note",
    description:
      "When available, a short AI note explains why a listing is a strong, moderate, or light match — it never replaces the score.",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 font-[family-name:var(--font-geist-sans)]">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <span className="text-sm font-semibold tracking-tight text-indigo-600">
          StepAhead
        </span>
        <Link
          href="/onboarding"
          className="text-sm font-medium text-neutral-600 transition-colors hover:text-indigo-600"
        >
          Get started
        </Link>
      </header>

      <main>
        <section className="mx-auto max-w-5xl px-6 pb-24 pt-16 sm:pb-32 sm:pt-24">
          <p className="mb-4 text-sm font-medium uppercase tracking-wider text-indigo-600">
            For students
          </p>
          <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-tight text-neutral-900 sm:text-5xl sm:leading-tight">
            Find internships and opportunities that actually fit you.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-neutral-600">
            StepAhead matches your skills and interests to internships,
            hackathons, competitions, workshops, and courses — no account, no
            clutter, just a ranked list you can act on.
          </p>
          <div className="mt-10">
            <Link
              href="/onboarding"
              className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-6 py-3 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700"
            >
              Get Started
            </Link>
          </div>
        </section>

        <section className="border-t border-neutral-200 bg-white">
          <div className="mx-auto max-w-5xl px-6 py-24 sm:py-28">
            <h2 className="text-2xl font-semibold tracking-tight text-neutral-900">
              How it works
            </h2>
            <p className="mt-3 max-w-xl text-neutral-600">
              Three steps. Your profile stays in the browser.
            </p>
            <ol className="mt-14 grid gap-12 sm:grid-cols-3 sm:gap-10">
              {steps.map((step) => (
                <li key={step.number}>
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-indigo-50 text-sm font-semibold text-indigo-600">
                    {step.number}
                  </span>
                  <h3 className="mt-4 text-lg font-medium text-neutral-900">
                    {step.title}
                  </h3>
                  <p className="mt-2 leading-relaxed text-neutral-600">
                    {step.description}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </main>
    </div>
  );
}
