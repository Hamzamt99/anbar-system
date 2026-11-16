PRAGMA foreign_keys=ON;
CREATE TABLE users(id INTEGER PRIMARY KEY AUTOINCREMENT,email TEXT NOT NULL UNIQUE COLLATE NOCASE,password_hash TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('DATA_ENTRY','ADMIN','SUPER_ADMIN')),created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires_at INTEGER NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE login_attempts(key TEXT PRIMARY KEY,attempts INTEGER NOT NULL,reset_at INTEGER NOT NULL);
CREATE TABLE customers(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,deleted_at TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX customers_active_name ON customers(name COLLATE NOCASE) WHERE deleted_at IS NULL;
CREATE TABLE drivers(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,deleted_at TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX drivers_active_name ON drivers(name COLLATE NOCASE) WHERE deleted_at IS NULL;
CREATE TABLE mix_types(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,deleted_at TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX mix_types_active_name ON mix_types(name COLLATE NOCASE) WHERE deleted_at IS NULL;
CREATE TABLE vehicles(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,deleted_at TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX vehicles_active_name ON vehicles(name COLLATE NOCASE) WHERE deleted_at IS NULL;
CREATE TABLE pumps(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,deleted_at TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX pumps_active_name ON pumps(name COLLATE NOCASE) WHERE deleted_at IS NULL;
CREATE TABLE invoices(
id INTEGER PRIMARY KEY AUTOINCREMENT,
customer_id INTEGER NOT NULL REFERENCES customers(id),driver_id INTEGER NOT NULL REFERENCES drivers(id),mix_type_id INTEGER NOT NULL REFERENCES mix_types(id),vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),pump_id INTEGER REFERENCES pumps(id),
customer_name TEXT NOT NULL,driver_name TEXT NOT NULL,mix_type_name TEXT NOT NULL,vehicle_name TEXT NOT NULL,pump_name TEXT NOT NULL DEFAULT '',
date TEXT NOT NULL,pour_location TEXT NOT NULL,requested INTEGER NOT NULL CHECK(requested>=0),truck_load INTEGER NOT NULL CHECK(truck_load>=0),previous INTEGER NOT NULL DEFAULT 0,cumulative INTEGER NOT NULL DEFAULT 0,
departure TEXT NOT NULL,arrival TEXT NOT NULL,finish TEXT NOT NULL,chemicals TEXT NOT NULL DEFAULT '',added_water TEXT NOT NULL DEFAULT '',receiver TEXT NOT NULL,
created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,printed_at TEXT,created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
CREATE INDEX invoice_group ON invoices(customer_id,date,created_at,id);
CREATE INDEX invoice_date ON invoices(date DESC,id DESC);
CREATE INDEX invoice_driver ON invoices(driver_id,date);
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
