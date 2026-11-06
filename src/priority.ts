// Priority is NOT chosen by the AI. The AI judges impact and urgency, and this
// fixed table turns them into a priority, the same way ServiceNow's default
// incident priority lookup does (1 = Critical ... 5 = Planning).
import type { Impact, Urgency } from "./schema";

// ServiceNow stores impact and urgency as 1 (high), 2 (medium), 3 (low).
export const IMPACT_TO_SN: Record<Impact, 1 | 2 | 3> = { whole_org: 1, multiple_users: 2, single_user: 3 };
export const URGENCY_TO_SN: Record<Urgency, 1 | 2 | 3> = { high: 1, medium: 2, low: 3 };

const MATRIX: Record<number, Record<number, number>> = {
  1: { 1: 1, 2: 2, 3: 3 },
  2: { 1: 2, 2: 3, 3: 4 },
  3: { 1: 3, 2: 4, 3: 5 },
};

export const PRIORITY_LABELS: Record<number, string> = {
  1: "1 - Critical",
  2: "2 - High",
  3: "3 - Moderate",
  4: "4 - Low",
  5: "5 - Planning",
};

export function priorityFor(impact: Impact, urgency: Urgency): number {
  return MATRIX[IMPACT_TO_SN[impact]][URGENCY_TO_SN[urgency]];
}
