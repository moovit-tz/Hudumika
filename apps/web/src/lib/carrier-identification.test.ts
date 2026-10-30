import { describe,expect,it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { SHIPPING_LINES,detectShippingLine } from '../components/container/shippingLines.js';
import { getContainerColor } from '../components/container/containerColors.js';
import { CARRIER_ASSETS } from '../components/container/carrierAssets.js';

describe('container owner and carrier identification',()=>{
  it.each([['MSCU1234567','msc'],['msku 123456-7','maersk'],['CMAU1234567','cma_cgm'],['ONEU1234567','one'],['TGHU1234567','textainer'],['TCKU1234567','triton'],['SEGU1234567','seaco'],['CAIU1234567','cai'],['KKFU1234567','k_line'],['NYKU1234567','nyk'],['APLU1234567','apl']])('identifies %s as %s',(number,id)=>expect(detectShippingLine(number)?.id).toBe(id));
  it('does not invent a carrier from unknown, partial or coincidental text',()=>{
    for(const input of ['', 'MS', 'stone', 'UNKNOWN1234567', 'XYZU1234567','FREIGHT ONE STOP'])expect(detectShippingLine(input)).toBeNull();
    expect(detectShippingLine('ONE')?.id).toBe('one');expect(detectShippingLine('ONEY')?.id).toBe('one');expect(detectShippingLine('CMA-CGM')?.id).toBe('cma_cgm');
  });
  it('keeps prefix ownership unambiguous and colour detection consistent',()=>{
    const prefixes=SHIPPING_LINES.flatMap(line=>line.bicPrefixes);expect(new Set(prefixes).size).toBe(prefixes.length);
    expect(getContainerColor('TGHU1234567').id).toBe('textainer');expect(getContainerColor('XYZU1234567').id).toBe('unbranded');
  });
  it('ships intact local artwork without scripts or remote SVG references',()=>{
    const manifest=JSON.parse(readFileSync(new URL('../../public/carriers/sources.json',import.meta.url),'utf8'));
    expect(Object.keys(CARRIER_ASSETS).length).toBeGreaterThanOrEqual(34);
    for(const [id,file] of Object.entries(CARRIER_ASSETS)){
      expect(SHIPPING_LINES.some(line=>line.id===id)).toBe(true);
      const bytes=readFileSync(new URL(`../../public/carriers/${file}`,import.meta.url));
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(manifest[id].sha256);
      if(file.endsWith('.svg'))expect(bytes.toString()).not.toMatch(/<script|<foreignObject|\bon\w+\s*=|(?:href|xlink:href)\s*=\s*["'](?:https?:|\/\/|javascript:)/i);
    }
  });
});
