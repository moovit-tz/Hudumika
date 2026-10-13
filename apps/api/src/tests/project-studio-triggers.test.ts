import { describe, expect, it } from 'vitest';
import { TRIGGERS_BY_ID, DOMAIN_EVENT_TRIGGER_IDS } from '../studio/triggers.js';

describe('Project workflow triggers', () => {
  it.each([
    ['project.issue.resolved', 'project_issue'],
    ['project.change_request.submitted', 'project_change_request'],
  ])('accepts the emitted payload for %s', (event, entityType) => {
    const trigger = TRIGGERS_BY_ID.get(event)!;
    expect(DOMAIN_EVENT_TRIGGER_IDS).toContain(event);
    expect(trigger.app).toBe('projects');
    expect(trigger.entityType).toBe(entityType);
    expect(trigger.payloadSchema.safeParse({ projectId: '3213be7c-2327-4c7b-8154-04417d7eefa1' }).success).toBe(true);
    expect(trigger.payloadSchema.safeParse({}).success).toBe(false);
    expect(trigger.payloadSchema.safeParse({ projectId: 'invalid' }).success).toBe(false);
  });
});
