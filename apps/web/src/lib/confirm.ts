export type ConfirmVariant = 'danger' | 'warning' | 'info';

export interface ConfirmRequest {
  message: string;
  title?: string;
  variant: ConfirmVariant;
  confirmLabel: string;
  cancelLabel: string;
  resolve: (result: boolean) => void;
}

type Listener = (req: ConfirmRequest | null) => void;

let listeners: Listener[] = [];
let current: ConfirmRequest | null = null;

/**
 * Drop-in replacement for the native `window.confirm()` — same "does the
 * user accept?" shape, but renders as a design-system Dialog instead of the
 * browser's unstyled "localhost:5173 says" chrome, and returns a Promise
 * instead of blocking the main thread synchronously. Callers must `await` it
 * (which requires the enclosing function to be `async`).
 */
export function showConfirm(message: string, opts: { title?: string; variant?: ConfirmVariant; confirmLabel?: string; cancelLabel?: string } = {}): Promise<boolean> {
  return new Promise(resolve => {
    current = {
      message,
      title: opts.title,
      variant: opts.variant ?? 'danger',
      confirmLabel: opts.confirmLabel ?? 'Confirm',
      cancelLabel: opts.cancelLabel ?? 'Cancel',
      resolve,
    };
    listeners.forEach(l => l(current));
  });
}

function settle(result: boolean): void {
  current?.resolve(result);
  current = null;
  listeners.forEach(l => l(current));
}

export function confirmAccept(): void { settle(true); }
export function confirmDismiss(): void { settle(false); }

export function subscribeConfirm(fn: Listener): () => void {
  listeners.push(fn);
  fn(current);
  return () => { listeners = listeners.filter(l => l !== fn); };
}
