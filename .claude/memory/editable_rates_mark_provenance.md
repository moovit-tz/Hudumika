---
name: editable-rates-mark-provenance
description: "When a spec asks for user-editable rates/figures, allow editing but always mark user-entered values as overrides — never let them pass as authoritative"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 9bf459c6-d26c-4db4-8d42-19b5459154ec
  modified: 2026-07-30T14:18:23.789Z
---

When a build spec or user request asks to make authoritative-looking figures user-editable (duty rates, VAT, statutory levies, FX), the user chose **"allow, but mark them"** over both "allow silently, as the spec literally says" and "keep read-only". Same for FX: live rate as the default, overridable — not hardcoded to a spec's fixed value.

**Why:** a typed rate rendered in the same typeface as a tariff-database rate becomes indistinguishable on a PDF sent to a customer. The point isn't to prevent editing, it's to prevent a manual figure from inheriting the authority of a sourced one. Extends [[antigravity_review_pattern]]'s anti-fabrication rule to values the *user* supplies, not just ones an agent invents.

**How to apply:**
- Echo back which fields were overridden (`overridden_fields`) rather than silently accepting them.
- Change the label itself, not just a footnote — "Import Duty (10% — manual override)" instead of "(10% EAC CET)".
- Mark in every surface: line label, an on-screen banner, and a band on the exported document.
- Blank input must mean "use the sourced value" and be omitted from the request — never transmitted as `0`, which reads as a real 0% and deletes a tax line.
- Reject malformed overrides back to the sourced rate rather than defaulting them to zero.
- Clear overrides on "new calculation" — a rate typed for one shipment must not silently reapply to a different HS code.
