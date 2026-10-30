# Invoice and credit actions — 25 October 2026

## FinOps correction

The invoice API already rejected manual payments on Draft invoices. The UI exposed an unconditional Payment dropdown and manual-payment form. The UI now allows collection only for persisted Unpaid, Partial or Overdue invoices with a finite, positive balance. Draft, Paid, Credited and unknown states cannot show collection actions. Manual submission, online-payment form and payment-link creation use the same guard. Switching invoice or status clears open payment forms and generated links.

Credit-note detail has no collection action. Creating a credit note linked to a draft invoice is rejected by the API. A regression check now verifies draft manual payment rejection, payment-link rejection, credit-note rejection and absence of a payment row afterward.

Verification: 10 frontend status/balance cases passed; 13 payment integrity integration tests passed with the new draft checks; the separate 31-test FinOps integrity suite passed. Root TypeScript, trigger, design-system and encoding checks passed. These are 54 distinct targeted tests, not 54 additional tests on every rerun.

## Live Perfex comparison

The user completed the public demo login after reCAPTCHA initially blocked access. The following were inspected through the authenticated browser; no payments, credits, emails or document status changes were submitted.

- Unpaid invoice INV-000012 has a Payment action. It opens a dedicated detail-pane form with amount due prefilled (9,145), payment date, payment mode, transaction ID, note and an email-notification suppression checkbox. Cancel returns to the invoice preview.
- Paid invoice INV-000005 has total 1,180, paid 1,180 and amount due zero. Its Payment link remains rendered with the CSS `disabled` class. FinOps now hides collection actions in this state instead of rendering a disabled button.
- Invoice More groups customer preview, Create Credit Note, Attach File, Copy Invoice, Mark as Sent, Mark as Cancelled, Pause Overdue Reminders and Delete. These entries were inspected, not executed. A screenshot alone does not establish their authorization or accounting behavior.
- Invoice details provide Invoice, Payments (when present), Tasks, Activity Log, Reminders and Notes tabs. The invoice summary distinguishes total, paid and amount due.
- The credit-note list includes amount and remaining amount, with filters, search, sorting and export. This demo had no credit notes. Its new credit-note form includes customer/billing/shipping, date/number, currency, reference, admin note, quantity/hour modes, item descriptions, quantity/rate/tax, discount, adjustment, client note and terms. Save and Save & Send are separate actions. Nothing was saved.
- The invoice list reported zero draft invoices. **Perfex draft-state payment and credit behavior was not verified live.** No draft was created to fill that gap.

The useful pattern is a lifecycle-aware primary action, secondary operations grouped in More, and a separate payment history. Credit/refund/application actions need their own lifecycle and permissions; they should not be represented as another generic Make Payment button. Do not infer that any menu item should be added to FinOps without its backend capability and tests.

Reference: [live Perfex invoice demo](https://perfexcrm.com/demo/admin/invoices#12), [official payment documentation](https://help.perfexcrm.com/record-invoice-payment/).

## Remaining browser verification

The local FinOps tab still displays the workspace lock overlay. Its underlying invoice list is available in the accessibility tree, but that is not evidence of an unlocked or interactable page. Draft and issued toolbar checks, switching documents with payment forms open, and mobile toolbar checks remain pending unlock. No credential or lock bypass was attempted.
