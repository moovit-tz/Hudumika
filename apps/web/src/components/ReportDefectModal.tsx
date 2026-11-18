import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Icon } from './Icon.js';
import { apiFetch } from '@/lib/api';

interface ReportDefectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ReportDefectModal: React.FC<ReportDefectModalProps> = ({ open, onOpenChange }) => {
  const location = useLocation();

  // Derive source app from URL pathname (e.g. /clearos/shipments -> clearos)
  const pathParts = location.pathname.split('/').filter(Boolean);
  const detectedApp = pathParts[0] || 'platform';

  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [steps, setSteps] = useState('');
  const [expected, setExpected] = useState('');
  const [actual, setActual] = useState('');
  const [severity, setSeverity] = useState<'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL'>('NORMAL');
  const [showContext, setShowContext] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedRef, setSubmittedRef] = useState<string | null>(null);

  const clientContext = {
    source_app: detectedApp,
    source_route: location.pathname + location.search,
    user_agent: navigator.userAgent,
    screen_resolution: `${window.innerWidth}x${window.innerHeight}`,
    reported_at: new Date().toISOString(),
  };

  const resetForm = () => {
    setTitle('');
    setSummary('');
    setSteps('');
    setExpected('');
    setActual('');
    setSeverity('NORMAL');
    setShowContext(false);
    setError(null);
    setSubmittedRef(null);
  };

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !summary.trim()) {
      setError('Title and summary are required.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await apiFetch<any>('/v1/lens/reports', {
        method: 'POST',
        body: JSON.stringify({
          source_app: detectedApp,
          source_route: location.pathname + location.search,
          title: title.trim(),
          summary: summary.trim(),
          steps_to_reproduce: steps.trim() || undefined,
          expected_behavior: expected.trim() || undefined,
          actual_behavior: actual.trim() || undefined,
          severity,
          client_context: clientContext,
        }),
      });

      setSubmittedRef(res?.report?.ref || res?.ref || 'Report Submitted');
    } catch (err: any) {
      setError(err?.message || 'Failed to submit report. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 flex items-center justify-center">
              <Icon name="alertCircle" size={18} />
            </div>
            <div>
              <DialogTitle>Report an Issue / Bug</DialogTitle>
              <DialogDescription>
                Submit an engineering report to the Hudumika Lens intake queue.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {submittedRef ? (
          <div className="py-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
              <Icon name="checkCircle" size={24} />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-foreground">Defect Report Received</h3>
              <p className="text-sm text-muted-foreground">
                Your report has been logged under reference{' '}
                <span className="font-mono font-medium text-foreground">{submittedRef}</span>.
                Our engineering team will triage and review the issue.
              </p>
            </div>
            <div className="pt-2">
              <Button variant="default" onClick={handleClose}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            {error && (
              <div className="p-3 text-sm text-rose-700 bg-rose-50 dark:bg-rose-950/30 rounded-lg border border-rose-200 dark:border-rose-800">
                {error}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="report-app">Source App</Label>
                <Input
                  id="report-app"
                  value={detectedApp}
                  readOnly
                  disabled
                  className="bg-muted text-muted-foreground font-mono text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="report-severity">Severity</Label>
                <Select
                  value={severity}
                  onValueChange={(v: any) => setSeverity(v)}
                >
                  <SelectTrigger id="report-severity">
                    <SelectValue placeholder="Select severity" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOW">Low (Cosmetic / Minor)</SelectItem>
                    <SelectItem value="NORMAL">Normal (Standard Issue)</SelectItem>
                    <SelectItem value="HIGH">High (Feature Degraded)</SelectItem>
                    <SelectItem value="CRITICAL">Critical (Blocker / Data Loss)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="report-title">
                Title <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="report-title"
                placeholder="Brief summary of what happened"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="report-summary">
                Problem Description <span className="text-rose-500">*</span>
              </Label>
              <textarea
                id="report-summary"
                rows={3}
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder="Describe what occurred, who was affected, and any context"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="report-steps">Steps to Reproduce</Label>
              <textarea
                id="report-steps"
                rows={2}
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder="1. Go to shipments\n2. Click 'Export'\n3. Observe error dialog"
                value={steps}
                onChange={(e) => setSteps(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="report-expected">Expected Behavior</Label>
                <Input
                  id="report-expected"
                  placeholder="What should have happened"
                  value={expected}
                  onChange={(e) => setExpected(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="report-actual">Actual Behavior</Label>
                <Input
                  id="report-actual"
                  placeholder="What actually occurred"
                  value={actual}
                  onChange={(e) => setActual(e.target.value)}
                />
              </div>
            </div>

            {/* Sanitized Context Inspector */}
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowContext(!showContext)}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5 focus:outline-none"
              >
                <Icon name={showContext ? 'chevronDown' : 'chevronRight'} size={14} />
                <span>{showContext ? 'Hide' : 'Inspect'} automatically gathered context</span>
              </button>

              {showContext && (
                <div className="mt-2 p-2.5 rounded-lg bg-muted/60 text-[11px] font-mono text-muted-foreground space-y-1">
                  <div><strong>Route:</strong> {clientContext.source_route}</div>
                  <div><strong>User Agent:</strong> {clientContext.user_agent}</div>
                  <div><strong>Viewport:</strong> {clientContext.screen_resolution}</div>
                  <div className="text-[10px] text-teal-600 dark:text-teal-400 mt-1">
                    * Sensitive auth cookies, tokens, and local passwords are automatically stripped.
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="pt-3">
              <Button type="button" variant="outline" onClick={handleClose} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" variant="default" disabled={submitting}>
                {submitting ? 'Submitting...' : 'Submit Report'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};
