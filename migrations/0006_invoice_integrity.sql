ALTER TABLE invoices ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE invoices ADD COLUMN idempotency_key TEXT;
ALTER TABLE invoices ADD COLUMN request_hash TEXT;
ALTER TABLE invoices ADD COLUMN creation_response TEXT;
CREATE UNIQUE INDEX invoice_submission ON invoices(created_by,idempotency_key) WHERE idempotency_key IS NOT NULL;
