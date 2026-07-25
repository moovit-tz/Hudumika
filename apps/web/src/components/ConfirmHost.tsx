import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog.js';
import { FeaturedIcon } from './ui/featured-icon.js';
import { Button } from './ui/button.js';
import { Icon, type IconName } from './Icon.js';
import { subscribeConfirm, confirmAccept, confirmDismiss, type ConfirmRequest, type ConfirmVariant } from '../lib/confirm.js';

const VARIANT_ICON: Record<ConfirmVariant, IconName> = {
  danger: 'trash',
  warning: 'alertTriangle',
  info: 'helpCircle',
};

const VARIANT_FEATURED: Record<ConfirmVariant, 'error' | 'warning' | 'info'> = {
  danger: 'error',
  warning: 'warning',
  info: 'info',
};

/**
 * Mounted once at the app root. Renders whatever showConfirm() last requested
 * as a centered, design-system Dialog with explicit Confirm/Cancel actions —
 * the replacement for native window.confirm().
 */
export function ConfirmHost() {
  const [req, setReq] = useState<ConfirmRequest | null>(null);
  useEffect(() => subscribeConfirm(setReq), []);

  const variant = req?.variant ?? 'danger';

  return (
    <Dialog open={!!req} onOpenChange={open => { if (!open) confirmDismiss(); }}>
      <DialogContent className="max-w-sm">
        <div className="flex flex-col items-center gap-3 pt-2 text-center">
          <FeaturedIcon variant={VARIANT_FEATURED[variant]} size="lg" shape="circle">
            <Icon name={VARIANT_ICON[variant]} size={22} />
          </FeaturedIcon>
          <DialogTitle>{req?.title ?? 'Please Confirm'}</DialogTitle>
          <DialogDescription className="whitespace-pre-line text-center">
            {req?.message}
          </DialogDescription>
        </div>
        <DialogFooter className="mt-2 sm:justify-center">
          <Button variant="outline" className="min-w-[100px]" onClick={confirmDismiss}>{req?.cancelLabel ?? 'Cancel'}</Button>
          {variant === 'danger' ? (
            <Button variant="destructive" className="min-w-[100px]" onClick={confirmAccept}>{req?.confirmLabel ?? 'Confirm'}</Button>
          ) : (
            <Button className="min-w-[100px]" style={{ background: 'var(--teal)', color: '#fff' }} onClick={confirmAccept}>{req?.confirmLabel ?? 'Confirm'}</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
