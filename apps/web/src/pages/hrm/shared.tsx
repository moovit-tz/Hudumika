import React from 'react';
import { Icon } from '../../components/Icon.js';
import type { IconName } from '../../components/Icon.js';
import { Button } from '../../components/ui/button.js';
import { PersonAvatar } from '../../components/PersonAvatar.js';
import { PageHeader as SharedPageHeader } from '../../components/PageHeader.js';

export function mapAttStatus(s: string) {
  switch (s) {
    case 'PRESENT':  return 'Present' as const;
    case 'ABSENT':   return 'Absent' as const;
    case 'LATE':     return 'Late' as const;
    case 'HALF_DAY': return 'Half-Day' as const;
    case 'ON_LEAVE': return 'On Leave' as const;
    default:         return 'Present' as const;
  }
}
export function toAttStatusApi(s: string): string { return s.toUpperCase().replace('-', '_'); }

export type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
export type AttStatus  = 'PRESENT' | 'ABSENT' | 'LATE' | 'HALF_DAY' | 'ON_LEAVE';

export const LEAVE_TYPES = ['Annual Leave','Sick Leave','Casual Leave','Maternity Leave','Emergency Leave'];

export const LEAVE_TYPE_COLORS: Record<string, string> = {
  ANNUAL: 'var(--teal)', SICK: 'var(--red)', CASUAL: 'var(--gold)',
  MATERNITY: 'var(--purple)', PATERNITY: 'var(--blue)', COMPASSIONATE: 'var(--gold)',
  EMERGENCY: 'var(--red)', UNPAID: 'var(--ink3)',
};
export const leaveTypeColor = (code: string) => LEAVE_TYPE_COLORS[String(code || '').toUpperCase()] || 'var(--teal)';

export const AVATAR_COLORS = ['#e8461a','#0891b2','#7c3aed','var(--green)','var(--gold)','#9333ea'];
export function avatarColor(n: string) { return AVATAR_COLORS[[...(n ?? '?')].reduce((a,c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length]; }
export function ini(n: string) { return n.split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase(); }
export function fmtTZS(n: number) { return 'TZS ' + n.toLocaleString(); }

export function Avatar({ name, size = 32, src, userId }: { name: string; size?: number; src?: string | null; userId?: string | null }) {
  return <PersonAvatar name={name} size={size} src={src} userId={userId} />;
}

export const S: Record<string, { bg: string; color: string; label: string }> = {
  ACTIVE:     { bg:'var(--green-l)',  color:'var(--green)', label:'Active'     },
  INACTIVE:   { bg:'hsl(var(--muted))', color:'hsl(var(--muted-foreground))',  label:'Inactive'   },
  ON_LEAVE:   { bg:'var(--gold-l)',  color:'var(--gold)',  label:'On Leave'   },
  APPROVED:   { bg:'var(--blue-l)',  color:'var(--blue)',  label:'Approved'   },
  REJECTED:   { bg:'var(--red-l)',   color:'var(--red)',   label:'Rejected'   },
  PENDING:    { bg:'var(--gold-l)',  color:'var(--gold)',  label:'Pending'    },
  CANCELLED:  { bg:'hsl(var(--muted))', color:'hsl(var(--muted-foreground))', label:'Cancelled'  },
  PAID:       { bg:'var(--green-l)',  color:'var(--green)', label:'Paid'       },
  PROCESSING: { bg:'var(--blue-l)',  color:'var(--blue)',  label:'Processing' },
  PRESENT:    { bg:'var(--green-l)',  color:'var(--green)', label:'Present'    },
  ABSENT:     { bg:'var(--red-l)',   color:'var(--red)',   label:'Absent'     },
  LATE:       { bg:'var(--gold-l)',  color:'var(--gold)',  label:'Late'       },
  HALF_DAY:   { bg:'var(--blue-l)',  color:'var(--blue)',  label:'Half Day'   },
  SUCCESS:    { bg:'var(--green-l)',  color:'var(--green)', label:'Success'    },
  FAILED:     { bg:'var(--red-l)',   color:'var(--red)',   label:'Failed'     },
  EXPIRED:    { bg:'hsl(var(--muted))', color:'hsl(var(--muted-foreground))', label:'Expired'    },
  ACCEPTED:   { bg:'var(--green-l)',  color:'var(--green)', label:'Accepted'   },
};

export function Badge({ status }: { status: string }) {
  const c = S[status] ?? { bg: 'rgba(100, 116, 139, 0.12)', color: 'var(--ink2)', label: status };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px',
      borderRadius: 9999, fontSize: 11, fontWeight: 700, background: c.bg, color: c.color,
      whiteSpace: 'nowrap', letterSpacing: '0.02em',
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: c.color }} />
      {c.label}
    </span>
  );
}

