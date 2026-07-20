import type { DatasetLoader } from '../types.js';

/**
 * CMS PMB ICD-10 coded list + 271 DTPs (Implementation Companion A.2.1).
 * Unblocks Gate 3. Source: medicalschemes.co.za, XLSX download.
 * Must enforce precedence in this loader: where an ICD-10's PMB status
 * conflicts with a scheme code, the CMS PMB code wins (Technical Build
 * Spec §2.2 "Data-quality rule") — do not encode that in gate logic.
 */
export const loadCmsPmbIcd10: DatasetLoader = () => {
  throw new Error('loadCmsPmbIcd10 not implemented — dataset not yet acquired (Implementation Companion A.1)');
};
