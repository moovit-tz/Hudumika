import fs from 'fs';

const originalLens = fs.readFileSync('apps/web/src/pages/Lens.tsx', 'utf8');
const tempLens = fs.readFileSync('temp_lens.txt', 'utf8');

const lines = originalLens.split('\n');
let composeLines = [];
let detailLines = [];
let inCompose = false;
let inDetail = false;

for (let line of lines) {
  if (line.includes('function Compose(')) {
    inCompose = true;
    inDetail = false;
  }
  if (line.includes('function Detail(')) {
    inDetail = true;
    inCompose = false;
  }
  if (line.includes('export function Lens(')) {
    inCompose = false;
    inDetail = false;
  }
  
  if (inCompose) composeLines.push(line);
  if (inDetail) detailLines.push(line);
}

const composeText = composeLines.join('\n');
const detailText = detailLines.join('\n');

fs.writeFileSync('apps/web/src/pages/Lens.tsx', tempLens + '\n' + composeText + '\n' + detailText);
