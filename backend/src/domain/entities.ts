/**
 * Core relational entities (Technical Build Spec §2.1). Field shapes follow
 * the spec's key-fields column; enums are left as string until Phase-0
 * reference data confirms the real value sets (Implementation Companion
 * Part A).
 */

export interface Member {
  memberId: string;
  optionCode: string;
  status: string;
  joinDate: string;
  priorCoverMonths: number;
  dob: string;
}

export interface Dependant {
  dependantCode: string;
  memberId: string;
  dob: string;
  joinDate: string;
}

export interface Option {
  optionCode: string;
  name: string;
  networkType: 'REO' | 'NETWORK' | 'OPEN';
  benefitYear: number;
}

export interface BenefitLimit {
  optionCode: string;
  benefitType: string;
  subLimit: number;
  basis: 'PBPA' | 'PFPA';
  benefitYear: number;
}

export interface BenefitBalance {
  memberId: string;
  benefitType: string;
  used: number;
  available: number;
  benefitYear: number;
}

export interface Icd10 {
  code: string;
  description: string;
  isPmb: boolean;
  dtpId: string | null;
  cdlFlag: boolean;
}

export interface Dtp {
  dtpId: string;
  description: string;
  pmbLevelOfCare: string;
}

export interface Tariff {
  code: string;
  description: string;
  requiresPreauth: boolean;
  category: string;
}

export interface Nappi {
  nappiCode: string;
  product: string;
  mplPrice: number | null;
  drpPrice: number | null;
  formularyFlag: boolean;
}

/** Tariff modifiers per Provider FAQ: 0009 / 0011 / 0013 / 0018 / 0074 / 0075. */
export interface Modifier {
  code: string;
  effectRule: string;
}

export interface NetworkProvider {
  practiceNo: string;
  providerType: string;
  networkMembership: string;
  optionScope: string[];
}

export interface CoPaymentRule {
  trigger: string;
  optionCode: string;
  amountOrPct: number;
  benefitYear: number;
}

export interface WaitingPeriodRule {
  scenario: string;
  gwpMonths: number;
  cswpMonths: number;
  pmbCovered: boolean;
}

/** Every dataset load is versioned; nothing enters the engine unversioned (§3.2). */
export interface RuleVersion {
  versionId: string;
  benefitYear: number;
  effectiveFrom: string;
  sourceDoc: string;
  checksum: string;
}
