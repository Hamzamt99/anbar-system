ALTER TABLE invoices ADD COLUMN audit_actor_id INTEGER;
ALTER TABLE invoices ADD COLUMN audit_actor_email TEXT;
CREATE TABLE audit_logs (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 invoice_id INTEGER NOT NULL,
 actor_id INTEGER,
 actor_email TEXT NOT NULL,
 action TEXT NOT NULL CHECK(action IN ('CREATE','UPDATE','PRINT')),
 before_data TEXT CHECK(before_data IS NULL OR json_valid(before_data)),
 after_data TEXT NOT NULL CHECK(json_valid(after_data)),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX audit_invoice ON audit_logs(invoice_id,id DESC);
CREATE INDEX audit_created ON audit_logs(created_at DESC,id DESC);
CREATE INDEX audit_actor ON audit_logs(actor_email,created_at DESC);
CREATE TRIGGER audit_invoice_create AFTER INSERT ON invoices BEGIN
INSERT INTO audit_logs(invoice_id,actor_id,actor_email,action,before_data,after_data)
VALUES(NEW.id,NEW.audit_actor_id,COALESCE(NEW.audit_actor_email,'غير معروف'),'CREATE',NULL,json_object('customer_id',NEW.customer_id,'driver_id',NEW.driver_id,'mix_type_id',NEW.mix_type_id,'vehicle_id',NEW.vehicle_id,'pump_id',NEW.pump_id,'customer_name',NEW.customer_name,'driver_name',NEW.driver_name,'mix_type_name',NEW.mix_type_name,'vehicle_name',NEW.vehicle_name,'pump_name',NEW.pump_name,'date',NEW.date,'pour_location',NEW.pour_location,'requested',NEW.requested,'truck_load',NEW.truck_load,'departure',NEW.departure,'arrival',NEW.arrival,'finish',NEW.finish,'chemicals',NEW.chemicals,'added_water',NEW.added_water,'receiver',NEW.receiver,'printed_at',NEW.printed_at));
END;
CREATE TRIGGER audit_invoice_update AFTER UPDATE OF customer_id,driver_id,mix_type_id,vehicle_id,pump_id,customer_name,driver_name,mix_type_name,vehicle_name,pump_name,date,pour_location,requested,truck_load,departure,arrival,finish,chemicals,added_water,receiver ON invoices
WHEN json_object('customer_id',OLD.customer_id,'driver_id',OLD.driver_id,'mix_type_id',OLD.mix_type_id,'vehicle_id',OLD.vehicle_id,'pump_id',OLD.pump_id,'customer_name',OLD.customer_name,'driver_name',OLD.driver_name,'mix_type_name',OLD.mix_type_name,'vehicle_name',OLD.vehicle_name,'pump_name',OLD.pump_name,'date',OLD.date,'pour_location',OLD.pour_location,'requested',OLD.requested,'truck_load',OLD.truck_load,'departure',OLD.departure,'arrival',OLD.arrival,'finish',OLD.finish,'chemicals',OLD.chemicals,'added_water',OLD.added_water,'receiver',OLD.receiver,'printed_at',OLD.printed_at) <> json_object('customer_id',NEW.customer_id,'driver_id',NEW.driver_id,'mix_type_id',NEW.mix_type_id,'vehicle_id',NEW.vehicle_id,'pump_id',NEW.pump_id,'customer_name',NEW.customer_name,'driver_name',NEW.driver_name,'mix_type_name',NEW.mix_type_name,'vehicle_name',NEW.vehicle_name,'pump_name',NEW.pump_name,'date',NEW.date,'pour_location',NEW.pour_location,'requested',NEW.requested,'truck_load',NEW.truck_load,'departure',NEW.departure,'arrival',NEW.arrival,'finish',NEW.finish,'chemicals',NEW.chemicals,'added_water',NEW.added_water,'receiver',NEW.receiver,'printed_at',NEW.printed_at) BEGIN
INSERT INTO audit_logs(invoice_id,actor_id,actor_email,action,before_data,after_data)
VALUES(NEW.id,NEW.audit_actor_id,COALESCE(NEW.audit_actor_email,'غير معروف'),'UPDATE',json_object('customer_id',OLD.customer_id,'driver_id',OLD.driver_id,'mix_type_id',OLD.mix_type_id,'vehicle_id',OLD.vehicle_id,'pump_id',OLD.pump_id,'customer_name',OLD.customer_name,'driver_name',OLD.driver_name,'mix_type_name',OLD.mix_type_name,'vehicle_name',OLD.vehicle_name,'pump_name',OLD.pump_name,'date',OLD.date,'pour_location',OLD.pour_location,'requested',OLD.requested,'truck_load',OLD.truck_load,'departure',OLD.departure,'arrival',OLD.arrival,'finish',OLD.finish,'chemicals',OLD.chemicals,'added_water',OLD.added_water,'receiver',OLD.receiver,'printed_at',OLD.printed_at),json_object('customer_id',NEW.customer_id,'driver_id',NEW.driver_id,'mix_type_id',NEW.mix_type_id,'vehicle_id',NEW.vehicle_id,'pump_id',NEW.pump_id,'customer_name',NEW.customer_name,'driver_name',NEW.driver_name,'mix_type_name',NEW.mix_type_name,'vehicle_name',NEW.vehicle_name,'pump_name',NEW.pump_name,'date',NEW.date,'pour_location',NEW.pour_location,'requested',NEW.requested,'truck_load',NEW.truck_load,'departure',NEW.departure,'arrival',NEW.arrival,'finish',NEW.finish,'chemicals',NEW.chemicals,'added_water',NEW.added_water,'receiver',NEW.receiver,'printed_at',NEW.printed_at));
END;
CREATE TRIGGER audit_invoice_print AFTER UPDATE OF printed_at ON invoices BEGIN
INSERT INTO audit_logs(invoice_id,actor_id,actor_email,action,before_data,after_data)
VALUES(NEW.id,NEW.audit_actor_id,COALESCE(NEW.audit_actor_email,'غير معروف'),'PRINT',json_object('customer_id',OLD.customer_id,'driver_id',OLD.driver_id,'mix_type_id',OLD.mix_type_id,'vehicle_id',OLD.vehicle_id,'pump_id',OLD.pump_id,'customer_name',OLD.customer_name,'driver_name',OLD.driver_name,'mix_type_name',OLD.mix_type_name,'vehicle_name',OLD.vehicle_name,'pump_name',OLD.pump_name,'date',OLD.date,'pour_location',OLD.pour_location,'requested',OLD.requested,'truck_load',OLD.truck_load,'departure',OLD.departure,'arrival',OLD.arrival,'finish',OLD.finish,'chemicals',OLD.chemicals,'added_water',OLD.added_water,'receiver',OLD.receiver,'printed_at',OLD.printed_at),json_object('customer_id',NEW.customer_id,'driver_id',NEW.driver_id,'mix_type_id',NEW.mix_type_id,'vehicle_id',NEW.vehicle_id,'pump_id',NEW.pump_id,'customer_name',NEW.customer_name,'driver_name',NEW.driver_name,'mix_type_name',NEW.mix_type_name,'vehicle_name',NEW.vehicle_name,'pump_name',NEW.pump_name,'date',NEW.date,'pour_location',NEW.pour_location,'requested',NEW.requested,'truck_load',NEW.truck_load,'departure',NEW.departure,'arrival',NEW.arrival,'finish',NEW.finish,'chemicals',NEW.chemicals,'added_water',NEW.added_water,'receiver',NEW.receiver,'printed_at',NEW.printed_at));
END;
CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit_logs BEGIN
SELECT RAISE(ABORT,'Audit logs are append-only');
END;
CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit_logs BEGIN
SELECT RAISE(ABORT,'Audit logs are append-only');
END;
