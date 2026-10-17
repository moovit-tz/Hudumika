# eSign document library

`/sign/templates` is the document library. Existing uploaded-document layouts remain under **Signing layouts**.

## Authoring and use

1. Browse by category or search, then choose **Create document**.
2. Select English, Kiswahili or Simplified Chinese and the governing jurisdiction. Catalogue templates offer the eight EAC countries, with Tanzania Mainland and Zanzibar separated. Company-authored templates can define their own supported jurisdictions and translations.
3. Answer a small set of factual questions and legal decision points; users do not write the clauses. The live preview shows the answers without changing the source template.
4. Generate a private saved document, review its read-only wording, and save or download a PDF. Change answers and regenerate to revise it.
5. **Prepare for signing** saves the document and opens the existing envelope editor with the generated PDF. Users still add recipients and signature fields and explicitly send the envelope. Opening the editor sends nothing.

**Create company template** accepts company-owned wording, a category, supported jurisdictions, and placeholders such as `{{company_name}}`. Each placeholder becomes a configurable question. `{{jurisdiction}}` is reserved for the selected jurisdiction. Templates can be copied into a new company version; existing generated documents retain a snapshot of their original definition.

Changing answers or language after generation requires explicit regeneration. Controlled templates are regenerated on the API, which ignores attempted arbitrary body edits. Legacy custom drafts retain the previous body-save compatibility. Document saves are explicit. The builder warns on its Back action and browser unload when edits are unsaved.

## Data and isolation

Migrations 602 and 603 add `sign_templates.document_definition`, the tenant-scoped `sign_generated_documents` table with forced RLS, and source-document/jurisdiction provenance on envelopes. All tenant queries use `withTenant` and explicit tenant filters. Generated drafts are private to their creator, including PDF sources. Referenced templates and source documents are checked within the same tenant before use.

New endpoints under `/v1/sign` require authentication and the existing `sign` entitlement:

- `GET/POST /document-library`
- `POST /document-library/:id/generate`
- `GET /generated-documents`
- `GET/PATCH /generated-documents/:id`
- `GET /generated-documents/:id/pdf` (`format=source` returns the source used by the envelope editor)

PDF output uses the existing PDFKit dependency and bundled document fonts. No third-party document-generation service is introduced.

## Content boundary

The 220 catalogue definitions now use prewritten original clause families, assembled for each document's listed subjects, with at most ten factual fields or decisions. `sign-document-clauses.ts` supplies substantive obligations; `sign-document-drafting.ts` assembles translated wording and transaction particulars. A user selects facts, dates, monetary arrangements and relevant choices (for example mutual versus one-way confidentiality, or termination without breach), rather than supplying every legal paragraph. The builder does not provide arbitrary text editing. Company template authors have separate wording editors for all three languages.

`sign-document-jurisdictions.ts` provides nine governing-law profiles for the eight EAC states, separating Tanzania Mainland and Zanzibar. Profiles contain translated governing-law provisions, execution guidance and researched source links. Country selection changes these provisions; it does not certify the whole document as locally enforceable. Burundi's detailed statutory formalities remain unverified and are explicitly identified as such. Special instruments (land transfers, powers of attorney, securities, employment and statutory declarations) still need their instrument-specific mandatory terms/forms and local execution process checked. Shared clause families are not 220 separately vetted statutory instruments.

Language is stored as `definition.language` within the generated-document snapshot, so no new database migration is needed. Translated bodies, question labels, choice labels and jurisdiction clauses are snapshotted together; existing saved definitions are not rewritten. English, Kiswahili and Simplified Chinese versions use the same answer keys. Changing language preserves entered facts; it does not translate names or free-text answers or claim to provide certified translation. The same `expandSignDocument` function powers browser previews and server rendering. Chinese-containing PDF output embeds bundled Noto Sans CJK SC; its SIL OFL license is included with the font assets.

Design reference: https://www.lawdepot.com/ — catalogue, guided questions, customisation and document output.

Verification: `npm run test -w apps/api -- src/tests/sign-documents.test.ts` exercises real database persistence, template snapshots, PDF generation, envelope handoff, and cross-tenant/creator isolation.


## Browsing and classification

The template library and saved document drafts support grid and row views. The display preference is saved per browser. Search, app/category/type/source/jurisdiction filters, page number and page size are encoded in the URL. Results are filtered before pagination; filter and page-size changes reset the page, and out-of-range pages are clamped. Page sizes are 12, 24, 48 and 96, using the shared PaginationBar.

Template definitions optionally carry `apps` (registered AppIds) and `document_type` (agreement, letter, policy, record or form). Untagged company templates remain company-wide; legacy templates without a type appear as Unclassified. Company authoring and template copies preserve these fields. Draft listings expose classification metadata from their saved definition snapshot without sending the complete template body.

Catalogue data lives in the business, operations and platform files alongside `sign-document-catalogue.ts`. Tests check unique IDs, valid question definitions, placeholder completion, app coverage, and representative document-specific sections. This is broad operational coverage, not an exhaustive set of statutory forms for every jurisdiction.

Additional product references supplied by the user:

- https://www.pandadoc.com/templates/ — searchable business-document library and document categories.
- https://eforms.com/power-of-attorney/durable/ — example of authority-specific questions and jurisdiction-specific form selection. Hudumika’s durable power of attorney entry is an original drafting outline; it does not reproduce a statutory form or claim to satisfy a jurisdiction’s execution requirements.

The app and category dropdowns opt into searchable quick filters. Shared quick-filter popovers are height-bounded to the available viewport; existing short filters retain their current controls.

## Template preview and thumbnails

Library titles, thumbnail images and Preview actions open /sign/templates/preview/:templateId, a read-only full-document route inside PageLayout. Previewing creates no draft. Language and supported jurisdiction choices alter the preview and carry into the guided builder through Use this template. Back to library retains the originating search/filter/page query. Company wording authoring remains available from the preview.

SignTemplateThumbnail generates an escaped SVG from each template title and actual wording in the browser, with no external image service or storage. Both compact grid cards and compact rows show these document-specific thumbnails. Drafts without a loaded source definition retain a document icon rather than an invented content thumbnail.



## Unified creation workspace

`/sign/editor` is the creation entry point. Its query modes select importing (`mode=import`), readonly preview (`mode=preview&source=...`), company wording (`mode=author`), guided decisions (`mode=guided&source=...`), or a persisted document (`mode=draft&draft=...`). The `document` query continues to hand a generated PDF into field placement. Legacy template creation/build/draft URLs redirect with their query selections intact.

The guided flow separates location/language, key decisions, and review/export. Writing original wording creates a private generated-document draft without publishing a company template. Saving a company template is a separate action. Tenant and creator filters protect private drafts.

Migration 604 adds the source document to signing templates so uploaded PDFs/images survive save/import. Template list responses omit the source payload; detail responses include it. Recipient execution roles and certification credentials remain in the reusable layout. Importing a new template from an active field editor asks the user to save the current draft first.
