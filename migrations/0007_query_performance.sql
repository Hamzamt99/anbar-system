CREATE INDEX invoice_customer_order ON invoices(customer_id,date DESC,id DESC);
CREATE INDEX invoice_customer_driver_order ON invoices(customer_id,driver_id,date DESC,id DESC);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE INDEX login_attempts_reset ON login_attempts(reset_at);
CREATE INDEX audit_action_order ON audit_logs(action,id DESC);
DROP TRIGGER recalculate_insert;
DROP TRIGGER recalculate_update;
CREATE TRIGGER recalculate_insert AFTER INSERT ON invoices BEGIN
UPDATE invoices SET previous=COALESCE((SELECT SUM(p.truck_load) FROM invoices p WHERE p.customer_id=NEW.customer_id AND p.date=NEW.date AND (p.created_at,p.id)<(NEW.created_at,NEW.id)),0), cumulative=truck_load+COALESCE((SELECT SUM(p.truck_load) FROM invoices p WHERE p.customer_id=NEW.customer_id AND p.date=NEW.date AND (p.created_at,p.id)<(NEW.created_at,NEW.id)),0) WHERE id=NEW.id;
UPDATE invoices SET previous=previous+NEW.truck_load,cumulative=cumulative+NEW.truck_load,version=version+1 WHERE customer_id=NEW.customer_id AND date=NEW.date AND (created_at,id)>(NEW.created_at,NEW.id);
END;
CREATE TRIGGER recalculate_update AFTER UPDATE OF customer_id,date,truck_load ON invoices
WHEN OLD.customer_id<>NEW.customer_id OR OLD.date<>NEW.date OR OLD.truck_load<>NEW.truck_load BEGIN
UPDATE invoices SET previous=previous-OLD.truck_load,cumulative=cumulative-OLD.truck_load,version=version+1 WHERE customer_id=OLD.customer_id AND date=OLD.date AND (created_at,id)>(OLD.created_at,OLD.id) AND id<>NEW.id;
UPDATE invoices SET previous=COALESCE((SELECT SUM(p.truck_load) FROM invoices p WHERE p.customer_id=NEW.customer_id AND p.date=NEW.date AND (p.created_at,p.id)<(NEW.created_at,NEW.id)),0), cumulative=truck_load+COALESCE((SELECT SUM(p.truck_load) FROM invoices p WHERE p.customer_id=NEW.customer_id AND p.date=NEW.date AND (p.created_at,p.id)<(NEW.created_at,NEW.id)),0) WHERE id=NEW.id;
UPDATE invoices SET previous=previous+NEW.truck_load,cumulative=cumulative+NEW.truck_load,version=version+1 WHERE customer_id=NEW.customer_id AND date=NEW.date AND (created_at,id)>(NEW.created_at,NEW.id);
END;
