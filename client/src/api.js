import { notifyDataChange } from "./data-events";
import { notifyMasterChange } from "./master-events";
export async function api(path, options = {}) {
  const response = await fetch("/api" + path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  let result;
  try {
    result = await response.json();
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new Error("تعذر الاتصال بالخادم");
  }
  if (!response.ok) {
    if (
      response.status === 401 &&
      !path.includes("/auth/") &&
      location.pathname !== "/login"
    )
      location.assign("/login");
    throw new Error(result.error || "تعذر إتمام العملية");
  }
  if (["POST", "PUT", "DELETE"].includes(options.method)) {
    notifyMasterChange(path);
    notifyDataChange(path);
  }
  return result;
}
export const roles = {
  DATA_ENTRY: "مدخل بيانات",
  ADMIN: "مدير النظام",
  SUPER_ADMIN: "مدير النظام العام",
};
export const masterTypes = [
  ["customers", "العملاء", "اسم العميل", "عميل"],
  ["drivers", "السائقون", "اسم السائق", "سائق"],
  ["mix-types", "أنواع الخلطات", "نوع الخلطة", "خلطة"],
  ["vehicles", "السيارات", "رقم السيارة", "سيارة"],
  ["pumps", "المضخات", "رقم المضخة", "مضخة"],
  ["mixers", "المكسر", "رقم المكسر", "مكسر"],
];
export const amount = (v) =>
  Number(v || 0).toLocaleString("en-US", {
    maximumFractionDigits: 3,
    useGrouping: false,
  });
