import { describe, expect, it } from 'vitest';
import { snapshotSections, summarizeRestore, validateSnapshot } from '../services/onsite-backup.service.js';

const empty = () => Object.fromEntries(snapshotSections.map(section => [section, []]));

describe('Onsite restore preview', () => {
  it('normalizes legacy application mappings and rejects missing target connections', () => {
    const legacy = { ...empty(), applications: [{ id: 'app', tenant_id: 'tenant-a' }] };
    expect(validateSnapshot('tenant-a', legacy).applications[0].provider_connection_id).toBeNull();
    expect(legacy.applications[0]).not.toHaveProperty('provider_connection_id');
    expect(() => validateSnapshot('tenant-a', { ...empty(), applications: [{ id: 'app', tenant_id: 'tenant-a', provider_connection_id: 'missing' }] })).toThrow('missing');
  });
  it('normalizes legacy website snapshots without mutating the stored snapshot', () => {
    const legacy = { ...empty(), websites: [{ id: 'site', tenant_id: 'tenant-a' }] };
    const validated = validateSnapshot('tenant-a', legacy);
    expect(validated.websites[0].provider_connection_id).toBeNull();
    expect(legacy.websites[0]).not.toHaveProperty('provider_connection_id');
  });
  it('rejects website provider links missing from the target snapshot', () => {
    expect(() => validateSnapshot('tenant-a', { ...empty(), websites: [{ id: 'site', tenant_id: 'tenant-a', provider_connection_id: 'missing' }] })).toThrow('missing');
  });
  it('counts additions, replacements and removals without returning row contents', () => {
    const current = validateSnapshot('tenant-a', { ...empty(), secrets: [{ id: 'old', tenant_id: 'tenant-a', value_cipher: 'private' }, { id: 'same', tenant_id: 'tenant-a' }] });
    const target = validateSnapshot('tenant-a', { ...empty(), secrets: [{ id: 'new', tenant_id: 'tenant-a' }, { id: 'same', tenant_id: 'tenant-a' }] });
    const summary = summarizeRestore(current, target);
    expect(summary.find(row => row.section === 'secrets')).toEqual({ section: 'secrets', current: 2, snapshot: 2, added: 1, replaced: 1, removed: 1 });
    expect(JSON.stringify(summary)).not.toContain('private');
  });
  it('rejects foreign tenant rows, duplicate ids and missing sections', () => {
    expect(() => validateSnapshot('tenant-a', { ...empty(), domains: [{ id: 'foreign', tenant_id: 'tenant-b' }] })).toThrow();
    expect(() => validateSnapshot('tenant-a', { ...empty(), domains: [{ id: 'same', tenant_id: 'tenant-a' }, { id: 'same', tenant_id: 'tenant-a' }] })).toThrow();
    expect(() => validateSnapshot('tenant-a', {})).toThrow();
  });
});
