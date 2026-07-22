import type { Pool } from 'pg';
import type { AuthDecision } from '../domain/decision.js';
import type { AuthRequest } from '../engine/types.js';

export interface PersistAuthDecisionOptions {
  /** The authenticated user who submitted this request — null only for legacy/pre-auth rows; every new decision has one (security/auth.ts). */
  createdBy: string | null;
  /** Snapshot of icd10.hiv_flag at decision time (Technical Build Spec §7 HIV confidentiality) — see security/redact.ts. */
  isHivRelated: boolean;
  /** pgcrypto symmetric key for motivation_text (security/encryption.ts). */
  encryptionKey: string;
}

/**
 * Every decision persisted immutably with inputs, rules_version and
 * reasons (Technical Build Spec §6 Auditability) — every outcome, not
 * just approvals, since a declined or routed request is just as much
 * part of the audit trail. motivation_text is encrypted at rest via
 * pgcrypto (§7 Encryption) — pgp_sym_encrypt is STRICT, so a null
 * motivationText still stores as a plain SQL NULL, not an encrypted
 * empty value.
 */
export async function persistAuthDecision(
  pool: Pool,
  request: AuthRequest,
  decision: AuthDecision,
  options: PersistAuthDecisionOptions,
): Promise<void> {
  const codes = {
    icd10Code: request.icd10Code,
    tariffCode: request.tariffCode,
    nappiCode: request.nappiCode ?? null,
    modifierCode: request.modifierCode ?? null,
  };

  await pool.query(
    `INSERT INTO auth_decision
       (auth_id, member_id, codes, decision, funding_source, co_payment, reimbursement_basis, length_of_stay, reasons, gate_results, rules_version, caveat, motivation_text, created_by, is_hiv_related)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6::jsonb, $7, $8::jsonb, $9::jsonb, $10::jsonb, $11, $12, pgp_sym_encrypt($13::text, $14::text), $15, $16)`,
    [
      decision.authId,
      decision.memberId,
      JSON.stringify(codes),
      decision.decision,
      decision.fundingSource,
      decision.coPayment ? JSON.stringify(decision.coPayment) : null,
      decision.reimbursementBasis,
      decision.lengthOfStay ? JSON.stringify(decision.lengthOfStay) : null,
      JSON.stringify(decision.reasons),
      JSON.stringify(decision.gateResults),
      decision.rulesVersion,
      decision.caveat,
      request.motivationText ?? null,
      options.encryptionKey,
      options.createdBy,
      options.isHivRelated,
    ],
  );
}
