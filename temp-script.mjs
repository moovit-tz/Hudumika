import fs from 'fs';
import path from 'path';

const dir = 'd:/Apps/Hudumika/apps/web/src/pages';
const files = fs.readdirSync(dir).filter(f => f.startsWith('Comply') && f.endsWith('.tsx'));

for (const file of files) {
  const fullPath = path.join(dir, file);
  let content = fs.readFileSync(fullPath, 'utf8');
  let originalContent = content;

  // Pattern 1: Files already using PageHeader but with manual comply-page-hdr below it
  const regexPattern1 = /(<PageHeader[\s\S]*?(?:subtitle=\{[\s\S]*?\}|subtitle="[^"]*"|title="[^"]*"))([\s\n]*)\/>([\s\n]*)<div className="comply-page-hdr">([\s\n]*<div className="comply-action-row">[\s\S]*?<\/div>[\s\n]*)<\/div>/g;
  
  content = content.replace(regexPattern1, (match, pageHeader, p2, p3, actionRow) => {
    return `${pageHeader}\n        actions={${actionRow.trimRight()}\n        }\n      />`;
  });
  
  // Pattern 1b: Files with an empty comply-page-hdr below PageHeader (like ComplyAgencies.tsx)
  const regexPattern1b = /(<PageHeader[\s\S]*?)\/>([\s\n]*)<div className="comply-page-hdr">[\s\n]*<\/div>/g;
  content = content.replace(regexPattern1b, (match, pageHeader) => {
    return `${pageHeader}/>`;
  });

  // Pattern 2: Files using manual <h1><p> instead of PageHeader
  const regexPattern2 = /<div className="comply-page-hdr">[\s\n]*<div>[\s\n]*<h1 className="comply-page(?:-hdr)?-title">([^<]+)<\/h1>[\s\n]*<p className="comply-page(?:-hdr)?-sub">([\s\S]*?)<\/p>[\s\n]*<\/div>([\s\n]*<div className="comply-action-row">[\s\S]*?<\/div>[\s\n]*)<\/div>/g;
  
  content = content.replace(regexPattern2, (match, title, subtitle, actionRow) => {
    const words = title.trim().split(/\s+/);
    const em = words.length > 1 ? words.pop().toLowerCase() : title.toLowerCase();
    const plain = words.join(' ');
    
    let subtitleProp = subtitle.trim();
    if (subtitleProp.includes('<') || subtitleProp.includes('{')) {
      subtitleProp = `{<> ${subtitleProp} </>}`;
    } else {
      subtitleProp = `"${subtitleProp.replace(/"/g, '&quot;')}"`;
    }

    return `<PageHeader\n        crumbs={['ComplyOS', '${title.replace(/'/g, "\\'")}']} \n        titlePlain="${plain}"\n        titleEm="${em}"\n        subtitle=${subtitleProp}\n        actions={${actionRow.trimRight()}\n        }\n      />`;
  });
  
  // Pattern 3: Similar to Pattern 2 but without action row
  const regexPattern3 = /<div className="comply-page-hdr">[\s\n]*<div>[\s\n]*<h1 className="comply-page(?:-hdr)?-title">([^<]+)<\/h1>[\s\n]*<p className="comply-page(?:-hdr)?-sub">([\s\S]*?)<\/p>[\s\n]*<\/div>[\s\n]*<\/div>/g;
  content = content.replace(regexPattern3, (match, title, subtitle) => {
    const words = title.trim().split(/\s+/);
    const em = words.length > 1 ? words.pop().toLowerCase() : title.toLowerCase();
    const plain = words.join(' ');
    
    let subtitleProp = subtitle.trim();
    if (subtitleProp.includes('<') || subtitleProp.includes('{')) {
      subtitleProp = `{<> ${subtitleProp} </>}`;
    } else {
      subtitleProp = `"${subtitleProp.replace(/"/g, '&quot;')}"`;
    }

    return `<PageHeader\n        crumbs={['ComplyOS', '${title.replace(/'/g, "\\'")}']} \n        titlePlain="${plain}"\n        titleEm="${em}"\n        subtitle=${subtitleProp}\n      />`;
  });

  // Pattern 4: Wizard pages
  const regexPattern4 = /<div className="comply-page-hdr">[\s\n]*<div>[\s\n]*<h1 className="comply-page(?:-hdr)?-title">\{title\}<\/h1>[\s\n]*\{subtitle && <p className="comply-page(?:-hdr)?-sub">\{subtitle\}<\/p>\}[\s\n]*<\/div>[\s\n]*<\/div>/g;
  content = content.replace(regexPattern4, () => {
    return `<PageHeader crumbs={['ComplyOS', 'Wizard']} title={title} subtitle={subtitle} />`;
  });

  if (content !== originalContent) {
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log(`Updated ${file}`);
  }
}
