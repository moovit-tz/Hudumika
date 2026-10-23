import { describe, expect, test, vi, afterEach } from 'vitest';
import { datePresetRange } from '../components/ui/date-filter-row.js';
import { DEFAULT_POS_PRINT, loadPosPrintSettings, posPrintKey } from '../lib/pos-print.js';

afterEach(() => vi.unstubAllGlobals());
describe('FinOps date ranges', () => {
  test('includes today and crosses year boundaries without UTC conversion', () => {
    expect(datePresetRange('7d', new Date(2026, 0, 3, 23))).toEqual(['2025-12-28', '2026-01-03']);
    expect(datePresetRange('30d', new Date(2026, 0, 3))).toEqual(['2025-12-05', '2026-01-03']);
  });
  test('handles leap-year month and all-time reset', () => {
    expect(datePresetRange('month', new Date(2024, 1, 29))).toEqual(['2024-02-01', '2024-02-29']);
    expect(datePresetRange('today', new Date(2024, 1, 29))).toEqual(['2024-02-29', '2024-02-29']);
    expect(datePresetRange('all')).toEqual(['', '']);
  });
});
describe('POS print preferences', () => {
  test('separates tenant and user browser preferences', () => {
    expect(posPrintKey('tenant-a', 'user')).not.toBe(posPrintKey('tenant-b', 'user'));
    expect(posPrintKey('tenant-a', 'user')).not.toBe(posPrintKey('tenant-a', 'other'));
  });
  test('recovers from malformed stored preferences', () => {
    vi.stubGlobal('localStorage', {getItem: () => '{broken'});
    expect(loadPosPrintSettings('key')).toEqual(DEFAULT_POS_PRINT);
  });
  test('validates untrusted stored option types and limits footer length', () => {
    vi.stubGlobal('localStorage', {getItem: () => JSON.stringify({paper:'unknown', autoPrint:'true', showCustomer:false, footer:'x'.repeat(250)})});
    expect(loadPosPrintSettings('key')).toEqual({paper:'80mm',autoPrint:false,showCustomer:false,footer:'x'.repeat(200)});
  });
});
