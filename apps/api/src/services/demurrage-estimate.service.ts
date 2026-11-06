import { z } from 'zod';
import { demurrageService, calculateDemurrageCost, daysBetween } from './demurrage.service.js';

const date = z.iso.date();
export const estimateInput = z.object({
  bill: z.string().regex(/^[A-Z0-9][A-Z0-9./-]{2,63}$/i),
  asOf: date,
  combined: z.boolean(),
  schedules: z.object({ port: z.string().max(200), icd: z.string().max(200), carrier: z.string().max(200), detention: z.string().max(200) }),
  containers: z.array(z.object({
    number: z.string().regex(/^[A-Z0-9-]{3,30}$/),
    size: z.string().max(30),
    discharge: date.or(z.literal('')),
    terminalExit: date.or(z.literal('')),
    carryIn: date.or(z.literal('')),
    gateOut: date.or(z.literal('')),
    returned: date.or(z.literal('')),
    source: z.string().max(200).optional(),
  })).min(1).max(250),
});

const sizeAliases: Record<string, string> = { '22G1': '20GP', '42G1': '40GP', '45G1': '40HC' };

export async function estimateConsignment(tenantId: string, input: z.infer<typeof estimateInput>) {
  const tariffs = await demurrageService.listTariffs(tenantId);
  return input.containers.flatMap(container => {
    const { discharge, terminalExit, carryIn, gateOut, returned } = container;
    const windows = [
      { kind: 'Port storage', start: discharge, stop: terminalExit, schedule: input.schedules.port, missingStop: !terminalExit && [carryIn, gateOut, returned].some(value => value && value <= input.asOf) },
      { kind: 'ICD storage', start: carryIn, stop: gateOut, schedule: input.schedules.icd, missingStop: !gateOut && Boolean(returned && returned <= input.asOf) },
      { kind: input.combined ? 'Combined demurrage & detention' : 'Carrier demurrage', start: discharge, stop: input.combined ? returned : gateOut, schedule: input.schedules.carrier, missingStop: !input.combined && !gateOut && Boolean(returned && returned <= input.asOf) },
      ...(!input.combined ? [{ kind: 'Carrier detention', start: gateOut, stop: returned, schedule: input.schedules.detention }] : []),
    ];

    return windows.map(window => {
      const end = window.stop && window.stop <= input.asOf ? window.stop : input.asOf;
      const tariff = tariffs.filter(row => row.active && row.carrier_name === window.schedule &&
        (row.container_size === container.size || row.container_size === sizeAliases[container.size]) &&
        new Date(row.effective_from).toISOString().slice(0, 10) <= window.start)
        .sort((a, b) => Number(b.container_size === container.size) - Number(a.container_size === container.size) ||
          +new Date(b.effective_from) - +new Date(a.effective_from) || +new Date(b.created_at) - +new Date(a.created_at))[0];
      const validWindow = window.start && !('missingStop' in window && window.missingStop) && (!window.stop || window.stop >= window.start);
      const days = validWindow ? (window.start > input.asOf ? 0 : daysBetween(new Date(window.start), new Date(end))) : null;
      const chargeableDays = days !== null && tariff ? Math.max(0, days - tariff.free_days) : null;
      const amount = chargeableDays === null ? null : calculateDemurrageCost(chargeableDays,
        typeof tariff.rate_tiers === 'string' ? JSON.parse(tariff.rate_tiers) : tariff.rate_tiers);
      const note = !window.start ? 'Start date required'
        : 'missingStop' in window && window.missingStop ? 'Confirm the missing end date before pricing'
        : !validWindow ? 'End date precedes start date'
        : !window.schedule ? 'Rate schedule required'
        : !tariff ? 'No matching effective tariff for this size'
        : window.start > input.asOf ? 'Starts after estimate date'
        : window.stop && window.stop <= input.asOf ? 'Ended on recorded date' : 'Estimated through selected date';
      return {
        container: container.number, size: container.size, kind: window.kind,
        start: window.start, end: days !== null && window.start <= input.asOf ? end : '',
        days, chargeableDays, freeDays: tariff?.free_days ?? null, amount,
        currency: tariff?.currency ?? '', schedule: window.schedule,
        effectiveDate: tariff ? new Date(tariff.effective_from).toISOString().slice(0, 10) : '',
        note, source: container.source ?? '',
      };
    });
  });
}
