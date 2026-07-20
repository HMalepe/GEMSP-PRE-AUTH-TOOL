/**
 * Ingestion pipeline contract (Technical Build Spec §3.2). Every dataset
 * load moves staging -> validated -> human-verified -> promoted; nothing
 * enters the engine unversioned.
 */
export type IngestionStatus = 'STAGED' | 'VALIDATED' | 'HUMAN_VERIFIED' | 'PROMOTED';

export interface DatasetLoadResult {
  dataset: string;
  status: IngestionStatus;
  ruleVersionId?: string;
  errors: string[];
}

export type DatasetLoader = (sourcePath: string) => Promise<DatasetLoadResult>;
