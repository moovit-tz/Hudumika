import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog.js';
import { FeaturedIcon } from './ui/featured-icon.js';
import { Button } from './ui/button.js';
import { Icon, type IconName } from './Icon.js';
import { subscribeAlert, closeAlert, type AlertRequest, type AlertVariant } from '../lib/alert.js';

const VARIANT_ICON: Record<AlertVariant, IconName> = {
  info: 'info',
  success: 'checkCircle',
  warning: 'alertTriangle',
  error: 'xCircle',
};

const VARIANT_TITLE: Record<AlertVariant, string> = {
  info: 'Notice',
  success: 'Success',
  warning: 'Warning',
  error: 'Error',
};

const VARIANT_ITEM_ICON: Record<AlertVariant, IconName> = {
  info: 'circle',
  success: 'check',
  warning: 'alertTriangle',
  error: 'x',
};

// Same hue mapping FeaturedIcon's VARIANT_MAP uses, at list-bullet size (16px)
// rather than FeaturedIcon's smallest preset (32px, sized for card headers).
const VARIANT_COLOR: Record<AlertVariant, string> = {
  info: 'blue',
  success: 'green',
  warning: 'gold',
  error: 'red',
};

/**
 * Mounted once at the app root. Renders whatever showAlert() last requested
 * as a centered, design-system Dialog — the replacement for native alert().
 */
export function AlertHost() {
  const [req, setReq] = useState<AlertRequest | null>(null);
  useEffect(() => subscribeAlert(setReq), []);

  const variant = req?.variant ?? 'error';
  const items = req?.items ?? [];

  return (
    <Dialog open={!!req} onOpenChange={open => { if (!open) closeAlert(); }}>
      <DialogContent className="max-w-sm">
        <div className="flex flex-col items-center gap-3 pt-2 text-center">
          <FeaturedIcon variant={variant} size="lg" shape="circle">
            <Icon name={VARIANT_ICON[variant]} size={22} />
          </FeaturedIcon>
          <DialogTitle>{req?.title ?? VARIANT_TITLE[variant]}</DialogTitle>
          <DialogDescription className="whitespace-pre-line text-center">
            {req?.message}
          </DialogDescription>
        </div>

        {items.length > 0 && (
          <ul className="flex flex-col gap-1.5 rounded-xl border border-border/70 bg-muted/40 p-3 text-left">
            {items.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                <span
                  className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
                  style={{ background: `var(--${VARIANT_COLOR[variant]}-l)`, color: `var(--${VARIANT_COLOR[variant]})` }}
                >
                  <Icon name={VARIANT_ITEM_ICON[variant]} size={9} strokeWidth={3} />
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        )}

        <DialogFooter className="mt-2 sm:justify-center">
          <Button onClick={closeAlert} className="min-w-[100px]" style={{ background: 'var(--teal)', color: '#fff' }}>OK</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
