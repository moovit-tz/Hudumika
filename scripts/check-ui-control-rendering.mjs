import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const browser = await chromium.launch();
const results = [];
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const base = process.env.CONTROL_TEST_URL || 'http://localhost:5173/';
  await page.route('**/__control-contract', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><link rel="stylesheet" href="/src/index.css"></head><body></body></html>' }));
  await page.goto(new URL('/__control-contract', base).href, { waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    const { default: RefreshRuntime } = await import('/@react-refresh');
    RefreshRuntime.injectIntoGlobalHook(window);
    window.$RefreshReg$ = () => {};
    window.$RefreshSig$ = () => type => type;
    window.__vite_plugin_react_preamble_installed__ = true;
    const R = await import('/node_modules/.vite/deps/react.js');
    const React = R.default || R;
    const D = await import('/node_modules/.vite/deps/react-dom_client.js');
    const { Input } = await import('/src/components/ui/input.tsx');
    const { Textarea } = await import('/src/components/ui/textarea.tsx');
    const { Button } = await import('/src/components/ui/button.tsx');
    const { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } = await import('/src/components/ui/select.tsx');
    const { Combobox } = await import('/src/components/ui/combobox.tsx');
    const { DatePicker } = await import('/src/components/ui/date-picker.tsx');
    const { SearchToolbar } = await import('/src/components/ui/filter-dropdown.tsx');
    const { Tabs, TabsList, TabsTrigger } = await import('/src/components/ui/tabs.tsx');
    const h = React.createElement;
    const host = document.createElement('div');
    host.id = 'control-contract-preview';
    host.style.cssText = 'width:100%;max-width:1100px;padding:var(--space-lg);margin:auto;box-sizing:border-box;background:var(--white);color:var(--ink)';
    document.body.append(host);
    function Catalog() {
      const [value, setValue] = React.useState('');
      const [option, setOption] = React.useState('first');
      const [combo, setCombo] = React.useState('first');
      const [date, setDate] = React.useState();
      const [query, setQuery] = React.useState('');
      const [status, setStatus] = React.useState(null);
      return h('div', { style: { display: 'grid', gap: 'var(--space-md)', minWidth: 0 } },
        h(Tabs, { defaultValue: 'bills' }, h(TabsList, null, h(TabsTrigger, { value: 'bills' }, 'Bills'), h(TabsTrigger, { value: 'recurring' }, 'Recurring (0)'))),
        h(SearchToolbar, { layout: 'register', search: query, onSearch: setQuery, placeholder: 'Search bill # or supplier…', quickFilters: [{ value: status, onChange: setStatus, allLabel: 'All statuses', options: [{ value: 'paid', label: 'Paid' }, { value: 'draft', label: 'Draft' }] }, { value: null, onChange: () => {}, allLabel: 'All suppliers', options: [] }], actions: h(Button, { type: 'button' }, 'New bill') }),
        h(Input, { id: 'contract-input', 'aria-label': 'Company', value, onChange: e => setValue(e.target.value), placeholder: 'Company name' }),
        h(Select, { value: option, onValueChange: setOption }, h(SelectTrigger, { 'aria-label': 'Status' }, h(SelectValue)), h(SelectContent, null, h(SelectItem, { value: 'first' }, 'First'), h(SelectItem, { value: 'second' }, 'Second'))),
        h(Combobox, { options: [{ value: 'first', label: 'First client' }, { value: 'second', label: 'Second client' }], value: combo, onChange: setCombo, placeholder: 'Choose client' }),
        h(DatePicker, { date, onChange: setDate, placeholder: 'Choose date' }),
        h(Textarea, { 'aria-label': 'Notes', placeholder: 'Notes' }),
        h(Input, { 'aria-label': 'Invalid field', 'aria-invalid': true, placeholder: 'Required value' }),
        h(Input, { 'aria-label': 'Disabled field', disabled: true, value: 'Disabled', readOnly: true }),
        h('div', { style: { display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap' } }, h(Button, { type: 'button' }, 'Continue'), h(Button, { type: 'button', size: 'sm', variant: 'outline' }, 'Cancel'), h(Button, { type: 'button', size: 'xs', variant: 'ghost' }, 'More'), h(Button, { type: 'button', disabled: true }, 'Unavailable')),
        h('output', { id: 'contract-state' }, `${query}|${status}|${option}|${combo}|${value}`));
    }
    (D.createRoot || D.default.createRoot)(host).render(h(Catalog));
  });
  await page.locator('#contract-input').waitFor();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1100 });
    for (const theme of ['light', 'dark']) {
      for (const density of ['compact', 'default', 'comfortable']) {
        for (const radius of [0, 8, 18]) {
          await page.evaluate(async ({ theme, density, radius }) => {
            localStorage.setItem('hudumika_design_system_version', JSON.stringify({ version: 'v1' }));
            document.documentElement.setAttribute('data-theme', theme);
            const ds = await import('/src/hooks/useDesignSystem.ts');
            const tokens = ds.readDesignTokens();
            tokens.density = density;
            tokens.shape = { ...tokens.shape, rSm: radius };
            ds.applyDesignTokens(tokens);
          }, { theme, density, radius });
          await page.mouse.move(0, 0);
          const measured = await page.locator('#control-contract-preview').evaluate(root => {
            const fields = [...root.querySelectorAll('[data-ui-field]:not([data-ui-field="textarea"]):not(:disabled):not([aria-invalid="true"])')].map(e => ({ height: e.getBoundingClientRect().height, radius: getComputedStyle(e).borderRadius, color: getComputedStyle(e).color, background: getComputedStyle(e).backgroundColor, font: getComputedStyle(e).fontFamily }));
            const toolbar = [...root.querySelectorAll('.stb-search,.stb-dropdown-btn,.stb-actions [data-ui-button]')].map(e => e.getBoundingClientRect().height);
            return { fields, toolbar, overflow: root.scrollWidth > root.clientWidth + 1 };
          });
          const heights = measured.fields.map(f => f.height);
          if (measured.overflow || Math.max(...heights) - Math.min(...heights) > 1 || measured.fields.some(f => f.radius !== `${radius}px`) || Math.max(...measured.toolbar) - Math.min(...measured.toolbar) > 1) throw new Error(JSON.stringify({ width, theme, density, radius, measured }));
          results.push({ width, theme, density, radius, ...measured });
        }
      }
    }
  }
  await page.getByRole('searchbox', { name: 'Search bill # or supplier…' }).fill('ACME');
  await page.getByRole('button', { name: /All statuses/ }).click();
  await page.getByRole('button', { name: 'Paid', exact: true }).click();
  await page.getByRole('combobox', { name: 'Status', exact: true }).click();
  await page.getByRole('option', { name: 'Second', exact: true }).click();
  await page.getByRole('textbox', { name: 'Company', exact: true }).fill('ACME Ltd');
  const state = await page.locator('#contract-state').innerText();
  if (!state.includes('ACME|paid|second|first|ACME Ltd')) throw new Error(`Control interactions failed: ${state}`);
  if (errors.length) throw new Error(errors.join('\n'));
  writeFileSync('docs/audits/platform-controls-browser.json', JSON.stringify({ configurations: results.length, interactions: 'Search, filter, select, input and disabled controls passed', results }, null, 2));
  console.log(`Passed ${results.length} density/shape/theme/viewport configurations and control interactions.`);
} finally {
  await browser.close();
}