export function PageHeader({ icon, title, sub, children }: { icon?: IconName; title: string; sub?: string; children?: React.ReactNode; backTo?: string }) {
  return (
    <SharedPageHeader
      crumbs={['NexusHR', title]}
      title={title}
      subtitle={sub}
      actions={children ? <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>{children}</div> : undefined}
    />
  );
}

export function Card({ children, mb = 20 }: { children: React.ReactNode; mb?: number }) {
  return (
    <div style={{
      background: 'var(--white)', borderRadius: 'var(--card-radius, var(--r, 8px))',
      border: '1px solid var(--border)', boxShadow: 'var(--elev-sm, 0 1px 2px 0 rgba(15, 23, 42, 0.05))',
      overflow: 'hidden', marginBottom: mb,
    }}>
      {children}
    </div>
  );
}

export const TH = ({ children, right }: { children: React.ReactNode; right?: boolean }) => (
  <th style={{
    padding: '12px 16px', textAlign: right ? 'right' : 'left', fontWeight: 700,
    color: 'var(--ink3)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em',
    background: 'var(--card-sunken)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
  }}>
    {children}
  </th>
);

export const TD = ({ children, mono, right, muted, bold }: { children: React.ReactNode; mono?: boolean; right?: boolean; muted?: boolean; bold?: boolean }) => (
  <td style={{
    padding: '14px 16px', textAlign: right ? 'right' : 'left',
    color: muted ? '#64748b' : 'var(--ink)', fontFamily: mono ? 'var(--mono, var(--font))' : undefined,
    fontSize: muted ? 12 : 13, fontWeight: bold ? 700 : 500, borderBottom: '1px solid #f1f5f9',
  }}>
    {children}
  </td>
);

export function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <Card>
      <div className="rtbl-wrap" style={{ overflowX: 'auto' }}>
        <table className="rtbl" style={{ width: '100%', borderCollapse: 'collapse' }}>{children}</table>
      </div>
    </Card>
  );
}

export function PrimaryBtn({ label, icon, onClick, type = 'button' }: { label: string; icon?: IconName; onClick?: () => void; type?: 'button' | 'submit' }) {
  return (
    <Button type={type} size="sm" onClick={onClick} style={{ borderRadius: 'var(--r-sm, 6px)', fontWeight: 600 }}>
      {icon && <Icon name={icon} size={13} />}
      {label}
    </Button>
  );
}

export function ActionBtn({ label, color = 'var(--teal)', onClick }: { label: string; color?: string; onClick?: () => void }) {
  const isDanger = color.includes('red');
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        padding: '0 10px', height: '28px', borderRadius: '6px', fontSize: '12px', fontWeight: 600,
        fontFamily: 'var(--font)', cursor: 'pointer', marginRight: 6, transition: 'all 0.15s ease',
        background: isDanger ? 'rgba(225, 29, 72, 0.08)' : 'rgba(15, 118, 110, 0.08)',
        color: isDanger ? '#e11d48' : 'var(--teal, #0f766e)',
        border: isDanger ? '1px solid rgba(225, 29, 72, 0.2)' : '1px solid rgba(15, 118, 110, 0.2)',
      }}
    >
      {label}
    </button>
  );
}
