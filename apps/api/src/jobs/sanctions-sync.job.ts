import { syncOfacList, syncUnList } from '../services/sanctions.service.js';

/**
 * Daily refresh of the shared OFAC SDN + UN Consolidated sanctions lists.
 * Both sources publish updates at most daily, so this is the ceiling of
 * useful freshness, not an arbitrary cadence.
 */
export async function runSanctionsSyncJob(): Promise<void> {
  console.log('🛂 Running sanctions list sync (OFAC + UN)...');
  try {
    const ofacCount = await syncOfacList();
    console.log(`✅ OFAC SDN sync done — ${ofacCount} entries.`);
  } catch (error) {
    console.error('❌ OFAC SDN sync failed:', error);
  }
  try {
    const unCount = await syncUnList();
    console.log(`✅ UN Consolidated List sync done — ${unCount} entries.`);
  } catch (error) {
    console.error('❌ UN Consolidated List sync failed:', error);
  }
}
