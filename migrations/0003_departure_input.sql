-- Keep the entered time separately so edits never apply the offset repeatedly.
-- Older invoice times remain unchanged until their departure time is changed.
ALTER TABLE invoices ADD COLUMN departure_input TEXT;
