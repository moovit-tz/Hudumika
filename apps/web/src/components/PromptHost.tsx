import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog.js';
import { FeaturedIcon } from './ui/featured-icon.js';
import { Button } from './ui/button.js';
import { Input } from './ui/input.js';
import { Textarea } from './ui/textarea.js';
import { Icon } from './Icon.js';
import { subscribePrompt, promptAccept, promptDismiss, type PromptRequest } from '../lib/prompt.js';

/**
 * Mounted once at the app root, alongside AlertHost/ConfirmHost. Renders
 * whatever showPrompt() last requested as a centered, design-system Dialog
 * with a real input — the replacement for native window.prompt().
 */
export function PromptHost() {
  const [req, setReq] = useState<PromptRequest | null>(null);
  const [value, setValue] = useState('');

  useEffect(() => subscribePrompt(r => { setReq(r); setValue(r?.defaultValue ?? ''); }), []);

  function submit() {
    if (req?.required && !value.trim()) return;
    promptAccept(value);
  }

  const Field = req?.multiline ? Textarea : Input;

  return (
    <Dialog open={!!req} onOpenChange={open => { if (!open) promptDismiss(); }}>
      <DialogContent className="max-w-sm">
        <div className="flex flex-col items-center gap-3 pt-2 text-center">
          <FeaturedIcon variant="brand" size="lg" shape="circle">
            <Icon name="edit" size={20} />
          </FeaturedIcon>
          <DialogTitle>{req?.title ?? 'Enter a value'}</DialogTitle>
          {req?.message && (
            <DialogDescription className="whitespace-pre-line text-center">{req.message}</DialogDescription>
          )}
        </div>

        <Field
          autoFocus
          value={value}
          onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setValue(e.target.value)}
          onKeyDown={(e: React.KeyboardEvent) => { if (!req?.multiline && e.key === 'Enter') submit(); }}
          placeholder={req?.placeholder}
          rows={req?.multiline ? 3 : undefined}
          className="mt-1"
        />

        <DialogFooter className="mt-2 sm:justify-center">
          <Button variant="outline" className="min-w-[100px]" onClick={promptDismiss}>{req?.cancelLabel ?? 'Cancel'}</Button>
          <Button className="min-w-[100px]" disabled={!!req?.required && !value.trim()}
            style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }} onClick={submit}>
            {req?.confirmLabel ?? 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
