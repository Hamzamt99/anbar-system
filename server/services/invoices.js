import { addDepartureOffset } from "../../shared/time.js";
import { fail } from "../validation/index.js";
const refs = [
  ["customer", "customers"],
  ["driver", "drivers"],
  ["mix_type", "mix_types"],
  ["vehicle", "vehicles"],
  ["pump", "pumps"],
  ["mixer", "mixers"],
];
export async function snapshots(db, v, old) {
  const names = {},
    lookups = [];
  for (const [key, table] of refs) {
    const value = v[`${key}_id`];
    if (old && value === old[`${key}_id`]) {
      names[`${key}_name`] = old[`${key}_name`];
      continue;
    }
    if (value == null && (key === "pump" || key === "mixer")) {
      names[`${key}_name`] = "";
      continue;
    }
    lookups.push({
      key,
      statement: db
        .prepare(`SELECT name FROM ${table} WHERE id=? AND deleted_at IS NULL`)
        .bind(value),
    });
  }
  // One D1 round trip for all changed references; unchanged snapshots stay intact.
  if (lookups.length) {
    const results = await db.batch(lookups.map(({ statement }) => statement));
    for (const [index, { key }] of lookups.entries()) {
      const row = results[index].results[0];
      if (!row)
        throw fail(400, "أحد السجلات المختارة غير موجود، يرجى إعادة الاختيار");
      names[`${key}_name`] = row.name;
    }
  }
  return names;
}
export function serialize(row) {
  if (!row) return row;
  return {
    ...Object.fromEntries(
      Object.entries(row).filter(
        ([key]) =>
          !["idempotency_key", "request_hash", "creation_response"].includes(
            key,
          ),
      ),
    ),
    requested: row.requested / 1000,
    truck_load: row.truck_load / 1000,
    previous: row.previous / 1000,
    cumulative: row.cumulative / 1000,
    number: `INV-${String(row.id).padStart(6, "0")}`,
  };
}
export const invoiceColumns = [
  "customer_id",
  "driver_id",
  "mix_type_id",
  "vehicle_id",
  "pump_id",
  "mixer_id",
  "customer_name",
  "driver_name",
  "mix_type_name",
  "vehicle_name",
  "pump_name",
  "mixer_name",
  "date",
  "pour_location",
  "requested",
  "truck_load",
  "departure",
  "departure_input",
  "arrival",
  "factory_arrival",
  "finish",
  "chemicals",
  "added_water",
  "receiver",
];

export function departureValues(value, old) {
  if (old && old.departure_input == null && value === old.departure) {
    return { departure: old.departure, departure_input: null };
  }
  return { departure: addDepartureOffset(value), departure_input: value };
}
