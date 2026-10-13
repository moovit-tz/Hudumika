import { Input } from './ui/input.js';
import { Textarea } from './ui/textarea.js';

const fields: Record<string, { key: string; label: string; secret?: boolean; multiline?: boolean }[]> = {
  cpanel: [{ key: 'baseUrl', label: 'cPanel HTTPS address' }, { key: 'username', label: 'cPanel username' }, { key: 'apiToken', label: 'API token', secret: true }, { key: 'imapHost', label: 'Incoming mail server' }, { key: 'smtpHost', label: 'Outgoing mail server' }],
  google: [{ key: 'serviceAccountEmail', label: 'Service account email' }, { key: 'delegatedAdmin', label: 'Delegated administrator email' }, { key: 'privateKey', label: 'Service account private key', secret: true, multiline: true }],
  microsoft: [{ key: 'directoryTenantId', label: 'Microsoft directory ID' }, { key: 'clientId', label: 'Application ID' }, { key: 'clientSecret', label: 'Application secret', secret: true }, { key: 'licenseSkuId', label: 'Exchange license SKU ID' }, { key: 'usageLocation', label: 'Two-letter usage country' }],
};
export function MailProviderFields({ provider, values, onChange }: { provider: string; values: Record<string, string>; onChange: (values: Record<string, string>) => void }) {
  return <div className="grid gap-4 md:grid-cols-2">{(fields[provider] ?? []).map(field => <label key={field.key} className="space-y-2 text-sm">
    <span>{field.label}</span>{field.multiline ? <Textarea aria-label={field.label} autoComplete="off" value={values[field.key] ?? ''} onChange={e => onChange({ ...values, [field.key]: e.target.value })} /> :
      <Input aria-label={field.label} type={field.secret ? 'password' : 'text'} autoComplete="off" value={values[field.key] ?? ''} onChange={e => onChange({ ...values, [field.key]: e.target.value })} />}
  </label>)}</div>;
}
