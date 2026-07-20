import type { CoPayment } from '../domain/decision.js';
import type { Dependant, Icd10, Member, Nappi, Option, Tariff } from '../domain/entities.js';

/**
 * Input to a single gate. Fields are optional because not every gate needs
 * every lookup; each gate reads only what its "Reads" column specifies
 * (Technical Build Spec §4.2). Reference-data lookups (BenefitBalance,
 * NetworkProvider, etc.) are resolved by the ingestion layer, not embedded
 * here directly, and get added to this context as Phase 2 wires them in.
 */
export interface GateContext {
  member: Member;
  dependant?: Dependant;
  option: Option;
  icd10?: Icd10;
  tariff?: Tariff;
  nappi?: Nappi;
  serviceDate: string;
}

/**
 * A gate's outcome. `CONTINUE` moves to the next gate; every other value is
 * terminal for the sequence (Technical Build Spec §4.2 "On fail" column).
 */
export type GateOutcome =
  | 'CONTINUE'
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

export type Gate = (ctx: GateContext) => GateResult | Promise<GateResult>;
