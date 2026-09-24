import { describe, expect, it } from 'vitest';
import { COMM_EVENT_REGISTRY, COMM_EVENT_MAP } from '../config/comm-event-registry.js';
import { EMAIL_TEMPLATE_DEFAULTS } from '../config/email-template-defaults.js';

describe('Communication Event Registry', () => {
  it('contains unique, convention-compliant event keys', () => {
    const keys = COMM_EVENT_REGISTRY.map(event => event.event_key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(key).toMatch(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,}$/);
  });

  it('has a resolvable default template and valid default channel for every event', () => {
    for (const event of COMM_EVENT_REGISTRY) {
      expect(event.available_channels).toContain(event.default_channel);
      expect(event.recipient_resolvers.length).toBeGreaterThan(0);
      expect(event.default_locale).toBe('en');
      if (event.default_template) expect(EMAIL_TEMPLATE_DEFAULTS[event.default_template]).toBeDefined();
    }
  });

  it('exposes structured recipient definitions and a complete lookup map', () => {
    for (const event of COMM_EVENT_REGISTRY) {
      expect(COMM_EVENT_MAP.get(event.event_key)).toBe(event);
      for (const recipient of event.recipient_resolvers) {
        expect(recipient.resolver).toBeTruthy();
        expect(['TO', 'CC', 'BCC']).toContain(recipient.type);
      }
    }
  });
});
