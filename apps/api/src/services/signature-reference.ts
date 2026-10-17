/** Uses the complete persisted signer UUID, so references cannot collide through truncation. */
export function signatureReference(recipientId: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(recipientId)) throw new Error('A stored recipient UUID is required');
  return `HSGN-${recipientId.replace(/-/g, '').toUpperCase()}`;
}
