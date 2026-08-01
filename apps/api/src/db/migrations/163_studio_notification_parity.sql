-- Migration 163: bring the two migrated notification workflows to byte parity
-- with the code subscribers they replace.
--
-- The A/B against real data is the standard, and these failed it on fields the
-- action could not express until now:
--
--   * entity_type / entity_label were never set, so the notification did not
--     link back to anything in the UI.
--   * entity_id defaulted to the triggering event's entity — for the trip
--     notification that is the SHIPMENT, not the trip, so "open the thing this
--     is about" would have gone to the wrong record.
--   * the demurrage message paraphrased the original and dropped its
--     date-or-"soon" fallback (now shipment.freeTimeEndLabel, formatted by the
--     resolver rather than by a template).
--
-- Re-runnable: matched on the exact superseded text.

UPDATE workflow_studio_apps
SET nodes = jsonb_set(
      nodes,
      '{2,config,input}',
      jsonb_build_object(
        'userId', '{{shipment.assignedTo}}',
        'app', 'cargotracker',
        'type', 'security',
        'title', 'Demurrage risk',
        'message', 'Shipment {{shipment.refNumber}}''s container free time ends {{shipment.freeTimeEndLabel}}.',
        'link', '/cargotracker/demurrage',
        'entityType', 'shipment',
        'entityId', '{{entityId}}',
        'entityLabel', '{{shipment.refNumber}}'
      )
    ),
    updated_at = NOW()
WHERE name = 'Demurrage risk alerts the assigned officer'
  AND nodes::text LIKE '%container free time is running out%';

UPDATE workflow_studio_apps
SET nodes = jsonb_set(
      nodes,
      '{2,config,input}',
      jsonb_build_object(
        'userId', '{{trip.dispatcherId}}',
        'app', 'tracking',
        'type', 'info',
        'title', 'Linked shipment stage updated',
        'message', 'Shipment stage for your trip''s cargo advanced to "{{payload.stage}}".',
        'link', '/tracking/trips/{{trip.id}}',
        'entityType', 'trip',
        'entityId', '{{trip.id}}',
        'entityLabel', '{{trip.id}}'
      )
    ),
    updated_at = NOW()
WHERE name = 'Stage change notifies linked trip dispatchers'
  AND nodes::text NOT LIKE '%entityType%';
