export interface PromptRequest {
  message: string;
  title?: string;
  placeholder?: string;
  defaultValue: string;
  confirmLabel: string;
  cancelLabel: string;
  required: boolean;
  multiline: boolean;
  resolve: (result: string | null) => void;
}

type Listener = (req: PromptRequest | null) => void;

let listeners: Listener[] = [];
let current: PromptRequest | null = null;

/**
 * Drop-in replacement for the native `window.prompt()` — same "ask for one
 * line of text" shape, but renders as a design-system Dialog instead of the
 * browser's unstyled "localhost:5173 says" chrome, and returns a Promise
 * instead of blocking the main thread synchronously. Resolves `null` on
 * cancel, the trimmed string on confirm — callers must `await` it (which
 * requires the enclosing function to be `async`), same as showConfirm().
 */
export function showPrompt(message: string, opts: {
  title?: string; placeholder?: string; defaultValue?: string;
  confirmLabel?: string; cancelLabel?: string; required?: boolean; multiline?: boolean;
} = {}): Promise<string | null> {
  return new Promise(resolve => {
    current = {
      message,
      title: opts.title,
      placeholder: opts.placeholder,
      defaultValue: opts.defaultValue ?? '',
      confirmLabel: opts.confirmLabel ?? 'Save',
      cancelLabel: opts.cancelLabel ?? 'Cancel',
      required: opts.required ?? false,
      multiline: opts.multiline ?? false,
      resolve,
    };
    listeners.forEach(l => l(current));
  });
}

function settle(result: string | null): void {
  current?.resolve(result);
  current = null;
  listeners.forEach(l => l(current));
}

export function promptAccept(value: string): void { settle(value.trim()); }
export function promptDismiss(): void { settle(null); }

export function subscribePrompt(fn: Listener): () => void {
  listeners.push(fn);
  fn(current);
  return () => { listeners = listeners.filter(l => l !== fn); };
}
