# Button sizing correction — 7 October 2026

## Cause and implementation
The previous native-button bridge imposed a universal 44px minimum width/height, and shared-button CSS forced action padding onto compact sizes. These rules overrode intentional toolbar and navigation geometry.

- Removed universal native minimum dimensions; native controls retain their authored height while ordinary page buttons continue using global radius/border tokens.
- Shared `sm` and `icon` buttons now follow `--ctl-h`, matching density-controlled inputs/selects. Default/large actions retain `--action-h`; font sizes and handlers are unchanged.
- CRM toolbar inputs, Apply, filters and settings align to `--ctl-h`; mobile search wraps within the page.
- Restored Agentic View and both sidebar arrows through explicit `data-ui-chrome-button` exceptions. The migration script preserves this marker.
- Updated the global design-system contract and guard against reintroducing the universal native height override.

## Browser evidence
Current saved density: toolbar controls 36px; empty-state Add Customer 44px; Agentic View 32px with pill radius; both sidebar toggles 22px with circular radius. At 390px viewport the document width is 390px and toolbar controls stay within the viewport. The customer directory loads 21 records after restarting the stopped local API; no customer-data restoration or deletion was performed.

## Validation
API and web TypeScript checks passed. Studio trigger check passed (92 registered/emitted). Updated design-system contract passed (18 checks), and encoding check passed. Browser inspection covered desktop, mobile and filtered empty state. This correction does not certify the broader platform production/security audit as complete.
