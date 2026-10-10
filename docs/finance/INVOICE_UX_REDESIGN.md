# Invoice creation and document redesign

Implemented 8 October 2026.

- Full-page editor uses shared PageHeader, cards, inputs, date pickers, selects and buttons.
- Customer selection remains connected to CRM; catalog search preserves customer pricing.
- Unified products/services lines accept fractional quantities, units, line taxes and currencies, with optional shipment references and existing unbilled-time import.
- Business-line assignment remains gated by Finance entitlements. This redesign does not add sector-specific accounting engines.
- Validation checks names, quantities, rates, taxes, dates and exchange rate. A single recorded rate permits one foreign currency per document.
- Modern saved document uses tenant company details, customer billing address, items, subtotal, taxes, paid amount, balance and saved terms. Genuine fiscal verification and shipment emissions remain conditional.
- Print uses the rendered document, with no external QR service or fabricated bank/payment links. Payment recording, tasks, activity, reminders and notes remain connected to existing functions.
- Mobile editor changes line rows into labeled two-column fields; document tables scroll within their container and action toolbars wrap.

Validation: web TypeScript and design-system/encoding checks; browser creation and saved USD invoice checked at mobile and desktop widths. Fractional preview 2.5 × 100 plus 18% tax = 295. No live invoice or payment was issued during browser checks.

Outstanding: public payment portal/provider validation and industry-specific acceptance gates remain in ENTERPRISE_READINESS_REVIEW.md. References were inaccessible to the web tool; supplied screenshots guided the visual design.
