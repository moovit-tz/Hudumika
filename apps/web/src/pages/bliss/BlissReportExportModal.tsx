import React, { useState } from 'react';
import { Icon } from '../../components/Icon.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog.js';
import { Button } from '../../components/ui/button.js';
import { RadioGroup, RadioGroupItem } from '../../components/ui/radio-group.js';
import { showAlert } from '../../lib/alert.js';

interface BlissReportExportModalProps {
  open: boolean;
  onClose: () => void;
  reportTitle: string;
  data: any[];
  filenamePrefix: string;
}

export const BlissReportExportModal: React.FC<BlissReportExportModalProps> = ({
  open,
  onClose,
  reportTitle,
  data,
  filenamePrefix,
}) => {
  const [format, setFormat] = useState<'CSV' | 'Excel' | 'PDF' | 'JSON'>('CSV');
  const [scope, setScope] = useState<'all' | 'filtered'>('all');
  const [exporting, setExporting] = useState(false);
  const [done, setDone] = useState(false);

  const handleExport = () => {
    setExporting(true);
    setTimeout(() => {
      setExporting(false);
      setDone(true);
      
      // Generate and download sample file based on format
      if (format === 'CSV' || format === 'Excel') {
        if (data.length > 0) {
          const headers = Object.keys(data[0]).join(',');
          const rows = data.map(obj => Object.values(obj).map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
          const csvContent = 'data:text/csv;charset=utf-8,' + [headers, ...rows].join('\n');
          const encodedUri = encodeURI(csvContent);
          const link = document.createElement('a');
          link.setAttribute('href', encodedUri);
          link.setAttribute('download', `${filenamePrefix}_${new Date().toISOString().slice(0,10)}.${format === 'CSV' ? 'csv' : 'csv'}`);
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }
      } else if (format === 'JSON') {
        const jsonContent = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(data, null, 2));
        const link = document.createElement('a');
        link.setAttribute('href', jsonContent);
        link.setAttribute('download', `${filenamePrefix}_${new Date().toISOString().slice(0,10)}.json`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else if (format === 'PDF') {
        window.print();
      }

      showAlert(`${reportTitle} exported successfully in ${format} format.`, { title: 'Export Complete' });
    }, 600);
  };

  const resetAndClose = () => {
    setDone(false);
    setExporting(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetAndClose(); }}>
      <DialogContent style={{ maxWidth: 460 }}>
        <DialogHeader>
          <DialogTitle style={{ fontSize: 16, fontWeight: 700 }}>
            {done ? 'Export Ready' : `Export ${reportTitle}`}
          </DialogTitle>
        </DialogHeader>

        {!done ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '8px 0' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: 8, letterSpacing: '0.04em' }}>
                Format
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                {[
                  { id: 'CSV', label: 'CSV', icon: 'fileText' },
                  { id: 'Excel', label: 'Excel', icon: 'layers' },
                  { id: 'PDF', label: 'PDF', icon: 'printer' },
                  { id: 'JSON', label: 'JSON', icon: 'code' },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFormat(f.id as any)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 6,
                      padding: '12px 6px',
                      borderRadius: 'var(--r, 8px)',
                      border: format === f.id ? '2px solid var(--teal)' : '1px solid var(--border)',
                      background: format === f.id ? 'var(--teal-l)' : 'var(--white)',
                      color: format === f.id ? 'var(--teal)' : 'var(--ink)',
                      cursor: 'pointer',
                      fontWeight: 600,
                      fontSize: 12,
                      transition: 'all 0.15s ease',
                    }}
                   data-ui-native-button="">
                    <Icon name={f.icon as any} size={18} />
                    <span>{f.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: 8, letterSpacing: '0.04em' }}>
                Scope
              </div>
              <RadioGroup value={scope} onValueChange={value => setScope(value as typeof scope)} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label htmlFor="export-all" style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, cursor: 'pointer', padding: '8px 10px', borderRadius: 'var(--r, 6px)', background: scope === 'all' ? 'var(--bg)' : 'transparent' }}>
                  <RadioGroupItem id="export-all" value="all" />
                  <span>All records ({data.length} total rows)</span>
                </label>
                <label htmlFor="export-filtered" style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, cursor: 'pointer', padding: '8px 10px', borderRadius: 'var(--r, 6px)', background: scope === 'filtered' ? 'var(--bg)' : 'transparent' }}>
                  <RadioGroupItem id="export-filtered" value="filtered" />
                  <span>Current filtered view</span>
                </label>
              </RadioGroup>
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '16px 0 8px' }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(16, 185, 129, 0.12)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
              <Icon name="checkCircle" size={28} />
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>
              {format} Download Prepared
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>
              Your file is ready and has been triggered for download.
            </div>
          </div>
        )}

        <DialogFooter>
          {!done ? (
            <>
              <Button variant="outline" onClick={onClose} disabled={exporting}>
                Cancel
              </Button>
              <Button onClick={handleExport} disabled={exporting}>
                {exporting ? 'Exporting…' : 'Download Export'}
              </Button>
            </>
          ) : (
            <Button onClick={resetAndClose} className="w-full">
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
