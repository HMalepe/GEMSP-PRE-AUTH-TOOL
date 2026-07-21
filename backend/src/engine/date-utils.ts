/** Whole months from `fromIso` to `toIso`, floored, never negative. */
export function monthsBetween(fromIso: string, toIso: string): number {
  const from = new Date(fromIso);
  const to = new Date(toIso);
  let months = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
  if (to.getUTCDate() < from.getUTCDate()) {
    months -= 1;
  }
  return Math.max(0, months);
}

/** Age in whole years as of `atIso`. */
export function ageAt(dobIso: string, atIso: string): number {
  const dob = new Date(dobIso);
  const at = new Date(atIso);
  let age = at.getUTCFullYear() - dob.getUTCFullYear();
  const hadBirthdayThisYear =
    at.getUTCMonth() > dob.getUTCMonth() ||
    (at.getUTCMonth() === dob.getUTCMonth() && at.getUTCDate() >= dob.getUTCDate());
  if (!hadBirthdayThisYear) {
    age -= 1;
  }
  return age;
}

/** The benefit_year a request's service date resolves against (Technical Build Spec §3.2). */
export function benefitYearFromServiceDate(serviceDateIso: string): number {
  return new Date(serviceDateIso).getUTCFullYear();
}
