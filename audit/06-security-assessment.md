# Security assessment

Baseline references: [OWASP ASVS 5.0.0](https://asvs.owasp.org/downloads/) and [WCAG 2.2](https://www.w3.org/TR/WCAG22/). This review does not claim complete ASVS L2/L3 compliance.

Performed: targeted source inspection, real API role/ownership checks on synthetic tenants, npm dependency audit, limited source-pattern scan. evidence/pattern-scan.txt is a heuristic scan, not a validated SAST engine; an initial missing file path is retained in pattern-scan-initial.txt; the scan was rerun against the resolved report helper. Secret values were not printed or copied. Complete git-history secret scanning, container scanning, DAST, SSRF/upload exploitation, OAuth/MFA attacks and malicious dependency execution are NOT VERIFIED.

Authenticated endpoint ownership is essential even with genuine RLS: an own-tenant declaration can otherwise carry a foreign shipment id. No foreign shipment content was observed leaking in the tested read path. Existing frontend auth visibility is not considered a server security control. Public estimate tokens are bearer access; email submission is a lead-capture gate, not verified identity.

Dependency findings are untriaged for production reachability; see raw advisory URLs in dependency-audit.json. No force upgrades were applied.
