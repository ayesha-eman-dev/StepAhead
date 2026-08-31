import type { Opportunity } from "@/types";
import opportunities from "@/data/opportunities.json";

export function getOpportunities(): Opportunity[] {
  return opportunities as Opportunity[];
}
