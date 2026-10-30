from pathlib import Path
# Cursor load-more fits the existing client-side tables without breaking legacy picker responses.
for filename,endpoint,setter,var in [('FreightRateCardsPage.tsx','rate-cards','setCards','cards'),('CarrierContractsPage.tsx','rate-contracts','setContracts','contracts'),('FreightBookingsPage.tsx','bookings','setBookings','bookings'),('CarriersPage.tsx','carriers','setCarriers','carriers')]:
 p=Path('apps/web/src/pages')/filename;s=p.read_text(encoding='utf-8');a=s.index('  const [loading,');s=s[:a]+"  const [nextCursor,setNextCursor] = useState<string>();\n  const [hasMore,setHasMore] = useState(false);\n"+s[a:];s=s.replace('  function load() {','  function load(cursor?: string) {',1)
 s=s.replace("apiFetch('/v1/freight-booking/"+endpoint+"')", "apiFetch(`/v1/freight-booking/"+endpoint+"?paged=true&limit=100${cursor?'&cursor='+encodeURIComponent(cursor):''}`)",1)
 if filename=='CarriersPage.tsx':s=s.replace('.then(setCarriers)', '.then(page=>{setCarriers(prev=>cursor?[...prev,...page.data]:page.data);setNextCursor(page.cursor);setHasMore(page.has_more);})',1)
 else:
  source={'FreightRateCardsPage.tsx':'rc','CarrierContractsPage.tsx':'c','FreightBookingsPage.tsx':'b'}[filename]
  s=s.replace(f'{setter}({source});',f'{setter}(prev=>cursor?[...prev,...{source}.data]:{source}.data);setNextCursor({source}.cursor);setHasMore({source}.has_more);',1)
 if filename=='FreightBookingsPage.tsx':s=s.replace('.catch(() => {}).finally(() => setLoading(false))',".catch((error:any) => setError(error.message || 'Could not load bookings')).finally(() => setLoading(false))")
 s=s.replace('onClick={load}', 'onClick={()=>load()}')
 a=s.rfind('\n    </div>\n  );\n}');s=s[:a]+f'''\n      {{hasMore&&<Button type="button" variant="outline" disabled={{loading}} onClick={{()=>load(nextCursor)}}>Load more {endpoint.replace('-',' ')}</Button>}}''' +s[a:]
 if filename=='FreightBookingsPage.tsx':s=s.replace('      <SectionCard', '      {error&&!expanded&&<p role="alert" className="text-destructive">{error}</p>}\n      <SectionCard',1)
 p.write_text(s,encoding='utf-8')
