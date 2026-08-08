const fs = require('fs');
const files = [
  'apps/web/src/pages/SealCompartmentDetail.tsx',
  'apps/web/src/pages/TrackingIssueDetail.tsx',
  'apps/web/src/pages/TrackingMaintenanceNew.tsx',
  'apps/web/src/pages/TrackingShipmentNew.tsx',
  'apps/web/src/pages/TrackingVehicleDetail.tsx',
  'apps/web/src/pages/TrackingVehicleNew.tsx'
];

for (const file of files) {
  const filePath = require('path').join(__dirname, file);
  if (!fs.existsSync(filePath)) continue;
  
  let content = fs.readFileSync(filePath, 'utf8');
  if (!content.includes('BackButton')) continue; // if no usage, no need
  
  if (!content.includes("import { BackButton }")) {
    const importMatches = [...content.matchAll(/^import.*from.*;/gm)];
    let index = 0;
    if (importMatches.length > 0) {
      const lastImport = importMatches[importMatches.length - 1];
      index = lastImport.index + lastImport[0].length;
    }
    
    // all these are in src/pages/ so relative path to components is '../components/ui/BackButton.js'
    const insert = `\nimport { BackButton } from '../components/ui/BackButton.js';`;
    content = content.slice(0, index) + insert + content.slice(index);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Added import to ${file}`);
  }
}
