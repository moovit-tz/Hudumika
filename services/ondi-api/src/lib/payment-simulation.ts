/**
 * Direct port of apps/api/src/integrations/payments.ts's
 * PaymentsIntegration.simulateCharge() — same validation, same behavior,
 * moved here since Ondi's Organization (not the dead apps/api monolith) is
 * now where onboarding actually creates a company. No real payment gateway
 * is called anywhere in this file; it validates input shape the way a real
 * processor would and approves unless the input is malformed or a known
 * test-decline card is used — the old UI's own disclaimer ("this is a demo
 * checkout — no real charge will be made") still applies here unchanged.
 */

export interface PaymentInput {
  method: 'card' | 'mpesa';
  cardNumber?: string;
  cardHolder?: string;
  cardExpiry?: string; // MM/YY
  cardCvc?: string;
  mobileNumber?: string;
  mobileProvider?: string;
}

export interface ChargeResult {
  success: boolean;
  txRef: string;
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

export function simulateCharge(amount: number, input: PaymentInput): ChargeResult {
  const txRef = `TXN-${Date.now()}`;

  if (input.method === 'card') {
    const digits = (input.cardNumber || '').replace(/\s/g, '');
    if (digits.length < 13 || digits.length > 19 || !luhnValid(digits)) {
      return { success: false, txRef, error: 'Invalid card number' };
    }
    if (!input.cardExpiry || !expiryValid(input.cardExpiry)) {
      return { success: false, txRef, error: 'Card expiry is invalid or in the past' };
    }
    if (!input.cardCvc || !/^\d{3,4}$/.test(input.cardCvc)) {
      return { success: false, txRef, error: 'Invalid CVC' };
    }
    if (DECLINED_CARD_NUMBERS.has(digits)) {
      return { success: false, txRef, error: 'Card declined (simulated)' };
    }
    return { success: true, txRef };
  }

  // mpesa / mobile money
  const phone = (input.mobileNumber || '').replace(/\D/g, '');
  if (phone.length < 9) {
    return { success: false, txRef, error: 'Invalid mobile money number' };
  }
  return { success: true, txRef };
}
