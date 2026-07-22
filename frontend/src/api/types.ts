// Mirrors the backend's wire format (backend/src/api/serializers.ts,
// history.ts, reference-data.ts, triage/queue.ts). Kept as plain types
// here rather than a shared package — the frontend/backend split is
// deliberate (Implementation Companion Part B: light SPA, no shared
// build step) and this surface is small enough to hand-mirror.

export type DecisionOutcome = 'APPROVE' | 'DECLINE' | 'ROUTE' | 'NOT_REQUIRED';

export interface CoPayment {
  amount: number;
  reason: string;
}

export interface LengthOfStay {
  days: number;
  level: string;
}

export interface GateResultPayload {
  gate_number: number;
  gate_name: string;
  outcome: string;
  passed: boolean;
  reason: string;
}

export interface AuthDecisionPayload {
  decision: DecisionOutcome;
  auth_id: string;
  member_id: string;
  funding_source: 'RISK_PMB' | 'DAY_TO_DAY' | 'PMSA' | null;
  co_payment: CoPayment | null;
  reimbursement_basis: string | null;
  length_of_stay: LengthOfStay | null;
  reasons: string[];
  gate_results: GateResultPayload[];
  rules_version: string;
  created_at: string;
  caveat: string;
}

export interface AuthDecisionSummary {
  auth_id: string;
  member_id: string;
  decision: DecisionOutcome;
  created_at: string;
  rules_version: string;
  codes: Record<string, unknown>;
  /** HIV/AIDS confidentiality (Technical Build Spec §7) — true even on a redacted record, so the UI can show *that* something was restricted. */
  is_hiv_related: boolean;
  created_by: string | null;
}

export interface OverrideRecordPayload {
  overridden_by: string;
  reason: string;
  created_at: string;
}

export interface ReviewOutcomePayload {
  reviewer: string;
  outcome: 'APPROVED' | 'DECLINED' | 'MORE_INFO_REQUESTED';
  reason: string;
  decided_at: string;
}

export interface AuthDecisionDetail extends AuthDecisionSummary {
  funding_source: AuthDecisionPayload['funding_source'];
  co_payment: CoPayment | null;
  reimbursement_basis: string | null;
  length_of_stay: LengthOfStay | null;
  reasons: string[];
  gate_results: GateResultPayload[];
  caveat: string;
  review_outcome: ReviewOutcomePayload | null;
  overrides: OverrideRecordPayload[];
}

export interface Icd10SearchResult {
  code: string;
  description: string;
  isPmb: boolean;
  cdlFlag: boolean;
}

export interface TariffSearchResult {
  code: string;
  description: string;
  requiresPreauth: boolean;
  category: string;
}

export interface NappiSearchResult {
  nappiCode: string;
  product: string;
  formularyFlag: boolean;
}

export interface ModifierSearchResult {
  code: string;
  effectRule: string;
}

export interface NetworkProviderSearchResult {
  practiceNo: string;
  providerType: string;
  networkMembership: string;
}

export interface MemberLookupResult {
  memberId: string;
  optionCode: string;
  optionName: string | null;
  status: string;
  joinDate: string;
  priorCoverMonths: number;
  dob: string;
  benefitYear: number;
}

/** GET /users (backend/src/api/server.ts) — the demo accounts seeded by db/migrations/1700000000004_security-hardening.js, used by the account picker (auth/current-user-storage.ts is the client-side stopgap for real SSO). */
export interface AppUser {
  userId: string;
  name: string;
  role: 'consultant' | 'clinical_maintainer' | 'admin' | 'auditor';
}

export interface QueueItemSummary {
  authId: string;
  memberId: string;
  reasonForRouting: string;
  createdAt: string;
}

/** Layer B's advisory extraction/recommendation for a routed case (Technical Build Spec §5) — never a decision, always attributed to a model. */
export interface LayerBSuggestionPayload {
  id: string;
  authId: string;
  modelIdentifier: string;
  endpointType: 'PRIVATE' | 'PUBLIC';
  confidence: number;
  recommendedAction: 'APPROVED' | 'DECLINED' | 'MORE_INFO_REQUESTED' | null;
  extractedEvidence: { summary: string; keyFindings: string[]; concerns: string[] };
  createdAt: string;
}

export interface QueueItemDetail extends QueueItemSummary {
  codes: Record<string, unknown>;
  reasons: string[];
  rulesVersion: string;
  layerBSuggestion?: LayerBSuggestionPayload;
}

/** What Screen 1 submits — see backend/src/engine/types.ts AuthRequest. */
export interface AuthRequestInput {
  memberId: string;
  dependantCode?: string;
  icd10Code: string;
  tariffCode: string;
  nappiCode?: string;
  modifierCode?: string;
  practiceNo?: string;
  serviceDate: string;
  setting: 'IN_HOSPITAL' | 'OUT_HOSPITAL';
  requestedLengthOfStayDays?: number;
  requestedLevelOfCare?: string;
  preAuthLeadHours?: number;
  isEmergency?: boolean;
  hasReferral?: boolean;
  quotedAmount?: number;
  dispensingIsDsp?: boolean;
  motivationText?: string;
}
