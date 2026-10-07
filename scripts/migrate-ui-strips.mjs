import { readFileSync, writeFileSync } from 'node:fs';
import ts from 'typescript';

// Only reviewed tab-only rows; state-changing links and mixed action toolbars
// must never be inferred to be navigation strips from a setter name alone.
const files = ['Calls', 'CMSApprovals', 'Contacts', 'DPODashboard', 'Leads', 'OndiSSO', 'PrivacyCenter', 'Quotations', 'SealCompartmentDetail', 'OscarCatalog', 'design_system/helpers', 'projects/ProjectGovernance', 'projects/ProjectIndustryPack', 'projects/ProjectPortfolios', 'projects/ProjectProcurement', 'projects/ProjectResources', 'projects/ProjectWbsSchedule', 'sms/SmsInbox', 'studio/ClearanceWorkflowInsights', 'superadmin/Operations'].map(f => `apps/web/src/pages/${f}.tsx`);
files.push('apps/web/src/components/container/ContainerTrackerCard.tsx');
let strips = 0;
for (const file of files) {
  let text = readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edits = new Map();
  function visit(node) {
    if (ts.isJsxOpeningElement(node) && node.tagName.getText(source) === 'button') {
      const attrs = node.attributes.properties;
      const click = attrs.find(a => ts.isJsxAttribute(a) && a.name.getText(source) === 'onClick');
      let setter;
      function findCall(n) {
        if (ts.isCallExpression(n) && /^set\w*Tab$/.test(n.expression.getText(source))) setter = n;
        ts.forEachChild(n, findCall);
      }
      if (click) findCall(click);
      if (setter && setter.arguments.length === 1) {
        let parent = node.parent.parent;
        while (parent && !ts.isJsxElement(parent)) parent = parent.parent;
        if (parent?.openingElement.tagName.getText(source) === 'div') {
          const opening = parent.openingElement;
          if (!opening.getText(source).includes('data-ds-tabstrip')) edits.set(opening.end - 1, ' data-ds-tabstrip=""');
          if (!node.getText(source).includes('data-ds-selected')) {
            const setterName = setter.expression.getText(source).slice(3);
            const state = setterName[0].toLowerCase() + setterName.slice(1);
            edits.set(node.end - 1, ` data-ds-selected={${state} === ${setter.arguments[0].getText(source)}}${node.getText(source).includes("aria-pressed") || node.getText(source).includes("aria-selected") ? "" : ` aria-pressed={${state} === ${setter.arguments[0].getText(source)}}`}`);
          } else if (!node.getText(source).includes('aria-pressed') && !node.getText(source).includes('aria-selected')) {
            const selected = attrs.find(a => ts.isJsxAttribute(a) && a.name.getText(source) === 'data-ds-selected');
            edits.set(node.end - 1, ` aria-pressed=${selected.initializer.getText(source)}`);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  for (const [pos, value] of [...edits].sort((a,b) => b[0]-a[0])) text = text.slice(0,pos) + value + text.slice(pos);
  if (edits.size) { writeFileSync(file, text); strips += [...edits.values()].filter(s => s.includes('data-ds-tabstrip')).length; }
}
console.log(`Marked ${strips} reviewed strips. Handlers and content are preserved.`);
