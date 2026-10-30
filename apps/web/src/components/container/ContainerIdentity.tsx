import { CarrierLogo } from './CarrierLogo.js';
import { detectShippingLine } from './shippingLines.js';

export function ContainerIdentity({number,carrier}:{number?:string;carrier?:string|null}) {
  const owner=detectShippingLine(number);
  const operator=detectShippingLine(carrier ?? undefined);
  if (!owner && !operator) return null;
  return <div className="flex max-w-full flex-wrap items-center gap-2 py-2" aria-live="polite">
    <CarrierLogo carrier={owner ?? operator} size="lg" variant="horizontal" />
    {number && <span className="break-all font-mono text-xs text-(--ink2)">{number.toUpperCase()}</span>}
    {owner && <span className="basis-full text-[11px] text-(--ink3)">Prefix identifies equipment owner/brand. Confirm the operating carrier from shipment documents.</span>}
    {operator && owner && operator.id !== owner.id && <span className="flex items-center gap-2 text-xs">Operating carrier: <CarrierLogo carrier={operator} size="sm" variant="badge" /></span>}
  </div>;
}
