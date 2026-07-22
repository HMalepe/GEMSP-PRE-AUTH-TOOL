import { isHivAuthorised, type Role } from './roles.js';

/**
 * HIV-confidentiality redaction (Technical Build Spec §7: "mirror GEMS's
 * confidential-DMP posture; restrict HIV-flagged records to authorised
 * roles"). A decision is redacted for anyone who is neither an
 * HIV-authorised role nor the person who originally submitted it — the
 * submitter necessarily already knows the diagnosis, since they typed the
 * ICD-10 code themselves.
 *
 * `is_hiv_related` is a boolean snapshotted onto auth_decision at write
 * time from icd10.hiv_flag (see persist-decision.ts) — it is deliberately
 * left visible even on a redacted record, so the viewer sees *that*
 * something was restricted and why, rather than a silently incomplete
 * record that looks like ordinary missing data.
 */
export interface HivGuardedRecord {
  is_hiv_related: boolean;
  created_by: string | null;
}

export interface Viewer {
  userId: string;
  role: Role;
}

export function canViewHivDetail(record: HivGuardedRecord, viewer: Viewer): boolean {
  if (!record.is_hiv_related) {
    return true;
  }
  if (isHivAuthorised(viewer.role)) {
    return true;
  }
  return record.created_by !== null && record.created_by === viewer.userId;
}

export const HIV_REDACTED_REASON =
  '[REDACTED — HIV/AIDS confidentiality restriction (Technical Build Spec §7). Contact a clinical maintainer or admin for access.]';
export const HIV_REDACTED_CODE = '[REDACTED]';

interface WithCodes {
  codes: Record<string, unknown>;
}

/** For list/summary views: only the diagnosis code itself needs blanking. */
export function redactHivSummary<T extends HivGuardedRecord & WithCodes>(record: T, viewer: Viewer): T {
  if (canViewHivDetail(record, viewer)) {
    return record;
  }
  return { ...record, codes: { ...record.codes, icd10Code: HIV_REDACTED_CODE } };
}

interface GateResultLike {
  reason: string;
}

interface WithDetail extends WithCodes {
  reasons: string[];
  gate_results: GateResultLike[];
}

/** For full decision-detail views: the diagnosis code, the flat reasons list, and every gate's free-text reason (which often names the diagnosis) all need blanking — outcomes/pass-fail markers/amounts stay intact. */
export function redactHivDetail<T extends HivGuardedRecord & WithDetail>(record: T, viewer: Viewer): T {
  if (canViewHivDetail(record, viewer)) {
    return record;
  }
  return {
    ...record,
    codes: { ...record.codes, icd10Code: HIV_REDACTED_CODE },
    reasons: [HIV_REDACTED_REASON],
    gate_results: record.gate_results.map((g) => ({ ...g, reason: HIV_REDACTED_REASON })),
  };
}
