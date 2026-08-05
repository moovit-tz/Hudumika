import React, { useEffect, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
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
      {/* hideClose: the primitive's ✕ is absolutely positioned against the
          dialog, which floats it outside the card below. This dialog draws its
          own, inside the card, so everything the user can interact with sits
          within one frame.
          The explicit --card-bg/--bg fill is what makes the panel fully
          opaque: bg-background resolves through the shadcn HSL bridge and read
          as slightly see-through against the overlay. */}
      <DialogContent
        className="max-w-sm p-5"
        hideClose
        style={{ background: 'var(--card-bg, var(--white))', opacity: 1, backdropFilter: 'none' }}
      >
        {/* Two nested panels: the outer one carries the icon, the title, the
            close control and the OK button, and houses the inner one, which
            carries what the alert actually says. Borders use the app's own
            --border token rather than a translucent shadcn value — at 70% over
            a tinted fill the edges all but vanished in light mode, which is
            where the nesting needs to read. */}
        <div
          className="relative flex flex-col gap-4 rounded-2xl p-4"
          style={{ border: '1px solid var(--border)', background: 'var(--surface, var(--bg))' }}
        >
          <DialogPrimitive.Close
            // focus-visible, not focus: Radix moves focus here when the dialog
            // opens, so a plain :focus ring painted a bright halo round the ✕
            // every single time an alert appeared. Keyboard users still get it.
            className="absolute right-3 top-3 rounded-full p-1 opacity-70 transition-colors hover:bg-muted hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Close"
          >
            <Icon name="x" size={15} />
          </DialogPrimitive.Close>

          <div className="flex flex-col items-center gap-3 text-center">
            <FeaturedIcon variant={variant} size="lg" shape="circle">
              <Icon name={VARIANT_ICON[variant]} size={22} />
            </FeaturedIcon>
            <DialogTitle>{req?.title ?? VARIANT_TITLE[variant]}</DialogTitle>
          </div>

          <div
            className="rounded-xl p-4 text-left"
            style={{ border: '1px solid var(--border)', background: 'var(--card-bg, var(--white))' }}
          >
            <DialogDescription className="whitespace-pre-line text-left text-foreground/80">
              {req?.message}
            </DialogDescription>

            {items.length > 0 && (
              <ul className="mt-3 flex flex-col gap-1.5 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
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
          </div>

          <DialogFooter className="sm:justify-center">
            {/* The design system's own primary variant, not an inline
                `background: var(--teal)`. In dark mode --teal resolves to
                #f3a379 — a lightened accent meant for text on a dark surface —
                so filling a button with it and printing white on top produced
                a washed-out, disabled-looking OK. bg-primary is the
                theme-aware token for a solid fill. */}
            <Button onClick={closeAlert} className="min-w-25">OK</Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
