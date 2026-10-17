ALTER TABLE sign_envelopes
 ADD COLUMN generated_document_id uuid REFERENCES sign_generated_documents(id) ON DELETE SET NULL,
 ADD COLUMN document_jurisdiction text;
