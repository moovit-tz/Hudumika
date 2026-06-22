const fastify = require('fastify')({ logger: true });
const path = require('path');
const fs = require('fs');
const { Client } = require('pg');

const envPath = path.join(__dirname, '../../.env');

fastify.get('/', async (request, reply) => {
  reply.type('text/html').send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>ClearOS Installation Wizard</title>
  <style>
    body { font-family: 'Inter', sans-serif; background: #f8f7f4; color: #0d1117; display: flex; justify-content: center; padding-top: 50px; }
    .card { background: #fff; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); max-width: 500px; width: 100%; }
    h1 { margin-top: 0; font-size: 24px; color: #0b7264; }
    label { display: block; margin-top: 15px; font-size: 13px; font-weight: 600; color: #3a3f48; }
    input { width: 100%; padding: 10px; margin-top: 5px; border: 1px solid #e4e2dc; border-radius: 6px; box-sizing: border-box; }
    button { margin-top: 25px; width: 100%; padding: 12px; background: #0b7264; color: #fff; border: none; border-radius: 6px; font-weight: 700; cursor: pointer; }
    button:hover { background: #08554a; }
    .alert { padding: 10px; border-radius: 6px; background: #fdf0ed; color: #bf3422; font-size: 13px; margin-bottom: 15px; display: none; }
  </style>
</head>
<body>
  <div class="card">
    <h1>🚀 ClearOS Setup</h1>
    <p style="font-size: 14px; color: #7a8190; margin-bottom: 20px;">Welcome to ClearOS! Enter your PostgreSQL database credentials to configure the application environment.</p>
    
    <div id="errorBox" class="alert"></div>

    <form id="setupForm">
      <label>Database Host</label>
      <input type="text" id="dbHost" value="localhost" required>
      
      <label>Database Port</label>
      <input type="number" id="dbPort" value="5432" required>
      
      <label>Database Name</label>
      <input type="text" id="dbName" value="clearos" required>
      
      <label>Database User</label>
      <input type="text" id="dbUser" value="postgres" required>
      
      <label>Database Password</label>
      <input type="password" id="dbPass" required>
      
      <button type="submit">Test Connection & Install</button>
    </form>
  </div>

  <script>
    document.getElementById('setupForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button');
      const err = document.getElementById('errorBox');
      btn.innerText = 'Connecting...';
      err.style.display = 'none';

      const data = {
        host: document.getElementById('dbHost').value,
        port: document.getElementById('dbPort').value,
        name: document.getElementById('dbName').value,
        user: document.getElementById('dbUser').value,
        pass: document.getElementById('dbPass').value,
      };

      try {
        const res = await fetch('/install', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        const result = await res.json();
        if (result.success) {
          document.querySelector('.card').innerHTML = '<h1>✅ Installation Complete!</h1><p style="color:#7a8190">The .env file has been written. You can now stop this installer and start the main API server!</p>';
        } else {
          err.innerText = result.error;
          err.style.display = 'block';
          btn.innerText = 'Test Connection & Install';
        }
      } catch (e) {
        err.innerText = 'Network error occurred.';
        err.style.display = 'block';
        btn.innerText = 'Test Connection & Install';
      }
    });
  </script>
</body>
</html>
  `);
});

fastify.post('/install', async (request, reply) => {
  const { host, port, name, user, pass } = request.body;
  
  // Test Postgres connection
  const client = new Client({
    host, port: Number(port), database: name, user, password: pass
  });

  try {
    await client.connect();
    await client.end();
  } catch (err) {
    return { success: false, error: 'Database connection failed: ' + err.message };
  }

  // Generate .env
  const envContent = \`NODE_ENV=production
APP_PORT=3000
DATABASE_URL=postgres://\${user}:\${pass}@\${host}:\${port}/\${name}
JWT_SECRET=\${Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)}
CORS_ORIGINS=http://localhost:5173,http://localhost:5174
LOG_LEVEL=info
REDIS_URL=redis://localhost:6379
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_USE_SSL=false
\`;

  try {
    fs.writeFileSync(envPath, envContent);
    return { success: true };
  } catch (err) {
    return { success: false, error: 'Failed to write .env file: ' + err.message };
  }
});

const start = async () => {
  try {
    await fastify.listen({ port: 8080, host: '0.0.0.0' });
    console.log('Wizard running at http://localhost:8080');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};
start();
