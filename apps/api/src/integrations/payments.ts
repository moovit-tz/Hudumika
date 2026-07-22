import type { OnboardingPaymentInput } from '@hudumika/types';

export interface ChargeResult {
  success: boolean;
  tx_ref: string;
  error?: string;
}

// Card numbers that reproduce common gateway test responses (Stripe-style convention)
const DECLINED_CARD_NUMBERS = new Set(['4000000000000002']);

function luhnValid(digits: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits[i], 10);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

function expiryValid(expiry: string): boolean {
  const match = /^(\d{2})\/(\d{2})$/.exec(expiry);
  if (!match) return false;
  const month = parseInt(match[1], 10);
  const year = 2000 + parseInt(match[2], 10);
  if (month < 1 || month > 12) return false;
  const now = new Date();
  const expiryDate = new Date(year, month, 0);
  return expiryDate >= new Date(now.getFullYear(), now.getMonth(), 1);
}

export class PaymentsIntegration {
  /**
   * Simulated payment charge — no real gateway is wired up. Validates the
   * shape of the input like a real processor would and always "succeeds"
   * unless the input is malformed or a known test-decline card is used.
   */
  static simulateCharge(amount: number, input: OnboardingPaymentInput): ChargeResult {
    const txRef = `TXN-${Date.now()}`;

    if (input.method === 'card') {
      const digits = (input.card_number || '').replace(/\s/g, '');
      if (digits.length < 13 || digits.length > 19 || !luhnValid(digits)) {
        console.log(`💳 [Simulated Payment] method=card amount=${amount} → DECLINED (invalid card number)`);
        return { success: false, tx_ref: txRef, error: 'Invalid card number' };
      }
      if (!input.card_expiry || !expiryValid(input.card_expiry)) {
        console.log(`💳 [Simulated Payment] method=card amount=${amount} → DECLINED (invalid/expired expiry)`);
        return { success: false, tx_ref: txRef, error: 'Card expiry is invalid or in the past' };
      }
      if (!input.card_cvc || !/^\d{3,4}$/.test(input.card_cvc)) {
        console.log(`💳 [Simulated Payment] method=card amount=${amount} → DECLINED (invalid CVC)`);
        return { success: false, tx_ref: txRef, error: 'Invalid CVC' };
      }
      if (DECLINED_CARD_NUMBERS.has(digits)) {
        console.log(`💳 [Simulated Payment] method=card amount=${amount} → DECLINED (test decline card)`);
        return { success: false, tx_ref: txRef, error: 'Card declined (simulated)' };
      }
      console.log(`💳 [Simulated Payment] method=card amount=${amount} card=****${digits.slice(-4)} → APPROVED`);
      return { success: true, tx_ref: txRef };
    }

    // mpesa / mobile money
    const phone = (input.mobile_number || '').replace(/\D/g, '');
    if (phone.length < 9) {
      console.log(`💳 [Simulated Payment] method=mpesa amount=${amount} → DECLINED (invalid mobile number)`);
      return { success: false, tx_ref: txRef, error: 'Invalid mobile money number' };
    }
    console.log(`💳 [Simulated Payment] method=mpesa amount=${amount} phone=${phone} → APPROVED`);
    return { success: true, tx_ref: txRef };
  }
}
