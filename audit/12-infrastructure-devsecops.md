# Infrastructure and DevSecOps

Read CI and deploy/contabo compose, backup and restore scripts. Production manifests configure separate DB roles, private network, Redis auth, no-new-privileges, dropped capabilities and scan-required uploads. Their deployed enforcement is NOT VERIFIED. CI uses Postgres13 while compose uses16: parity and fresh-install compatibility must be verified. Actions/images are version tags, not immutable digests.

Root typecheck FAIL: duplicate quotationRoutes import plus shared consultant/marketplace/metrics/launch/tests errors; exact diagnostics in typecheck.log/api-typecheck-after.log. These predate this audit and block a clean release even when ClearOS-focused tests pass. Root typecheck short-circuits subsequent trigger/design/encoding checks; they were not assumed passed.

Dependency audit: 27 affected package entries; advisory gate has continue-on-error:true. SBOM generation FAIL: npm ESBOMPROBLEMS reports overridden request/bn.js requirements incompatible with dependent manifests. Raw output retained at sbom-error.log (error output, not an SBOM). No install, lockfile edit, deployment or infrastructure mutation performed.

Reproducible build, artifact signing/provenance, deployed TLS/firewall/IAM/secret rotation, migration rollback and promotion gates remain NOT VERIFIED.
