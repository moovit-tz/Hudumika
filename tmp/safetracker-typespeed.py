from pathlib import Path
p=Path('apps/api/src/services/tracker-integrity.ts');s=p.read_text(encoding='utf-8');a=s.index('    const row = await trx.selectFrom(table)');b=s.index('\n    if (!row)',a);s=s[:a]+'''    let row: { id: string } | undefined;
    if (table === 'customers') row = await trx.selectFrom('customers').select('id').where('tenant_id','=',tenantId).where('id','=',id).executeTakeFirst();
    if (table === 'shipment_cases') row = await trx.selectFrom('shipment_cases').select('id').where('tenant_id','=',tenantId).where('id','=',id).executeTakeFirst();
    if (table === 'carriers') row = await trx.selectFrom('carriers').select('id').where('tenant_id','=',tenantId).where('id','=',id).executeTakeFirst();
    if (table === 'freight_rate_cards') row = await trx.selectFrom('freight_rate_cards').select('id').where('tenant_id','=',tenantId).where('id','=',id).executeTakeFirst();''' +s[b:];p.write_text(s,encoding='utf-8')
