export type AlertVariant = 'info' | 'success' | 'warning' | 'error';

export interface AlertRequest {
  message: string;
  title?: string;
  variant: AlertVariant;
  /** Optional structured breakdown (e.g. a list of missing prerequisites)
   *  rendered as a scannable list under the message instead of forcing the
   *  caller to cram everything into one comma-separated sentence. */
  items?: string[];
}

type Listener = (req: AlertRequest | null) => void;

let listeners: Listener[] = [];
let current: AlertRequest | null = null;

/**
 * Drop-in replacement for the native `alert()` — same call shape (just a
 * message string), but renders as a design-system Dialog instead of the
 * browser's unstyled "localhost:5173 says" chrome. Defaults to the 'error'
 * variant since the overwhelming majority of alert() call sites in this app
 * are failure/validation notices.
 */
export function showAlert(message: string, opts: { title?: string; variant?: AlertVariant; items?: string[] } = {}): void {
  current = { message, title: opts.title, variant: opts.variant ?? 'error', items: opts.items };
  listeners.forEach(l => l(current));
}

export function closeAlert(): void {
  current = null;
  listeners.forEach(l => l(current));
}

export function subscribeAlert(fn: Listener): () => void {
  listeners.push(fn);
  fn(current);
  return () => { listeners = listeners.filter(l => l !== fn); };
}
