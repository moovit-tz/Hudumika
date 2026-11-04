# Code defect and anti-pattern register

Origin cannot be attributed to AI from source alone. The following defects match the requested forensic categories, regardless of authorship:

- CLR-001: foreign-id validation missing before declaration insert; plausible UUID was accepted even when its shipment was not owned or did not exist. Fixed and reproduced by real DB/API tests.
- CLR-002: enum validation substituted for lifecycle validation. Payment/release checks now exist, but the full graph remains open.
- CLR-003: fabricated financial fallback (2540) and provider-labeled metadata masked an outage. Removed; outage test now rejects.
- CLR-004: unawaited transactional release event and unlocked ledger tip could race commit. Awaited and serialized; concurrent payment/chain test passes. Release-side fault injection still NOT VERIFIED.
- CLR-008: old audit probes record results without asserting safe behavior; a green suite could coexist with recorded defects. They remain probes, not release evidence.

Exact file/line/evidence and corrections are in findings.json. No blanket claim of generated-code detection, dead-code elimination, or architecture consistency is made.
