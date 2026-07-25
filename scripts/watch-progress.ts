import * as fs from 'fs';
import * as path from 'path';

const OUTPUT_FILE = path.resolve(__dirname, '../trade_procedures_output.json');
const PROGRESS_HTML = path.resolve(__dirname, '../retry_progress.html');
const FAILED_IDS = [446, 1253, 572, 545, 565, 954, 958, 688, 464, 1452, 573, 802, 412, 1242, 1256];

function updateHtml() {
  try {
    if (!fs.existsSync(OUTPUT_FILE)) return;
    const data = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf-8'));
    
    const total = data.length;
    const succeeded = data.filter((d: any) => d.steps && d.steps.length > 0).length;
    const retryStatus = FAILED_IDS.map(id => {
      const item = data.find((d: any) => d.source_id === id);
      return {
        id,
        name: item ? item.name : 'Unknown',
        stepsCount: item && item.steps ? item.steps.length : 0,
        status: item && item.steps && item.steps.length > 0 ? 'COMPLETED' : (item && (item.note || item.steps?.length === 0) ? 'PROCESSED' : 'PENDING'),
        note: item?.note || (id === 446 || id === 1253 ? 'Overview page' : '')
      };
    });

    const completedRetries = retryStatus.filter(r => r.status === 'COMPLETED' || r.status === 'PROCESSED').length;
    const percent = Math.round((succeeded / total) * 100);

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta http-equiv="refresh" content="3">
  <title>Retry Progress Tracker</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #0b1e3a;
      color: #f4f5f6;
      margin: 0;
      padding: 40px 20px;
      display: flex;
      justify-content: center;
    }
    .container {
      background: #172a45;
      border-radius: 16px;
      padding: 30px;
      width: 100%;
      max-width: 850px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.5);
      border: 1px solid #3088a8;
    }
    h1 { color: #3088a8; margin-top: 0; font-size: 24px; }
    .progress-bar-bg {
      background: #0b1e3a;
      border-radius: 10px;
      height: 22px;
      width: 100%;
      overflow: hidden;
      margin: 20px 0;
      border: 1px solid #3088a8;
    }
    .progress-bar-fill {
      background: #3088a8;
      height: 100%;
      width: ${percent}%;
      transition: width 0.5s ease;
    }
    .stat-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 15px;
      margin-bottom: 30px;
    }
    .stat-card {
      background: #0b1e3a;
      padding: 18px;
      border-radius: 10px;
      text-align: center;
      border: 1px solid #3088a8;
    }
    .stat-num { font-size: 24px; font-weight: bold; color: #3088a8; }
    .stat-label { font-size: 11px; color: #a5b1c2; text-transform: uppercase; margin-top: 6px; }
    table { width: 100%; border-collapse: collapse; margin-top: 15px; }
    th, td { text-align: left; padding: 12px; border-bottom: 1px solid #3088a8; font-size: 13.5px; }
    th { color: #3088a8; text-transform: uppercase; font-size: 12px; }
    .badge {
      padding: 3px 8px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: bold;
    }
    .badge-completed { background: #059669; color: #fff; }
    .badge-processed { background: #d97706; color: #fff; }
    .badge-pending { background: #475569; color: #cbd5e1; }
    .footer { text-align: center; margin-top: 25px; font-size: 12px; color: #a5b1c2; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Tanzania Trade Portal — Retry Tracker</h1>
    
    <div class="progress-bar-bg">
      <div class="progress-bar-fill"></div>
    </div>

    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-num">${succeeded} / ${total}</div>
        <div class="stat-label">Total Procedures Complete</div>
      </div>
      <div class="stat-card">
        <div class="stat-num">${completedRetries} / 15</div>
        <div class="stat-label">Retries Processed</div>
      </div>
      <div class="stat-card">
        <div class="stat-num">${percent}%</div>
        <div class="stat-label">Overall Accuracy</div>
      </div>
    </div>

    <h3>15 Retry Queue Status</h3>
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Procedure Name</th>
          <th>Steps</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${retryStatus.map(r => `
          <tr>
            <td><strong>${r.id}</strong></td>
            <td>${r.name}</td>
            <td><strong style="color: #3088a8">${r.stepsCount}</strong></td>
            <td>
              <span class="badge badge-${r.status.toLowerCase()}">${r.status}</span>
              ${r.note ? `<br><small style="color: #a5b1c2">${r.note}</small>` : ''}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <div class="footer">
      Auto-refreshing every 3 seconds. Last updated: ${new Date().toLocaleTimeString()}
    </div>
  </div>
</body>
</html>`;

    fs.writeFileSync(PROGRESS_HTML, html, 'utf-8');
  } catch (e) {
    // ignore temporary read errors while file is being written by scraper
  }
}

updateHtml();
setInterval(updateHtml, 3000);
console.log('Progress watcher running...');
