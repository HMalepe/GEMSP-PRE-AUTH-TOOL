import type { Pool } from 'pg';
import type { AuthDecision } from '../domain/decision.js';
import type { AuthRequest } from '../engine/types.js';

/**
 * Every decision persisted immutably with inputs, rules_version and
 * reasons (Technical Build Spec §6 Auditability) — every outcome, not
 * just approvals, since a declined or routed request is just as much
 * part of the audit trail.
 */
export async function persistAuthDecision(pool: Pool, request: AuthRequest, decision: AuthDecision): Promise<void> {
  const codes = {
    icd10Code: request.icd10Code,
    tariffCode: request.tariffCode,
    nappiCode: request.nappiCode ?? null,
    modifierCode: request.modifierCode ?? null,
  };

  await pool.query(
    `INSERT INTO auth_decision
       (auth_id, member_id, codes, decision, funding_source, co_payment, reimbursement_basis, length_of_stay, reasons, rules_version, caveat)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6::jsonb, $7, $8::jsonb, $9::jsonb, $10, $11)`,
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
      decision.rulesVersion,
      decision.caveat,
    ],
  );
}
