/** Maps existing domain status names to the shared semantic badge variants. */
export function complyBadgeVariant(value: string): 'success' | 'warning' | 'error' | 'info' | 'brand' | 'gray' {
  const tokens=value.toLowerCase().replace(/comply-(?:badge|agency)--/g,'').split(/\s+/);
  if(tokens.some(t=>['expired','rejected','failed','cancelled','urgent','lapsed','revoked'].includes(t)))return 'error';
  if(tokens.some(t=>['active','approved','issued','completed','verified'].includes(t)))return 'success';
  if(tokens.some(t=>['pending','pending_approval','expiring','tax','legal','soon'].includes(t)))return 'warning';
  if(tokens.some(t=>['review','under_review','submitted','gov'].includes(t)))return 'info';
  if(tokens.some(t=>['ai','social','reg','fin','automatic'].includes(t)))return 'brand';
  return 'gray';
}
