// Pulse reacts to events other apps already emit: journeys start (or reach
// their goal) on a lead created, a deal won, an invoice paid; website forms
// become contacts and leads; conversions are credited to campaigns.
import { registerPulseJourneySubscribers, journeyOnEvent } from '../services/pulse-journeys.service.js';
import { registerPulseAttributionSubscribers } from '../services/pulse-attribution.service.js';

registerPulseJourneySubscribers();
registerPulseAttributionSubscribers((tenantId, contactId, event) =>
  journeyOnEvent(tenantId, { ...event, payload: { ...(event.payload ?? {}), contactId } }));
