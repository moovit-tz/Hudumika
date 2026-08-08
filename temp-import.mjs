import fs from 'fs';
import path from 'path';

const files = ['ComplyLicenseCatalog.tsx', 'ComplyObligations.tsx', 'ComplyVault.tsx', 'ComplyWorkflows.tsx'];
const dir = 'd:/Apps/Hudumika/apps/web/src/pages';

for (const file of files) {
  const fullPath = path.join(dir, file);
  let content = fs.readFileSync(fullPath, 'utf8');
  
  if (!content.includes('import { PageHeader }')) {
    // Find the last import from react-router-dom or Icon to inject it
    content = content.replace(/(import .*? from '\.\.\/components\/Icon\.js';)/, "$1\nimport { PageHeader } from '../components/PageHeader.js';");
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log(`Added import to ${file}`);
  }
}
