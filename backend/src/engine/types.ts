import type { CoPayment } from '../domain/decision.js';
import type {
  BenefitBalance,
  BenefitLimit,
  CoPaymentRule,
  Dtp,
  Icd10,
  Member,
  Modifier,
  Nappi,
  NetworkProvider,
  Option,
  Tariff,
  WaitingPeriodRule,
} from '../domain/entities.js';

/**
 * What a consultant actually submits (Implementation Companion §C.2).
 * Optional fields exist only where a gate or the co-payment calc needs
 * them and the §2.1 schema has nowhere else to source them from — see
 * each field's gate/module reference.
 */
export interface AuthRequest {
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
  /** Hours between the auth request and the admission/service — feeds the LATE_AUTH co-payment trigger. */
  preAuthLeadHours?: number;
  isEmergency?: boolean;
  /** Whether a specialist consult has an FP/GP referral — feeds the NON_DSP no-referral co-payment trigger. */
  hasReferral?: boolean;
  /**
   * The quoted/motivated cost for this request — needed as the base for
   * any percentage co-payment (30% triggers, DRP/MPL price difference).
   * Without it those triggers still fire but can't resolve a rand amount.
   */
  quotedAmount?: number;
  /** Was the NAPPI dispensed at a DSP-nominated pharmacy? Feeds the medicine non-DSP 30% leg. */
  dispensingIsDsp?: boolean;
  /**
   * Free-text motivation letter / clinical notes / quotation, if the
   * consultant has one to attach. Layer A's gates never read this — it
   * exists solely for Layer B extraction on a case that routes
   * (Technical Build Spec §5.1; triage/extraction.ts).
   */
  motivationText?: string;
}

/**
 * Everything a gate needs, already resolved from Postgres for this
 * request's member/option/benefit_year — gates never query the DB
 * themselves (Build Spec §4: "pure function (request, reference data) ->
 * result"). Building this bundle is the resolver's job, not the engine's.
 */
export interface ReferenceData {
  benefitYear: number;
  member: Member;
  option: Option;
  icd10?: Icd10;
  dtp?: Dtp;
  tariff?: Tariff;
  nappi?: Nappi;
  modifier?: Modifier;
  networkProvider?: NetworkProvider;
  benefitLimits: BenefitLimit[];
  benefitBalances: BenefitBalance[];
  coPaymentRules: CoPaymentRule[];
  waitingPeriodRules: WaitingPeriodRule[];
}

/**
 * CONTINUE / CONTINUE_WITH_COPAY both advance the sequence — the
 * difference is only whether a copay note gets carried into Gate 9's
 * aggregation. Everything else is terminal (Build Spec §4.2 "fail-fast"):
 * a request stops at the first DECLINE/ROUTE/SKIP_TO_CLAIM_RULES, or
 * reaches Gate 9, which always resolves APPROVE_WITH_COPAY (copay may be
 * zero — Gate 9 is the only gate allowed to emit this outcome).
 */
export type GateOutcome =
  | 'CONTINUE'
  | 'CONTINUE_WITH_COPAY'
  | 'DECLINE'
  | 'ROUTE'
  | 'SKIP_TO_CLAIM_RULES'
  | 'APPROVE_WITH_COPAY';

export interface GateResult {
  gateNumber: number;
  gateName: string;
  outcome: GateOutcome;
  reason: string;
  copay?: CoPayment;
}

/**
 * A pure function: no DB access, no I/O, no randomness. `priorResults` is
 * available so Gate 9 can aggregate what earlier gates found (e.g. Gate
 * 6's network copay) — gates 0-8 ignore it.
 */
export type Gate = (request: AuthRequest, ref: ReferenceData, priorResults: GateResult[]) => GateResult;
