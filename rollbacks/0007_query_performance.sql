DROP TRIGGER recalculate_insert;
DROP TRIGGER recalculate_update;
CREATE TRIGGER recalculate_insert AFTER INSERT ON invoices BEGIN
UPDATE invoices SET previous=COALESCE((SELECT SUM(p.truck_load) FROM invoices p WHERE p.customer_id=invoices.customer_id AND p.date=invoices.date AND (p.created_at<invoices.created_at OR (p.created_at=invoices.created_at AND p.id<invoices.id))),0),
cumulative=truck_load+COALESCE((SELECT SUM(p.truck_load) FROM invoices p WHERE p.customer_id=invoices.customer_id AND p.date=invoices.date AND (p.created_at<invoices.created_at OR (p.created_at=invoices.created_at AND p.id<invoices.id))),0)
WHERE (customer_id=NEW.customer_id AND date=NEW.date);
END;
CREATE TRIGGER recalculate_update AFTER UPDATE OF customer_id,date,truck_load ON invoices BEGIN
UPDATE invoices SET previous=COALESCE((SELECT SUM(p.truck_load) FROM invoices p WHERE p.customer_id=invoices.customer_id AND p.date=invoices.date AND (p.created_at<invoices.created_at OR (p.created_at=invoices.created_at AND p.id<invoices.id))),0),
cumulative=truck_load+COALESCE((SELECT SUM(p.truck_load) FROM invoices p WHERE p.customer_id=invoices.customer_id AND p.date=invoices.date AND (p.created_at<invoices.created_at OR (p.created_at=invoices.created_at AND p.id<invoices.id))),0)
WHERE (customer_id=NEW.customer_id AND date=NEW.date) OR (customer_id=OLD.customer_id AND date=OLD.date);
END;

DROP INDEX invoice_customer_order;
DROP INDEX invoice_customer_driver_order;
DROP INDEX sessions_user;
DROP INDEX login_attempts_reset;
DROP INDEX audit_action_order;
