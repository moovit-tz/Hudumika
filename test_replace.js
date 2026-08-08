const fs = require('fs');
const filePath = 'd:\\\\Apps\\\\Hudumika\\\\apps\\\\web\\\\src\\\\pages\\\\TrackingVehicleNew.tsx';
let content = fs.readFileSync(filePath, 'utf8');

const regex = /<Link\s+to="([^"]+)"\s+style=\{[^}]*inline-flex[\s\S]*?<\/Link>/g;

let modified = false;
let newContent = content.replace(regex, (match, to) => {
  modified = true;
  console.log("MATCH FOUND:", match);
  // Extract label
  const labelMatch = match.match(/<Icon[^>]*>\s*(.*?)\s*<\/Link>/);
  const label = labelMatch ? labelMatch[1].replace(/<\/?span[^>]*>/g, '').trim() : 'Back';
  return `<BackButton to="${to}" label="${label}" />`;
});

if (modified) {
  fs.writeFileSync(filePath, newContent, 'utf8');
  console.log('Updated file');
} else {
  console.log('No matches');
}
