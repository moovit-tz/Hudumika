import fs from 'fs';
import path from 'path';

const fullPath = 'd:/Apps/Hudumika/apps/web/src/pages/ComplyCalendar.tsx';
let content = fs.readFileSync(fullPath, 'utf8');

const regexPattern1 = /(<PageHeader[\s\S]*?(?:subtitle=\{[\s\S]*?\}|subtitle="[^"]*"|title="[^"]*"))([\s\n]*)\/>([\s\n]*)<div className="comply-page-hdr">([\s\n]*<div style={{ display: 'flex', gap: 10 }}>[\s\S]*?<\/div>[\s\n]*)<\/div>/g;

content = content.replace(regexPattern1, (match, pageHeader, p2, p3, actionRow) => {
  return `${pageHeader}\n        actions={${actionRow.trimRight()}\n        }\n      />`;
});

fs.writeFileSync(fullPath, content, 'utf8');
console.log(`Updated ComplyCalendar.tsx`);
