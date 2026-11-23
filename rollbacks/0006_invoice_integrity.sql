-- Deploy the previous Worker before removing these controls. Keep a fresh export first.
DROP INDEX invoice_submission;
ALTER TABLE invoices DROP COLUMN creation_response;
ALTER TABLE invoices DROP COLUMN request_hash;
ALTER TABLE invoices DROP COLUMN idempotency_key;
ALTER TABLE invoices DROP COLUMN version;
