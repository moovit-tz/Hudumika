import { runDataQualityChecks } from '../services/data-quality.service.js';

/** Nightly sweep — see data-quality.service.ts for the real checks. */
export async function runDataQualityJob(): Promise<void> {
  const { findings } = await runDataQualityChecks();
  if (findings.length > 0) {
    console.log(`🩺 Data Quality: ${findings.length} finding(s) across ${new Set(findings.map(f => f.tenantId)).size} tenant(s).`);
  }
}
