import https from 'node:https';
import { EventEmitter } from 'node:events';
import { afterEach, expect, it, vi } from 'vitest';
import { getUsdToTzs } from '../services/customs.service.js';
afterEach(()=>vi.restoreAllMocks());
it('fails closed rather than returning invented FX when the provider is unavailable',async()=>{
 vi.spyOn(https,'get').mockImplementation((() => {
  const request=new EventEmitter() as any;request.setTimeout=()=>request;request.destroy=()=>request;
  queueMicrotask(()=>request.emit('error',new Error('Synthetic offline upstream')));return request;
 }) as any);
 await expect(getUsdToTzs()).rejects.toThrow(/exchange rate|FX/i);
});
