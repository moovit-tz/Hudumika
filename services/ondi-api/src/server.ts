import 'dotenv/config';
import { buildApp } from './app.js';

const app = await buildApp();

// Railway (and most PaaS hosts) assign the listen port dynamically via
// $PORT — 7020 stays the fallback for local dev, where nothing sets it.
const port = Number(process.env.PORT) || 7020;

app.listen({ port, host: '0.0.0.0' }).catch(err => {
  app.log.error(err);
  process.exit(1);
});
