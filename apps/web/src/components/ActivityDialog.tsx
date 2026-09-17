import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody } from './ui/dialog.js';
import { RecordActivity } from './RecordActivity.js';

/**
 * §62 of the CMS master brief — a real "who did what" trail for a Page,
 * Post or Content entry. Reuses the platform's existing per-record
 * `RecordActivity` widget (already wired to `domain_events`) rather than
 * building a CMS-specific activity panel — the same "read the bus, don't
 * add a fourth log table" reasoning `RecordActivity` itself documents.
 */
export function ActivityDialog({ open, onOpenChange, entityType, entityId }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityType: 'page' | 'post' | 'entry';
  entityId: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Activity</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <RecordActivity
            entityType={entityType}
            entityId={entityId}
            emptyText="Nothing recorded yet — creating, publishing, trashing or deleting this will show up here."
          />
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
