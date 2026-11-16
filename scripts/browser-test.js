import { spawn, spawnSync } from "node:child_process";
import { mkdir, writeFile, rm } from "node:fs/promises";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { hashPassword, token } from "../server/services/crypto.js";
const state = "tmp/browser-d1",
  sql = "tmp/browser-seed.sql",
  out = "tmp/screenshots",
  base = "http://localhost:8788";
let worker, browser;
const password = token();
function command(args) {
  const r = spawnSync("npx", ["wrangler", ...args], { encoding: "utf8" });
  if (r.status) throw new Error(r.stderr || r.stdout);
}
try {
  await mkdir(out, { recursive: true });
  await rm(state, { recursive: true, force: true });
  command([
    "d1",
    "migrations",
    "apply",
    "anbar-db",
    "--local",
    "--persist-to",
    state,
  ]);
  const hash = await hashPassword(password);
  await writeFile(
    sql,
    `INSERT INTO users(email,password_hash,role) VALUES ('qa@example.com','${hash}','SUPER_ADMIN');`,
    { mode: 0o600 },
  );
  command([
    "d1",
    "execute",
    "anbar-db",
    "--local",
    "--persist-to",
    state,
    "--file",
    sql,
  ]);
  await rm(sql);
  worker = spawn(
    "npx",
    ["wrangler", "dev", "--port", "8788", "--persist-to", state],
    { stdio: ["ignore", "pipe", "pipe"], detached: true },
  );
  let log = "";
  worker.stdout.on("data", (b) => {
    log += b;
  });
  worker.stderr.on("data", (b) => {
    log += b;
  });
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base)).ok) break;
    } catch {}
    if (worker.exitCode !== null) throw new Error(log);
    await new Promise((r) => setTimeout(r, 200));
    if (i === 99) throw new Error("Worker failed to start: " + log);
  }
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "/login");
  await page.getByRole("heading", { name: "شركة العنبر للخرسانة" }).waitFor();
  await page.screenshot({ path: out + "/01-login.png", fullPage: true });
  await page.getByLabel("البريد الإلكتروني").fill("qa@example.com");
  await page.getByLabel("كلمة المرور", { exact: true }).fill(password);
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await page.waitForURL("**/invoices/new");
  await page
    .getByRole("heading", { name: "البيانات الأساسية", exact: true })
    .waitFor();
  assert.equal(await page.getByRole("combobox").count(), 5);
  assert.equal(
    await page.getByLabel("الواصل سابقاً").getAttribute("readonly"),
    "",
  );
  assert.equal(
    await page.getByLabel("المواد الكيميائية").getAttribute("role"),
    null,
  );
  const fixtures = [
    ["العملاء", "إضافة عميل", "اسم العميل", "شركة البناء الحديث"],
    ["السائقون", "إضافة سائق", "اسم السائق", "أحمد محمد"],
    ["أنواع الخلطات", "إضافة خلطة", "نوع الخلطة", "C-250N"],
    ["السيارات", "إضافة سيارة", "رقم السيارة", "104"],
    ["المضخات", "إضافة مضخة", "رقم المضخة", "12"],
  ];
  await page
    .getByRole("link", { name: "البيانات الأساسية", exact: true })
    .click();
  for (const [tab, add, label, value] of fixtures) {
    await page.getByRole("button", { name: tab, exact: true }).click();
    await page.getByRole("button", { name: add }).click();
    await page.getByRole("dialog").getByLabel(label).fill(value);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "حفظ", exact: true })
      .click();
    await page.getByRole("cell", { name: value, exact: true }).waitFor();
  }
  await page.getByRole("button", { name: "العملاء", exact: true }).click();
  await page
    .getByRole("cell", { name: "شركة البناء الحديث", exact: true })
    .waitFor();
  await page.screenshot({ path: out + "/02-master.png", fullPage: true });
  await page.getByRole("link", { name: "إنشاء فاتورة", exact: true }).click();
  for (const [, , label, value] of fixtures) {
    await page.getByRole("combobox", { name: new RegExp(label) }).fill(value);
    await page.getByRole("option", { name: value, exact: true }).click();
  }
  await page.getByLabel("مكان الصب").fill("البنيات");
  await page.getByLabel("الكمية المطلوبة").fill("30");
  await page.getByLabel("حمولة السيارة").fill("12");
  await page.getByLabel("ساعة مغادرة المصنع").fill("15:46");
  await page.getByLabel("ساعة الوصول إلى موقع الصب").fill("16:10");
  await page.getByLabel("ساعة انتهاء تفريغ الحمولة").fill("16:30");
  await page.getByLabel("اسم المستلم").fill("محمد أحمد");
  await page.getByLabel("المواد الكيميائية").fill("ملدن");
  await page.screenshot({ path: out + "/03-create.png", fullPage: true });
  await page
    .getByRole("button", { name: "معاينة الطباعة", exact: true })
    .click();
  await page.waitForURL(/\/invoices\/\d+\/preview$/);
  await page.locator(".receipt").waitFor();
  const invoiceId = page.url().match(/invoices\/(\d+)/)[1];
  const detail = await page.request.get(base + "/api/invoices/" + invoiceId);
  assert.equal((await detail.json()).data.printed_at, null);
  await page.screenshot({ path: out + "/06-receipt.png", fullPage: true });
  await page.setViewportSize({ width: 794, height: 1123 });
  await page.emulateMedia({ media: "print" });
  await page.screenshot({ path: out + "/07-print.png", fullPage: true });
  assert.equal(await page.locator("header").isVisible(), false);
  assert.equal(await page.locator(".receipt-controls").isVisible(), false);
  const height = await page
    .locator(".receipt")
    .evaluate((el) => el.getBoundingClientRect().height);
  assert.ok(height <= 1123, "Receipt exceeds one A4 page: " + height);
  await page.emulateMedia({ media: "screen" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole("link", { name: "الفواتير", exact: true })
    .last()
    .click();
  await page
    .getByRole("cell", { name: "شركة البناء الحديث", exact: true })
    .waitFor();
  await page.screenshot({ path: out + "/04-invoices.png", fullPage: true });
  await page.getByRole("button", { name: "بحث", exact: false }).click();
  await page
    .getByRole("cell", { name: "شركة البناء الحديث", exact: true })
    .waitFor();
  await page.getByRole("link", { name: "المستخدمون", exact: true }).click();
  await page.getByRole("cell", { name: "qa@example.com" }).waitFor();
  await page.screenshot({ path: out + "/05-users.png", fullPage: true });
  await page.getByLabel("البريد الإلكتروني").fill("entry@example.com");
  await page.getByLabel("كلمة المرور المؤقتة").fill(password);
  await page.getByRole("button", { name: "إضافة مستخدم", exact: true }).click();
  await page.getByRole("cell", { name: "entry@example.com" }).waitFor();
  const adminCreated = await page.request.post(base + "/api/users", {
    data: { email: "manager@example.com", password, role: "ADMIN" },
  });
  assert.equal(adminCreated.status(), 201);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("link", { name: "إنشاء فاتورة", exact: true }).click();
  await page.getByLabel("مكان الصب").waitFor();
  await page.screenshot({ path: out + "/08-mobile.png", fullPage: true });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
    "Mobile page overflows horizontally",
  );
  await page.getByRole("button", { name: "تسجيل الخروج", exact: true }).click();
  await page.waitForURL("**/login");
  await page.getByLabel("البريد الإلكتروني").fill("entry@example.com");
  await page.getByLabel("كلمة المرور", { exact: true }).fill(password);
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await page.waitForURL("**/invoices/new");
  assert.equal(
    await page.getByRole("link", { name: "المستخدمون", exact: true }).count(),
    0,
  );
  await page.goto(base + "/users");
  await page.waitForURL("**/invoices");
  await page.getByRole("button", { name: "تسجيل الخروج", exact: true }).click();
  await page.waitForURL("**/login");
  await page.getByLabel("البريد الإلكتروني").fill("manager@example.com");
  await page.getByLabel("كلمة المرور", { exact: true }).fill(password);
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await page.waitForURL("**/invoices/new");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("link", { name: "الفواتير", exact: true }).click();
  await page
    .getByRole("cell", { name: "شركة البناء الحديث", exact: true })
    .waitFor();
  assert.equal(
    await page.getByRole("button", { name: "تعديل", exact: true }).isEnabled(),
    true,
  );
  await page.evaluate(() => {
    window.print = () => {};
  });
  await page.getByRole("button", { name: "طباعة", exact: true }).click();
  await page.waitForURL(/preview\?print=1$/);
  const printedRecord = await page.request.get(
    base + "/api/invoices/" + invoiceId,
  );
  assert.ok((await printedRecord.json()).data.printed_at);
  await page
    .getByRole("link", { name: "الفواتير", exact: true })
    .last()
    .click();
  await page
    .getByRole("cell", { name: "شركة البناء الحديث", exact: true })
    .waitFor();
  assert.equal(
    await page.getByRole("button", { name: /تعديل/ }).isDisabled(),
    true,
  );
  await page.goto(base + "/invoices/" + invoiceId + "/edit");
  await page
    .getByRole("alert")
    .filter({ hasText: "لا يمكن تعديل الفاتورة بعد طباعتها" })
    .waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "Browser checks passed: login, all five master tabs, invoice creation, read-only preview, receipt, filters, users, role route protection, logout, mobile, print layout and ADMIN print locking. Screenshots: " +
      out,
  );
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (worker?.pid) {
    try {
      worker.kill("SIGTERM");
    } catch {}
  }
  await rm(sql, { force: true });
  await rm(state, { recursive: true, force: true });
}
