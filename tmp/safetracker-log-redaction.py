from pathlib import Path
p=Path('apps/api/src/index.ts');s=p.read_text(encoding='utf-8').replace("url: request.url?.split('?')[0], remoteAddress", "url: request.url?.split('?')[0].replace(/(\\/v1\\/tracker\\/shared\\/)[^/]+/, '$1[redacted]'), remoteAddress");p.write_text(s,encoding='utf-8')
p=Path('apps/api/src/routes/freight-booking.routes.ts');s=p.read_text(encoding='utf-8').replace('return reply.status(400).send({ error: err?.message', 'return reply.status(err?.statusCode ?? 400).send({ error: err?.message');p.write_text(s,encoding='utf-8')
