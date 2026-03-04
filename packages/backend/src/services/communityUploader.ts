import type { CommunityReport } from '@sectorama/shared';

export interface CommunityUploader {
  upload(report: CommunityReport): Promise<void>;
}

/** No-op stub — logs report ID but does not transmit. Active until ingestion API is live. */
export class NoOpUploader implements CommunityUploader {
  async upload(report: CommunityReport): Promise<void> {
    console.info(
      '[community] report %s ready (ingestion endpoint not yet configured)',
      report.reportId,
    );
  }
}

/** Factory: returns NoOpUploader now; will switch to HttpUploader when COMMUNITY_API_URL is set. */
export function createUploader(): CommunityUploader {
  return new NoOpUploader();
}
