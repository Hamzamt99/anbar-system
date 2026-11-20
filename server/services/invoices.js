import { addDepartureOffset } from "../../shared/time.js";
import { fail } from "../validation/index.js";
const refs = [
  ["customer", "customers"],
  ["driver", "drivers"],
  ["mix_type", "mix_types"],
  ["vehicle", "vehicles"],
  ["pump", "pumps"],
];
export async function snapshots(db, v, old) {
  const names = {};
  for (const [key, table] of refs) {
    const value = v[`${key}_id`];
    if (old && value === old[`${key}_id`]) {
      names[`${key}_name`] = old[`${key}_name`];
      continue;
    }
    if (value == null && key === "pump") {
      names.pump_name = "";
      continue;
    }
    const row = await db
      .prepare(`SELECT name FROM ${table} WHERE id=? AND deleted_at IS NULL`)
      .bind(value)
      .first();
    if (!row)
      throw fail(400, "أحد السجلات المختارة غير موجود، يرجى إعادة الاختيار");
    names[`${key}_name`] = row.name;
  }
  return names;
}
export function serialize(row) {
  if (!row) return row;
  return {
    ...row,
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
  "customer_name",
  "driver_name",
  "mix_type_name",
  "vehicle_name",
  "pump_name",
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
