import { fail } from "../validation/index.js";
export function encodeCursor(value) {
  return btoa(
    String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value))),
  )
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}
export function decodeCursor(value, kind) {
  if (!value) return null;
  try {
    const row = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(
          atob(value.replaceAll("-", "+").replaceAll("_", "/")),
          (c) => c.charCodeAt(0),
        ),
      ),
    );
    if (
      !row ||
      !Number.isSafeInteger(row.id) ||
      row.id <= 0 ||
      (kind === "invoice" && !/^\d{4}-\d{2}-\d{2}$/.test(row.date))
    )
      throw Error();
    return row;
  } catch {
    throw fail(400, "مؤشر الصفحة غير صحيح");
  }
}
// Only fixed identifiers and operators from source code are accepted by callers.
export function predicate(parts, args, sql, value) {
  if (value !== undefined && value !== "") {
    parts.push(sql);
    args.push(value);
  }
}
