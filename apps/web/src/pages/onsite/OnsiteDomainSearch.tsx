import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiFetch } from '../../lib/api.js';
import { showAlert } from '../../lib/alert.js';
import { Icon } from '../../components/Icon.js';
import { PageHeader } from '../../components/PageHeader.js';
import { Button } from '../../components/ui/button.js';
import { Badge } from '../../components/ui/badge.js';
import { Input } from '../../components/ui/input.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '../../components/ui/dialog.js';
import { ButtonSpinner } from '../../components/ui/spinner.js';
import { Banner } from '../../components/ui/alert.js';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../../components/ui/card.js';
import './Onsite.css';

interface SearchSuggestion {
  domain: string;
  tld: string;
  available: boolean;
  error: string | null;
}
interface SearchResults {
  query: string;
  suggestions: SearchSuggestion[];
}

function searchMessage(error: string): string {
  if (/no RDAP service/i.test(error)) return 'Online checks are not available for this ending yet. Your domain provider can help you check it.';
  if (/rate limit|429/i.test(error)) return 'Too many searches right now. Please try again in a few minutes.';
  if (/timed out/i.test(error)) return 'The check took too long. Please try again.';
  return 'We couldn’t check this domain right now. Please try again later.';
}

export function OnsiteDomainSearch() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialQuery = searchParams.get('query') || '';
  const [query, setQuery] = useState(initialQuery);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResults | null>(null);
  const [requesting, setRequesting] = useState<string | null>(null);

  // Transfer dialog
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferDomain, setTransferDomain] = useState('');
  const [transferEpp, setTransferEpp] = useState('');
  const [transferring, setTransferring] = useState(false);

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    try {
      // Try registrar-backed check first; fall back to RDAP
      let res: any;
      try {
        const regRes = await apiFetch(`/v1/onsite/domains/registrar-check?domains=${encodeURIComponent(query)}`);
        if (regRes.connected) {
          res = {
            query: query.trim(),
            suggestions: (regRes.results ?? []).map((r: any) => ({
              domain: r.domain,
              tld: r.domain.split('.').slice(1).join('.'),
              available: r.available,
              error: null,
              premium: r.premium ?? false,
              price: r.price ?? null,
            })),
          };
        }
      } catch { /* registrar unavailable, fall through */ }
      if (!res) {
        res = await apiFetch(`/v1/onsite/domains/search-lookup?query=${encodeURIComponent(query)}`);
      }
      setResults(res);
    } catch (err: any) {
      showAlert(err.message || 'Could not check availability right now.', { variant: 'error' });
      setResults(null);
    } finally {
      setSearching(false);
    }
  };

  const suggestions = [...(results?.suggestions ?? [])].sort((a, b) => {
    const rank = (s: SearchSuggestion) => s.error ? 2 : s.available ? 0 : 1;
    return rank(a) - rank(b);
  });
  const availableCount = suggestions.filter(s => s.available && !s.error).length;
  const uncheckedCount = suggestions.filter(s => s.error).length;

  const handleRequest = async (domain: string) => {
    setRequesting(domain);
    try {
      const created = await apiFetch('/v1/onsite/domains/request', {
        method: 'POST', body: JSON.stringify({ domain }),
      });
      showAlert(`${domain} recorded as a registration request.`, { variant: 'success' });
      navigate(`/onsite/domains/${created.id}`);
    } catch (err: any) {
      showAlert(err.message || 'Could not record this request.', { variant: 'error' });
    } finally {
      setRequesting(null);
    }
  };

  const handleTransfer = async () => {
    if (!transferDomain.trim()) return;
    setTransferring(true);
    try {
      const created = await apiFetch('/v1/onsite/domains/transfer', {
        method: 'POST',
        body: JSON.stringify({ domain: transferDomain, eppCode: transferEpp || undefined }),
      });
      showAlert(`Transfer request for ${transferDomain} recorded.`, { variant: 'success' });
      setShowTransfer(false);
      setTransferDomain(''); setTransferEpp('');
      navigate(`/onsite/domains/${created.id}`);
    } catch (err: any) {
      showAlert(err.message || 'Transfer request failed.', { variant: 'error' });
    } finally {
      setTransferring(false);
    }
  };

  return (
    <div className="onsite-page">
      <PageHeader
        crumbs={['Onsite', 'Domain search']}
        titlePlain="Domain"
        titleEm="search"
        subtitle="Find an available website address for your business."
        actions={
          <Button variant="outline" onClick={() => setShowTransfer(true)}>
            <Icon name="refresh" size={14} /> Transfer a domain
          </Button>
        }
      />

      {/* Search bar */}
      <Card>
        <CardHeader><CardTitle>Find your domain</CardTitle><CardDescription>Enter a name or website address. We’ll check it and suggest other endings.</CardDescription></CardHeader>
        <CardContent>
        <form onSubmit={handleSearch} className="flex flex-col gap-3 sm:flex-row">
          <Input value={query} onChange={e => setQuery(e.target.value)}
            aria-label="Domain name" placeholder="e.g. yourbusiness.com" className="min-w-0 flex-1" />
          <Button type="submit" disabled={searching || !query.trim()}>
            {searching ? <><ButtonSpinner /> Searching…</> : <><Icon name="search" size={14} /> Search</>}
          </Button>
        </form>
        </CardContent>
      </Card>

      {/* Search results */}
      {results && (
        <Card className="mt-4" aria-live="polite" aria-busy={searching}>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle>Results for “{results.query}”</CardTitle>
              <Badge variant={availableCount ? 'success' : 'gray'}>{availableCount} available</Badge>
            </div>
            <CardDescription>{availableCount ? 'Available names are shown first. Choose one to request registration.' : 'Try another name or a different ending to find more options.'}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-3">
            {suggestions.map((s) => (
              <div key={s.domain} data-domain-result={s.domain} className="flex flex-col gap-3 rounded-lg border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 flex-1">
                  <span className="break-all font-semibold">{s.domain}</span>
                  {s.error && <p className="mt-1 text-sm text-muted-foreground">{searchMessage(s.error)}</p>}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-3">
                  {s.error ? (
                    <Badge variant="warning">Check unavailable</Badge>
                  ) : s.available ? (
                    <Badge variant="success">Available</Badge>
                  ) : (
                    <Badge variant="gray">Already registered</Badge>
                  )}
                  {s.available && !s.error && (
                    <Button size="sm" onClick={() => handleRequest(s.domain)} disabled={requesting !== null || searching}>
                      {requesting === s.domain && <ButtonSpinner />}
                      {requesting === s.domain ? 'Requesting…' : 'Request registration'}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
          {uncheckedCount > 0 && <Banner variant="warning">We couldn’t check {uncheckedCount} {uncheckedCount === 1 ? 'name' : 'names'}. You can try again or ask your domain provider for help.</Banner>}
          {uncheckedCount > 0 && <Button variant="outline" disabled={searching} onClick={() => void handleSearch()}>{searching ? 'Checking…' : 'Try again'}</Button>}
          </CardContent>
          <CardFooter><p className="text-sm text-muted-foreground">Your domain provider confirms final availability and price. If no provider is connected, your request will be saved for your team to complete.</p></CardFooter>
        </Card>
      )}

      {/* Transfer domain dialog */}
      <Dialog open={showTransfer} onOpenChange={setShowTransfer}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>Transfer a domain</DialogTitle></DialogHeader>
          <DialogBody>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.35rem' }}>Domain name</label>
                <Input value={transferDomain} onChange={e => setTransferDomain(e.target.value)} placeholder="yourdomain.com" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.35rem' }}>Transfer code</label>
                <Input value={transferEpp} onChange={e => setTransferEpp(e.target.value)} placeholder="Optional — ask your current domain provider" />
                <p style={{ fontSize: '0.72rem', color: 'var(--ink3)', marginTop: '0.25rem' }}>
                  This code lets us move your domain. You can add it later if you don’t have it yet.
                </p>
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTransfer(false)}>Cancel</Button>
            <Button onClick={handleTransfer} disabled={!transferDomain.trim() || transferring}>
              {transferring && <ButtonSpinner />}
              {transferring ? 'Initiating…' : 'Initiate transfer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
