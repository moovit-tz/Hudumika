const fs = require('fs');
const path = require('path');

const pagesDir = path.join(__dirname, 'apps', 'web', 'src', 'pages');

function processDirectory(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      processDirectory(fullPath);
    } else if (file.endsWith('.tsx') || file.endsWith('.jsx')) {
      processFile(fullPath);
    }
  }
}

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  
  const regex = /<Link\s+to="([^"]+)"\s+style=\{[^}]*inline-flex[\s\S]*?<\/Link>/g;
  
  let modified = false;
  let newContent = content.replace(regex, (match, to) => {
    // Only replace if it has arrowLeft to avoid false positives
    if (!match.includes('arrowLeft')) return match;
    
    modified = true;
    const labelMatch = match.match(/<Icon[^>]*>\s*(.*?)\s*<\/Link>/);
    const label = labelMatch ? labelMatch[1].replace(/<\/?span[^>]*>/g, '').trim() : 'Back';
    return `<BackButton to="${to}" label="${label}" />`;
  });

  if (modified) {
    // Add import if missing
    if (!newContent.includes('BackButton')) {
      const importMatches = [...newContent.matchAll(/^import.*from.*;/gm)];
      if (importMatches.length > 0) {
        const lastImport = importMatches[importMatches.length - 1];
        const index = lastImport.index + lastImport[0].length;
        
        let depth = 1;
        if (filePath.includes('src\\pages\\')) {
          depth = filePath.split('src\\pages\\')[1].split('\\').length;
        } else if (filePath.includes('src/pages/')) {
          depth = filePath.split('src/pages/')[1].split('/').length;
        }
        let prefix = '../'.repeat(depth);
        
        newContent = newContent.slice(0, index) + `\nimport { BackButton } from '${prefix}components/ui/BackButton.js';` + newContent.slice(index);
      } else {
        // Fallback to top of file
        newContent = `import { BackButton } from '../components/ui/BackButton.js';\n` + newContent;
      }
    }
    
    fs.writeFileSync(filePath, newContent, 'utf8');
    console.log(`Updated: ${filePath}`);
  }
}

processDirectory(pagesDir);
console.log('Refactor complete.');
