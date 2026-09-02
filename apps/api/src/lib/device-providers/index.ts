import type { DeviceProviderAdapter } from './types.js';
import { zktecoAdapter } from './zkteco.js';

export type { DeviceProviderAdapter, RawPunch } from './types.js';

/** Adding Suprema/Hikvision later is one new adapter file + one line here. */
export const DEVICE_PROVIDERS: Record<string, DeviceProviderAdapter> = {
  zkteco: zktecoAdapter,
};

export function getDeviceProvider(code: string): DeviceProviderAdapter | null {
  return DEVICE_PROVIDERS[code] ?? null;
}
