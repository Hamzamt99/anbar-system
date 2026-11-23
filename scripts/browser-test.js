import { spawn, spawnSync } from "node:child_process";
import { mkdir, writeFile, rm } from "node:fs/promises";
import assert from "node:assert/strict";
import { openNavigation, checkMobilePages } from "./mobile-checks.js";
import { verifyReceiptPrint } from "./receipt-print-checks.js";
import { chromium } from "@playwright/test";
import { hashPassword, token } from "../server/services/crypto.js";
const state = `tmp/browser-d1-${process.pid}`,
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
  await rm(state, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 200,
  });
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
    process.execPath,
    [
      "node_modules/wrangler/wrangler-dist/cli.js",
      "dev",
      "--port",
      "8788",
      "--persist-to",
      state,
    ],
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
  const creationRequests = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && new URL(r.url()).pathname === "/api/invoices")
      creationRequests.push(r);
  });
  const errors = [],
    policyErrors = [];
  page.on("console", (m) => {
    if (
      m.type() === "error" &&
      /Content Security Policy|Refused to|violates.*policy/i.test(m.text())
    )
      policyErrors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "/login");
  await page.getByRole("heading", { name: "شركة العنبر للخرسانة" }).waitFor();
  const htmlResponse = await page.request.get(base);
  assert.match(
    htmlResponse.headers()["content-security-policy"],
    /frame-ancestors 'none'/,
  );
  assert.equal(htmlResponse.headers()["cache-control"], "no-cache");
  const html = await htmlResponse.text();
  const asset = html.match(/src="(\/assets\/[^" ]+\.js)"/)[1];
  const assetResponse = await page.request.get(base + asset);
  assert.equal(
    assetResponse.headers()["cache-control"],
    "public, max-age=31536000, immutable",
  );
  const cacheEvidence = await page.evaluate(async (src) => {
    performance.clearResourceTimings();
    await (await fetch(src, { cache: "no-store" })).arrayBuffer();
    await (await fetch(src, { cache: "reload" })).arrayBuffer();
    await (await fetch(src)).arrayBuffer();
    return performance.getEntriesByName(src).map((x) => ({
      transfer_bytes: x.transferSize,
      duration_ms: x.duration,
    }));
  }, base + asset);
  assert.ok(cacheEvidence[0].transfer_bytes > 0);
  assert.equal(cacheEvidence.at(-1).transfer_bytes, 0);
  await writeFile(
    "tmp/optimization/static-cache.json",
    JSON.stringify(cacheEvidence, null, 2),
  );
  await page.screenshot({ path: out + "/01-login.png", fullPage: true });
  await page.getByLabel("البريد الإلكتروني").fill("qa@example.com");
  await page.getByLabel("كلمة المرور", { exact: true }).fill(password);
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await page.waitForURL("**/invoices/new");
  await page
    .getByRole("heading", { name: "البيانات الأساسية", exact: true })
    .waitFor();
  assert.equal(await page.getByRole("combobox").count(), 6);
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
    ["المكسر", "إضافة مكسر", "رقم المكسر", "MX-01"],
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
  assert.equal(
    await page.getByLabel("ساعة انتهاء تفريغ الحمولة").getAttribute("required"),
    null,
  );
  assert.equal(
    await page.getByLabel("اسم المستلم").getAttribute("required"),
    null,
  );
  assert.equal(
    await page
      .getByRole("combobox", { name: "رقم المضخة", exact: true })
      .getAttribute("aria-required"),
    "true",
  );
  await page.getByLabel("المواد الكيميائية").fill("ملدن");
  await page.screenshot({ path: out + "/03-create.png", fullPage: true });
  await page.locator("form").evaluate((form) => {
    const button = form.querySelector('button[value="preview"]');
    form.requestSubmit(button);
    form.requestSubmit(button);
  });
  await page.waitForURL(/\/invoices\/\d+\/preview$/);
  await page.locator(".receipt").waitFor();
  assert.equal(
    creationRequests.length,
    1,
    "Two immediate submit events must create only one request",
  );
  const invoiceId = page.url().match(/invoices\/(\d+)/)[1];
  const detail = await page.request.get(base + "/api/invoices/" + invoiceId);
  const savedInvoice = (await detail.json()).data;
  assert.equal(savedInvoice.printed_at, null);
  assert.equal(savedInvoice.departure, "16:01");
  assert.equal(savedInvoice.departure_input, "15:46");
  assert.equal(savedInvoice.finish, "");
  assert.equal(savedInvoice.receiver, "");
  await page.screenshot({ path: out + "/06-receipt.png", fullPage: true });
  await page.setViewportSize({ width: 832, height: 718 });
  await page.emulateMedia({ media: "print" });
  await page.screenshot({ path: out + "/07-print.png", fullPage: true });
  assert.equal(await page.locator("header").isVisible(), false);
  assert.equal(await page.locator(".receipt-controls").isVisible(), false);
  const height = await page
    .locator(".receipt")
    .evaluate((el) => el.getBoundingClientRect().height);
  assert.ok(
    height <= (180 / 25.4) * 96 + 1,
    "Receipt exceeds the 220 × 190 mm printable area: " + height,
  );
  await page.emulateMedia({ media: "screen" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("link", { name: "تعديل", exact: true }).click();
  await page.waitForURL("**/edit");
  assert.equal(
    await page.getByLabel("ساعة مغادرة المصنع").inputValue(),
    "15:46",
  );
  await page.getByLabel("حمولة السيارة").fill("13");
  await page.getByRole("button", { name: "حفظ الفاتورة", exact: true }).click();
  await page.waitForURL(base + "/invoices/" + invoiceId);
  const editedInvoice = await page.request.get(
    base + "/api/invoices/" + invoiceId,
  );
  assert.equal((await editedInvoice.json()).data.departure, "16:01");
  await page
    .locator(".receipt-controls")
    .getByRole("link", { name: "سجل العمليات", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "سجل العمليات", exact: true })
    .waitFor();
  const auditEdit = page.getByRole("row").filter({ hasText: "تعديل فاتورة" });
  await auditEdit.getByRole("button", { name: "عرض التفاصيل" }).click();
  await page
    .getByRole("dialog")
    .getByRole("cell", { name: "حمولة السيارة", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("dialog")
      .getByRole("cell", { name: "12", exact: true })
      .count(),
    1,
  );
  assert.equal(
    await page
      .getByRole("dialog")
      .getByRole("cell", { name: "13", exact: true })
      .count(),
    1,
  );
  await page.getByRole("dialog").getByRole("button", { name: "إغلاق" }).click();
  await page.screenshot({ path: out + "/09-audit-logs.png", fullPage: true });
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
  const protectedCreated = await page.request.post(base + "/api/users", {
    data: {
      email: "protected-super@example.com",
      password,
      role: "SUPER_ADMIN",
    },
  });
  assert.equal(protectedCreated.status(), 201);
  await page.reload();
  await page
    .getByRole("cell", { name: "protected-super@example.com", exact: true })
    .waitFor();
  for (const address of ["qa@example.com", "protected-super@example.com"]) {
    const row = page.getByRole("row").filter({ hasText: address });
    assert.equal(
      await row.getByRole("button", { name: "حذف", exact: true }).count(),
      0,
    );
    if (address === "protected-super@example.com") {
      assert.equal(await row.getByRole("button").count(), 0);
      continue;
    }
    await row.getByRole("button", { name: "تعديل", exact: true }).click();
    assert.equal(
      await page
        .getByRole("dialog")
        .getByLabel("الدور", { exact: true })
        .isDisabled(),
      true,
    );
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "إغلاق" })
      .click();
  }
  assert.equal(
    await page
      .getByRole("row")
      .filter({ hasText: "entry@example.com" })
      .getByRole("button", { name: "حذف", exact: true })
      .count(),
    1,
  );
  await checkMobilePages(page, { base, out, invoiceId });
  await page.setViewportSize({ width: 390, height: 844 });
  await openNavigation(page);
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
  await openNavigation(page);
  await page.getByRole("button", { name: "تسجيل الخروج", exact: true }).click();
  await page.waitForURL("**/login");
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.screenshot({
      path: `${out}/mobile-${width}-login.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
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
  await openNavigation(page);
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
  await page.goto(base + "/audit-logs");
  await page.waitForURL("**/invoices");
  await verifyReceiptPrint(browser, { base, password, out });
  assert.deepEqual(errors, []);
  assert.deepEqual(policyErrors, []);
  console.log(
    "Browser checks passed: login, all six master tabs, invoice creation, read-only preview, receipt, filters, users, role route protection, logout, mobile, print layout ADMIN print locking and invoice audit history. Screenshots: " +
      out,
  );
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (worker?.pid) {
    try {
      const ended = new Promise((resolve) => worker.once("exit", resolve));
      worker.kill("SIGTERM");
      let timer;
      await Promise.race([
        ended,
        new Promise((resolve) => {
          timer = setTimeout(() => {
            try {
              process.kill(-worker.pid, "SIGKILL");
            } catch {}
            resolve();
          }, 5000);
        }),
      ]);
      clearTimeout(timer);
    } catch {}
  }
  await rm(sql, { force: true });
  await rm(state, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 200,
  });
}
