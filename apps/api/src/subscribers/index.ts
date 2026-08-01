// Registering a subscriber file here is the entire integration surface for
// a first-party app reacting to another app's domain events — the emitting
// app's own code never changes. Import order doesn't matter; each file's
// only side effect is calling registerSubscriber().
import './seal.subscribers.js';
import './bliss.subscribers.js';
import './finance.subscribers.js';
import './tracking.subscribers.js';
import './cargotracker.subscribers.js';
import './hrm.subscribers.js';
// Registers one handler per DOMAIN_EVENT trigger, so tenant-defined Studio
// workflows react to the same events the hardcoded subscribers above do.
import './studio.subscribers.js';

export function bootstrapSubscribers(): void {
  // Imports above already ran registerSubscriber() as a module side effect;
  // this function exists purely so index.ts has an explicit, visible boot
  // step to call, matching the bootstrapJobs() pattern.
}
