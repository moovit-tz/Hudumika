// Daily FX rate refresh — same shape as sanctions-sync.job.ts (a shared,
// platform-wide reference sync with no per-tenant iteration needed).
import { fetchAndStoreFxRates } from '../services/fx-rate.service.js';

export async function runFxRateSyncJob(): Promise<void> {
  try {
    const { stored } = await fetchAndStoreFxRates();
    console.log(`✅ FX rate sync done — ${stored} currency pair(s) stored.`);
  } catch (error) {
    console.error('❌ FX rate sync failed:', error);
  }
}
