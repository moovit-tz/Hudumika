import React from 'react';
import { CompanyAvatar } from '../PersonAvatar.js';
import { type ShippingLine, detectShippingLine } from './shippingLines.js';
import { CARRIER_ASSETS } from './carrierAssets.js';

export interface CarrierLogoProps {
  carrier?: string | ShippingLine | null;
  containerNumber?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | number;
  variant?: 'mark' | 'badge' | 'full' | 'horizontal';
  className?: string;
  theme?: 'light' | 'dark' | 'auto';
}

export const CarrierLogo: React.FC<CarrierLogoProps> = ({carrier,containerNumber,size='md',variant='mark',className=''}) => {
  const explicit = typeof carrier === 'object' && carrier ? carrier : detectShippingLine(carrier ?? undefined);
  const line = explicit ?? detectShippingLine(containerNumber);
  const name = line?.shortName || (typeof carrier === 'string' && carrier.trim() ? carrier : 'Unknown owner');
  const pixels = typeof size === 'number' ? size : {xs:20,sm:28,md:36,lg:48,xl:72}[size];
  const asset = line && CARRIER_ASSETS[line.id];
  const label = line?.kind === 'container_owner' ? 'Container owner' : line?.kind === 'legacy' ? 'Legacy equipment brand' : 'Shipping line';
  return <span className={`inline-flex max-w-full items-center gap-2 ${line && ['textainer','cai','royal_arctic'].includes(line.id) ? '[&_img]:bg-slate-900!' : ''} ${className}`} title={`${name}${line ? ` · ${label}` : ''}`}>
    <CompanyAvatar key={line?.id ?? name} name={name} logoUrl={asset ? `/carriers/${asset}` : undefined} size={pixels} style={variant !== 'mark' && !['msc','zim','textainer','cai','uasc','china_shipping'].includes(line?.id ?? '') ? {width: Math.round(pixels * 1.6)} : undefined} shape="square" />
    {variant !== 'mark' && <span className="min-w-0 text-left">
      <span className="block truncate text-xs font-semibold text-(--ink)">{name}</span>
      {(variant === 'full' || variant === 'horizontal') && <span className="block text-[10px] text-(--ink3)">{line ? label : 'Unidentified prefix'}{line?.country ? ` · ${line.country}` : ''}</span>}
    </span>}
  </span>;
};
