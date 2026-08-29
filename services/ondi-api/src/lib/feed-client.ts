const FEED_API_URL = process.env.FEED_API_URL || '';
const FEED_SERVICE_KEY = process.env.FEED_SERVICE_KEY || '';

interface PublishInput {
  ondiUserId: string;
  orgId?: string;
  type: string;
  title: string;
  body?: string;
  actionUrl?: string;
}

/**
 * Fire-and-forget publish into the cross-app feed (services/feed-api).
 * Never awaited by callers for its result and never throws — a feed outage
 * must not block the identity/org action that triggered it (approving a
 * join request still succeeds even if the notification never lands).
 */
export function publishNotification(input: PublishInput): void {
  if (!FEED_API_URL || !FEED_SERVICE_KEY) return;

  fetch(`${FEED_API_URL}/notifications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-service-key': FEED_SERVICE_KEY },
    body: JSON.stringify({ sourceApp: 'ondi', ...input }),
  }).catch(() => {});
}
