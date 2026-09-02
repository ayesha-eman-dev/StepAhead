export interface Opportunity {
  id: string;
  title: string;
  organization: string;
  category: string;
  shortDescription: string;
  fullDescription: string;
  skills: string[];
  interests: string[];
  eligibility: string;
  location: string;
  mode: string;
  deadline: string;
  isFree: boolean;
  applicationUrl: string;
  sourceStatus: "verified" | "seeded";
  sourceNote?: string;
}

export interface StudentProfile {
  degree: string;
  field: string;
  semester: string;
  skills: string[];
  interests: string[];
  preferredTypes: string[];
  preferredLocation: string;
  preferredMode: string;
}

export interface MatchResult {
  opportunityId: string;
  relevance: "Strong" | "Moderate" | "Light";
  note: string;
  missingSkills: string[];
  summary: string;
}
