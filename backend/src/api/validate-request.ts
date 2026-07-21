import type { AuthRequest } from '../engine/types.js';

export type ParseResult = { ok: true; value: AuthRequest } | { ok: false; errors: string[] };

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}
function isIsoDate(v: unknown): v is string {
  return typeof v === 'string' && !Number.isNaN(Date.parse(v));
}
function optionalString(v: unknown): v is string | undefined {
  return v === undefined || typeof v === 'string';
}
function optionalNumber(v: unknown): v is number | undefined {
  return v === undefined || typeof v === 'number';
}
function optionalBoolean(v: unknown): v is boolean | undefined {
  return v === undefined || typeof v === 'boolean';
}

/**
 * Hand-rolled on purpose — the request shape is small and stable, and a
 * schema library would be one more dependency for what's currently ~15
 * fields (Implementation Companion §C.2's field groups).
 */
export function parseAuthRequest(body: unknown): ParseResult {
  const errors: string[] = [];

  if (typeof body !== 'object' || body === null) {
    return { ok: false, errors: ['request body must be a JSON object'] };
  }
  const b = body as Record<string, unknown>;

  if (!isNonEmptyString(b.memberId)) errors.push('memberId is required and must be a string');
  if (!isNonEmptyString(b.icd10Code)) errors.push('icd10Code is required and must be a string');
  if (!isNonEmptyString(b.tariffCode)) errors.push('tariffCode is required and must be a string');
  if (!isIsoDate(b.serviceDate)) errors.push('serviceDate is required and must be a valid ISO date string');
  if (b.setting !== 'IN_HOSPITAL' && b.setting !== 'OUT_HOSPITAL') {
    errors.push('setting is required and must be IN_HOSPITAL or OUT_HOSPITAL');
  }

  if (!optionalString(b.dependantCode)) errors.push('dependantCode must be a string if provided');
  if (!optionalString(b.nappiCode)) errors.push('nappiCode must be a string if provided');
  if (!optionalString(b.modifierCode)) errors.push('modifierCode must be a string if provided');
  if (!optionalString(b.practiceNo)) errors.push('practiceNo must be a string if provided');
  if (!optionalString(b.requestedLevelOfCare)) errors.push('requestedLevelOfCare must be a string if provided');
  if (!optionalNumber(b.requestedLengthOfStayDays)) errors.push('requestedLengthOfStayDays must be a number if provided');
  if (!optionalNumber(b.preAuthLeadHours)) errors.push('preAuthLeadHours must be a number if provided');
  if (!optionalNumber(b.quotedAmount)) errors.push('quotedAmount must be a number if provided');
  if (!optionalBoolean(b.isEmergency)) errors.push('isEmergency must be a boolean if provided');
  if (!optionalBoolean(b.hasReferral)) errors.push('hasReferral must be a boolean if provided');
  if (!optionalBoolean(b.dispensingIsDsp)) errors.push('dispensingIsDsp must be a boolean if provided');

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      memberId: b.memberId as string,
      dependantCode: b.dependantCode as string | undefined,
      icd10Code: b.icd10Code as string,
      tariffCode: b.tariffCode as string,
      nappiCode: b.nappiCode as string | undefined,
      modifierCode: b.modifierCode as string | undefined,
      practiceNo: b.practiceNo as string | undefined,
      serviceDate: b.serviceDate as string,
      setting: b.setting as AuthRequest['setting'],
      requestedLengthOfStayDays: b.requestedLengthOfStayDays as number | undefined,
      requestedLevelOfCare: b.requestedLevelOfCare as string | undefined,
      preAuthLeadHours: b.preAuthLeadHours as number | undefined,
      isEmergency: b.isEmergency as boolean | undefined,
      hasReferral: b.hasReferral as boolean | undefined,
      quotedAmount: b.quotedAmount as number | undefined,
      dispensingIsDsp: b.dispensingIsDsp as boolean | undefined,
    },
  };
}
