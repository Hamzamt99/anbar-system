import { z } from "zod";
export const roles = ["DATA_ENTRY", "ADMIN", "SUPER_ADMIN"];
export const fail = (status, message) =>
  Object.assign(new Error(message), { status });
export function parse(schema, value) {
  const r = schema.safeParse(value);
  if (!r.success)
    throw fail(
      400,
      /[\u0600-\u06ff]/.test(r.error.issues[0]?.message || "")
        ? r.error.issues[0].message
        : "يرجى التحقق من الحقول المطلوبة وصحة البيانات",
    );
  return r.data;
}
const text = z
  .string()
  .trim()
  .min(1, "يرجى تعبئة الحقول المطلوبة")
  .max(200, "النص طويل جداً");
export const password = z
  .string()
  .min(12, "كلمة المرور يجب أن تتكون من 12 حرفاً على الأقل")
  .max(128, "كلمة المرور طويلة جداً");
export const email = z
  .email("البريد الإلكتروني غير صحيح")
  .max(254)
  .transform((v) => v.toLowerCase());
export const login = z
  .object({ email, password: z.string().min(1).max(128) })
  .strict();
export const userInput = z
  .object({ email, password, role: z.enum(roles, { error: "الدور غير صحيح" }) })
  .strict();
export const userEdit = z.object({ email, role: z.enum(roles) }).strict();
export const nameInput = z.object({ name: text }).strict();
export const id = z
  .union([z.number(), z.string().regex(/^\d+$/)])
  .pipe(z.coerce.number().int().positive().max(2147483647));
export const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "التاريخ غير صحيح")
  .refine(
    (v) =>
      !isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v,
    "التاريخ غير صحيح",
  );
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "الوقت غير صحيح");
export const quantity = z
  .union([z.string(), z.number()])
  .transform(String)
  .refine(
    (v) => /^\d{1,6}(\.\d{1,3})?$/.test(v),
    "الكمية يجب أن تكون موجبة وبثلاث منازل عشرية كحد أقصى",
  )
  .transform((v) => {
    const [a, b = ""] = v.split(".");
    return Number(a) * 1000 + Number(b.padEnd(3, "0"));
  });
export const invoiceInput = z
  .object({
    customer_id: id,
    driver_id: id,
    mix_type_id: id,
    vehicle_id: id,
    pump_id: id,
    mixer_id: z.union([id, z.null()]).optional().default(null),
    date,
    pour_location: text,
    requested: quantity,
    truck_load: quantity,
    departure: time,
    arrival: z
      .union([time, z.literal("")])
      .optional()
      .default(""),
    factory_arrival: z
      .union([time, z.literal(""), z.null()])
      .optional()
      .transform((value) => value ?? ""),
    finish: z
      .union([time, z.literal("")])
      .optional()
      .default(""),
    chemicals: z.string().trim().max(200).default(""),
    added_water: z.string().trim().max(200).default(""),
    receiver: z.string().trim().max(200).optional().default(""),
  })
  .strict();
export const filters = z
  .object({
    customer_id: id.optional(),
    driver_id: id.optional(),
    from: date.optional(),
    to: date.optional(),
    page: z.coerce.number().int().min(1).max(100000).default(1),
  })
  .strict()
  .refine((v) => !v.from || !v.to || v.from <= v.to, "نطاق التاريخ غير صحيح");
