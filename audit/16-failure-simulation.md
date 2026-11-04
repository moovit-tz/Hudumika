# Adversarial scenario matrix

| Scenario | Method | Observed result / integrity | Status |
|---|---|---|---|
| Tenant A references B shipment | Real API + synthetic tenants | Before201; after400; no own declaration persisted for foreign id | PASS after fix |
| Missing shipment reference | Random UUID API write | Before201; after400 | PASS after fix |
| Ordinary/customer access | CUSTOMER GET declaration; SALES rate POST | 403 | PASS narrow |
| Invalid payment state | Draft→paid; draft→released | Before paid200; after400 for both | PASS narrow |
| Concurrent duplicate status | Three PAID requests on ASSESSED fixture | One PAID event, chain valid | PASS |
| FX upstream outage | Isolated https.get error, no live request | Before resolved2540; after explicit error | PASS |
| Browser runtime/render | Real handlers via inject | See browser-results.json | Separate result |
| DB loss halfway through operation | Not injected on shared DB | No result | BLOCKED |
| Worker crash/partition/retry storm | Not injected | No result | BLOCKED |
| Duplicate/out-of-order external callbacks | No isolated provider harness | No result | NOT VERIFIED |
| Malicious upload / prompt injection | Not executed | No result | NOT VERIFIED |
| Restore incomplete / corrupted backup | No isolated restore set | No result | BLOCKED |
| Credential/log leak, clock skew, resource exhaustion, compromised dependency | No active experiment | No result | NOT VERIFIED |

Detection/recovery times were not measured for unperformed scenarios. Tests assert data outcomes, not alerting or production containment.
