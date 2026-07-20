import type { Gate } from '../types.js';

/**
 * Gate 2 — ICD-10 valid & codable.
 * Reads: ICD10 + Tariff/Nappi. On fail: Route.
 * Blocked on the CMS PMB ICD-10 coded list (Implementation Companion A.2.1,
 * unblocks Gate 3 too — this gate needs the same load).
 */
export const gate2Icd10Valid: Gate = () => {
  throw new Error('gate2Icd10Valid not implemented (Technical Build Spec §4.2)');
};
