"use client";

// ---------------------------------------------------------------------------
// Tech-string casing overrides
// toTitleCase() manges acronyms like "css" → "Css"; this map corrects them.
// ---------------------------------------------------------------------------
const CASING_OVERRIDES: Record<string, string> = {
  Css: "CSS",
  Html: "HTML",
  Sql: "SQL",
  Apis: "APIs",
  Api: "API",
  Github: "GitHub",
  Ui: "UI",
  Ux: "UX",
  Aws: "AWS",
  Gcp: "GCP",
  Ai: "AI",
  Ml: "ML",
  Nlp: "NLP",
  Llm: "LLM",
  Agi: "AGI",
  Oop: "OOP",
  Cli: "CLI",
  Cicd: "CI/CD",
  Nosql: "NoSQL",
  Devops: "DevOps",
  Graphql: "GraphQL",
  Tensorflow: "TensorFlow",
  Pytorch: "PyTorch",
  Numpy: "NumPy",
  Matlab: "MATLAB",
  "Node.Js": "Node.js",
  "Next.Js": "Next.js",
  "React.Js": "React.js",
  "Vue.Js": "Vue.js",
  "Three.Js": "Three.js",
  "Scikit-Learn": "scikit-learn",
  Macos: "macOS",
  Ios: "iOS",
  Seo: "SEO",
  Sem: "SEM",
  Fmcg: "FMCG",
  ".Net": ".NET",
  Postgresql: "PostgreSQL",
  Mongodb: "MongoDB",
  Mysql: "MySQL",
  "Rest Apis": "REST APIs",
  "Llm Apis": "LLM APIs",
  "Siem Tools": "SIEM Tools",
  "Ai Agents": "AI Agents",
  Web3: "Web3",
  Solidity: "Solidity",
  Hyperledger: "Hyperledger",
  Openshift: "OpenShift",
  Kubernetes: "Kubernetes",
};

function toTitleCase(str: string): string {
  return str.toLowerCase().replace(/(?:^|\s)\S/g, (c) => c.toUpperCase());
}

function normaliseLabel(raw: string, useTitleCase: boolean): string {
  if (!useTitleCase) return raw;
  const titled = toTitleCase(raw);
  return CASING_OVERRIDES[titled] ?? titled;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function PillSelector({
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
    <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 mt-3">
      {options.map((opt) => {
        const active = selected.includes(opt);
        const label = normaliseLabel(opt, titleCase);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onToggle(opt)}
            className={`transition-all ${
              active
                ? "bg-indigo-50 text-indigo-700 border-2 border-indigo-600 font-semibold text-xs px-3 py-1.5 rounded-full shadow-sm"
                : "bg-slate-100/80 text-slate-700 hover:bg-slate-200/80 border border-slate-200/60 font-medium text-xs px-3 py-1.5 rounded-full"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
