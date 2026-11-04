# Privacy and compliance

Data classes observed: importer/declarant names and TINs, customer details, staff identity/roles, shipment records, financial estimate payloads, public report metadata, lead email/company fields and document storage keys. Config inventory stores only key names/presence/hostnames. Synthetic fixtures use invalid-domain emails.

Public share teaser includes customer_name; a token holder can provide an email to unlock estimate content. Whether recipients and tenant users understand this disclosure needs product/privacy review. Retention of immutable declaration events conflicts with naive tenant cascade deletion; a documented retention/anonymization policy is required.

NOT VERIFIED: deployment region/data residency, legal basis/consent, jurisdiction-specific obligations, encryption-at-rest/key management, personal-data export/deletion, backup retention and provider contracts. No GDPR/HIPAA/PCI compliance claim is made.
