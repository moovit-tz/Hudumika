import type { TaneswContainerDetail, TaneswTrackingEvent, TaneswTrackingResult } from '@hudumika/types';
import { z } from 'zod';

const trackingUrl = 'https://tanesw.tra.go.tz/api/cgm/api/v1/cgme/trkng/';
const rowSchema = z.record(z.string(), z.unknown());
const responseSchema = z.object({
  totalCnt: z.object({ content: z.number().int().nonnegative() }),
  trkngDtl: z.object({ content: z.union([rowSchema, z.array(rowSchema)]).nullish() }).optional(),
});

function string(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function number(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function matchesBill(detail: Record<string, unknown>, bill: string) {
  return string(detail.blNo).toUpperCase() === bill
    || (detail.hblNo !== 'SIMPLE' && string(detail.hblNo).toUpperCase() === bill);
}

export class MultipleTaneswMatches extends Error {}

async function fetchTracking(path: 'srch' | 'cntr-dtl', query: Record<string, string>): Promise<unknown> {
  const url = new URL(path, trackingUrl);
  url.search = new URLSearchParams(query).toString();
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(8_000),
    redirect: 'error',
  });
  if (!response.ok) throw new Error('TANESW returned an unsuccessful response');
  return response.json();
}

function events(rows: unknown): TaneswTrackingEvent[] {
  return z.array(rowSchema).parse(rows ?? []).map(event => ({
    code: string(event.cagTrkngPrcssCd),
    status: string(event.cagTrkngPrcssCdNm) || string(event.cagTrkngPrcssCd),
    processedAt: string(event.prcssDt),
    movementAt: string(event.crioDt),
    locationCode: string(event.wrhsCd),
    location: string(event.wrhsCdNm),
    movementType: string(event.crioTpCdNm) || string(event.crioTpCd),
    reference: string(event.reffNo),
    declaration: string(event.dclrNo),
  }));
}

export async function lookupTaneswContainer(bill: string, cargoReference: string, container: string): Promise<TaneswContainerDetail | null> {
  const payload = await fetchTracking('cntr-dtl', { srchCrn: cargoReference, srchCntrNo: container });
  const detail = z.object({ trkngCntrDtl: z.object({ content: rowSchema.nullable() }) }).parse(payload).trkngCntrDtl.content;
  if (!detail || string(detail.crn) !== cargoReference || string(detail.cntrNo) !== container || !matchesBill(detail, bill)) return null;
  return {
    packageCount: number(detail.cntrPckgNo),
    packageUnit: string(detail.pckgUtCd),
    weightKg: detail.wghtUtCd === 'KG' ? number(detail.cntrWght) : null,
    events: events(detail.cntrPrcssLst),
  };
}

export async function lookupTaneswBill(billOfLading: string): Promise<TaneswTrackingResult | null> {
  const payload = responseSchema.parse(await fetchTracking('srch', { srchCrn: '', srchBlNo: billOfLading, srchCntrNo: '' }));
  if (payload.totalCnt.content === 0) return null;
  if (payload.totalCnt.content > 1 || Array.isArray(payload.trkngDtl?.content)) {
    throw new MultipleTaneswMatches('TRA found multiple records. Enter the house bill of lading to track your consignment.');
  }
  const detail = rowSchema.parse(payload.trkngDtl?.content);
  if (!matchesBill(detail, billOfLading)) throw new Error('TANESW returned a different bill');

  return {
    checkedAt: new Date().toISOString(),
    billOfLading,
    masterBill: string(detail.mblNo),
    houseBill: detail.hblNo === 'SIMPLE' ? '' : string(detail.hblNo),
    cargoReference: string(detail.crn),
    status: string(detail.cagTrkngPrcssCdNm),
    vessel: string(detail.vsslNm),
    voyage: string(detail.vygNo),
    arrivalAt: string(detail.actlArvlDt),
    carrier: string(detail.carrNm),
    forwarder: string(detail.fwdrNm),
    shippingAgentCode: string(detail.shagCd),
    packingType: string(detail.pckgTpCdNm) || string(detail.pckgTpCd),
    billType: string(detail.blTpCd),
    cargoType: string(detail.cagClsfCd),
    customsOffice: string(detail.cstmOfceCdNm),
    loadingPortCode: string(detail.loadPortCd),
    dischargePort: string(detail.dscgPortCdNm),
    destination: string(detail.dstnPlcCdNm),
    facility: string(detail.dlvrPlcCdNm),
    facilityCode: string(detail.dlvrPlcCd),
    lastLocation: string(detail.lastGodsLoctCdNm),
    stockLocation: string(detail.stckWrhsCdNm),
    cargo: string(detail.godsDesc),
    packageCount: number(detail.blPckgNo),
    packageUnit: string(detail.blPckgUtCd),
    grossWeightKg: detail.blGwghtUtCd === 'KG' ? number(detail.blGwght) : null,
    netWeightKg: detail.blNwghtUtCd === 'KG' ? number(detail.blNwght) : null,
    containerCount: number(detail.blCntrNo),
    containers: z.array(rowSchema).parse(detail.blCntrLst ?? []).map(container => ({
      number: string(container.cntrNo),
      sizeCode: string(container.cntrSizeCd),
      freight: string(container.frghIdcrCdNm) || string(container.frghIdcrCd),
      seals: [container.sealNo1, container.sealNo2, container.sealNo3].map(string).filter(seal => seal && seal !== '-'),
      volumeCbm: container.vlmUtCd === 'CBM' ? number(container.cntrVlm) : null,
      location: string(container.lastGodsLoctCdNm),
      status: string(container.cagTrkngPrcssCdNm) || (container.cagTrkngPrcssCd === 'C61' ? 'Gate Out Confirm' : string(container.cagTrkngPrcssCd)),
    })),
    events: events(detail.blPrcssLst),
  };
}
