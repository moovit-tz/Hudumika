from pathlib import Path
p=Path('apps/api/src/routes/tracker.routes.ts');s=p.read_text(encoding='utf-8');s="import { createHash } from 'node:crypto';\n"+s
idx=s.index('const eventSchema');s=s[:idx]+'''function trackingDigest(body: any) {
  return createHash('sha256').update(JSON.stringify(Object.fromEntries(['tracking_type','tracking_number','carrier','origin_name','origin_code','dest_name','dest_code','current_location','status','status_code','eta','progress_pct','events','source','provider'].map(k => [k, body[k] ?? null])))).digest('hex');
}
''' +s[idx:]
s=s.replace('    return result;\n  });', "    return { ...result, proof: fastify.jwt.sign({ typ: 'tracking-result', tenant_id: user.tenant_id, digest: trackingDigest(result) }, { expiresIn: '15m' }) };\n  });",1)
a=s.index('  // POST /v1/tracker/snapshots');s=s[:a]+'''  function verifyLiveProof(body: any, tenantId: string) {
    if (body.source !== 'live') return;
    try {
      const proof = fastify.jwt.verify<any>(body.proof);
      if (proof.typ !== 'tracking-result' || proof.tenant_id !== tenantId || proof.digest !== trackingDigest(body)) throw new Error();
    } catch { throw Object.assign(new Error('Live tracking data must match a recent provider result'), { statusCode: 400 }); }
  }

''' +s[a:]
s=s.replace('    const body = snapshotSchema.parse(req.body);', '    const body = snapshotSchema.parse(req.body);\n    verifyLiveProof(body, user.tenant_id);')
s=s.replace('    const body = snapshotSchema.partial().parse(req.body);', '    const body = snapshotSchema.partial().parse(req.body);\n    verifyLiveProof(body, user.tenant_id);')
s=s.replace("const patch: Record<string, any> = { updated_at: new Date() };", "const patch: Record<string, any> = { updated_at: new Date(), source: body.source ?? 'manual', provider: body.provider ?? null };")
s=s.replace("'status', 'status_code', 'current_location', 'eta', 'progress_pct', 'source', 'provider'", "'origin_name','origin_code','dest_name','dest_code','status', 'status_code', 'current_location', 'eta', 'progress_pct', 'source', 'provider'")
p.write_text(s,encoding='utf-8')
p=Path('apps/web/src/pages/Tracker.tsx');s=p.read_text(encoding='utf-8');s=s.replace("source: 'live' | 'mock';", "source: 'live' | 'mock' | 'manual' | 'unknown';\n  proof?: string;")
s=s.replace('interface TrackingSnapshot {','interface TrackingSnapshot {\n  source: TrackingResult[\'source\'];\n  provider?: string;\n  fetched_at?: string;\n  share_expires_at?: string;\n  share_revoked?: boolean;')
s=s.replace("result.source === 'mock' ? 'Demo Data' : 'Live Data'", "result.source === 'live' ? 'Provider data' : result.source === 'manual' ? 'Manually entered data' : 'Unverified data'").replace("result.source === 'mock' ? 'Demo' : 'Live'", "result.source === 'live' ? 'Provider' : 'Unverified'")
s=s.replace("source: 'mock' as const", "source: snap.source ?? 'unknown' as const")
s=s.replace('body: JSON.stringify({ status: r.status, status_code: r.status_code, current_location: r.current_location, eta: r.eta, progress_pct: r.progress_pct, events: r.events, source: r.source, provider: r.provider })', 'body: JSON.stringify(r)')
a=s.index('  const copyLink = (token: string) => {');b=s.index('\n  const linkSnap',a)
s=s[:a]+'''  const copyLink = async (token: string) => {
    const snap = snapshots.find(s => s.share_token === token);
    if (!snap) return;
    try {
      const share = await apiFetch(`/v1/tracker/snapshots/${snap.id}/share`, { method: 'POST', body: JSON.stringify({ revoke: false }) });
      await navigator.clipboard.writeText(`${window.location.origin}/track/shared/${share.share_token}`);
      setCopied(true); setTimeout(() => setCopied(false), 2000); await loadSnapshots();
    } catch (error: any) { showAlert(error.message || 'Could not create share'); }
  };
  const revokeShare = async (id: string) => {
    try { await apiFetch(`/v1/tracker/snapshots/${id}/share`, { method: 'POST', body: JSON.stringify({ revoke: true }) }); await loadSnapshots(); showAlert('Share revoked'); }
    catch (error: any) { showAlert(error.message || 'Could not revoke share'); }
  };
''' +s[b:]
# place shared lifecycle action in existing saved card actions
needle='<button className="tr-btn" onClick={() => copyLink(snap.share_token)}';idx=s.index(needle);s=s[:idx]+'''<Button variant="outline" size="sm" onClick={() => revokeShare(snap.id)}>Revoke share</Button>
                    '''+s[idx:]
p.write_text(s,encoding='utf-8')
p=Path('apps/web/src/pages/TrackingShared.tsx');s=p.read_text(encoding='utf-8').replace('interface SharedSnap {', "interface SharedSnap {\n  source: 'live' | 'manual' | 'unknown';\n  provider?: string;\n  fetched_at?: string;");# add provenance in rendered body neartrackingnumber
idx=s.index('  return (',s.index('export const TrackingShared'))
# locate main renderedtracking number text snippet and add bannerbefore root existing
s=s.replace('{snap.tracking_number}', "{snap.tracking_number}",1)
needle='{/*';a=s.find(needle,idx)
if a!=-1:s=s[:a]+'''<p style={{ color: 'var(--ink3)', fontSize: 12 }}>Source: {snap.source === 'live' ? snap.provider || 'Tracking provider' : snap.source === 'manual' ? 'Manually entered' : 'Unverified'} · Last fetched: {fmtDate(snap.fetched_at)} · Snapshot, not a live feed</p>
      '''+s[a:]
p.write_text(s,encoding='utf-8')
