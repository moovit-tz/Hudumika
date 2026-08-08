# Deployment

Lens is deployed as part of the monolithic Hudumika build pipeline.
- **Database**: Migrations run automatically during `npm run db:migrate`.
- **API**: Hosted as part of the Fastify server cluster.
- **Frontend**: Bundled into the Vite static output and served via CDN/Nginx.