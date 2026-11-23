import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";

// Run only against the browser runner's disposable local Worker/D1, never production.
export async function checkActionResponsiveness(browser, { base, password }) {
  assert.equal(base, "http://localhost:8788");
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const actions = [],
    requests = [],
    errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("requestfinished", (request) => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith("/api/")) return;
    const timing = request.timing();
    if (timing.responseEnd < 0) return;
    requests.push({
      method: request.method(),
      endpoint: url.pathname.replace(/\/\d+(?=\/|$)/g, "/:id"),
      duration_ms: +timing.responseEnd.toFixed(1),
    });
  });
  async function measure(action, run) {
    const start = performance.now();
    await run();
    actions.push({
      action,
      elapsed_ms: +(performance.now() - start).toFixed(1),
    });
  }
  const button = (name) => page.getByRole("button", { name, exact: true });
  const cell = (name) => page.getByRole("cell", { name, exact: true });
  const dialog = () => page.getByRole("dialog");
  const rowFor = (name) => page.getByRole("row").filter({ has: cell(name) });
  const masters = [
    ["customers", "العملاء", "اسم العميل", "عميل", "Perf customer"],
    ["drivers", "السائقون", "اسم السائق", "سائق", "Perf driver"],
    ["mix-types", "أنواع الخلطات", "نوع الخلطة", "خلطة", "Perf mix"],
    ["vehicles", "السيارات", "رقم السيارة", "سيارة", "Perf truck"],
    ["pumps", "المضخات", "رقم المضخة", "مضخة", "Perf pump"],
    ["mixers", "المكسر", "رقم المكسر", "مكسر", "Perf mixer"],
  ];
  try {
    await page.goto(base + "/login");
    await page.getByLabel("البريد الإلكتروني").fill("qa@example.com");
    await page.getByLabel("كلمة المرور", { exact: true }).fill(password);
    await measure("login_to_ready_form", async () => {
      await button("تسجيل الدخول").click();
      await page.getByLabel("مكان الصب").waitFor();
    });
    await measure("navigate_master", async () => {
      await page
        .getByRole("link", { name: "البيانات الأساسية", exact: true })
        .click();
      await page.locator(".empty").waitFor({ state: "hidden" });
    });
    for (const [path, tab, label, singular, name] of masters) {
      await measure(path + ":tab", async () => {
        await button(tab).click();
        await page.locator(".empty").waitFor({ state: "hidden" });
      });
      await measure(path + ":open_add_modal", async () => {
        await page.getByRole("button", { name: "إضافة " + singular }).click();
        assert.ok(
          await dialog()
            .getByLabel(label)
            .evaluate((el) => el === document.activeElement),
        );
      });
      await dialog().getByLabel(label).fill(name);
      await measure(path + ":create", async () => {
        await dialog()
          .getByRole("button", { name: "حفظ", exact: true })
          .click();
        await cell(name).waitFor();
      });
      await rowFor(name)
        .getByRole("button", { name: "تعديل", exact: true })
        .click();
      await dialog()
        .getByLabel(label)
        .fill(name + " edited");
      await measure(path + ":edit", async () => {
        await dialog()
          .getByRole("button", { name: "حفظ", exact: true })
          .click();
        await cell(name + " edited").waitFor();
      });
      await measure(path + ":search", async () => {
        const loaded = page.waitForResponse(
          (r) => new URL(r.url()).searchParams.get("search") === name,
        );
        await page
          .getByRole("textbox", { name: "بحث", exact: true })
          .fill(name);
        await loaded;
        await cell(name + " edited").waitFor();
      });
    }
    await measure("navigate_users", async () => {
      await page.getByRole("link", { name: "المستخدمون", exact: true }).click();
      await cell("qa@example.com").waitFor();
    });
    await page
      .getByLabel("البريد الإلكتروني")
      .fill("performance-user@example.invalid");
    await page.getByLabel("كلمة المرور المؤقتة").fill(password);
    await measure("user_create", async () => {
      await button("إضافة مستخدم").click();
      await cell("performance-user@example.invalid").waitFor();
    });
    await rowFor("performance-user@example.invalid")
      .getByRole("button", { name: "تعديل", exact: true })
      .click();
    await dialog()
      .getByLabel("البريد الإلكتروني")
      .fill("performance-edited@example.invalid");
    await measure("user_edit", async () => {
      await dialog().getByRole("button", { name: "حفظ", exact: true }).click();
      await cell("performance-edited@example.invalid").waitFor();
    });
    await rowFor("performance-edited@example.invalid")
      .getByRole("button", { name: "إعادة تعيين كلمة المرور", exact: true })
      .click();
    await dialog()
      .getByLabel("كلمة المرور المؤقتة")
      .fill(password + "reset");
    await measure("user_password_reset", async () => {
      await dialog().getByRole("button", { name: "حفظ", exact: true }).click();
      await dialog().waitFor({ state: "hidden" });
    });
    await rowFor("performance-edited@example.invalid")
      .getByRole("button", { name: "حذف", exact: true })
      .click();
    await measure("user_delete", async () => {
      await dialog().getByRole("button", { name: "حذف", exact: true }).click();
      await dialog().waitFor({ state: "hidden" });
      await cell("performance-edited@example.invalid").waitFor({
        state: "hidden",
      });
    });
    await measure("navigate_invoice_create", async () => {
      await page
        .getByRole("link", { name: "إنشاء فاتورة", exact: true })
        .click();
      await page.getByLabel("مكان الصب").waitFor();
    });
    for (const [, , label, , name] of masters) {
      await page.getByRole("combobox", { name: label, exact: true }).fill(name);
      await page
        .getByRole("option", { name: name + " edited", exact: true })
        .click();
    }
    await measure("daily_quantity_refresh", async () => {
      const loaded = page.waitForResponse(
        (r) =>
          new URL(r.url()).pathname === "/api/invoices/quantity" &&
          new URL(r.url()).searchParams.get("date") === "2026-11-20",
      );
      await page.getByLabel("التاريخ", { exact: true }).fill("2026-11-20");
      await loaded;
      assert.equal(await page.getByLabel("الواصل سابقاً").inputValue(), "0");
    });
    await page.getByLabel("مكان الصب").fill("موقع اختبار الأداء");
    await page.getByLabel("الكمية المطلوبة").fill("100");
    await page.getByLabel("حمولة السيارة").fill("2");
    await page.getByLabel("ساعة مغادرة المصنع").fill("10:00");
    await measure("invoice_save_to_receipt", async () => {
      await button("حفظ الفاتورة").click();
      await page.locator(".receipt").waitFor();
    });
    const invoiceId = page.url().match(/invoices\/(\d+)/)[1];
    await measure("invoice_open_edit", async () => {
      await page.getByRole("link", { name: "تعديل", exact: true }).click();
      await page.getByLabel("حمولة السيارة").waitFor();
    });
    await page.getByLabel("حمولة السيارة").fill("3");
    await measure("invoice_edit_save", async () => {
      await button("حفظ الفاتورة").click();
      await page.locator(".receipt").waitFor();
    });
    await measure("invoice_preview", async () => {
      await page
        .getByRole("link", { name: "معاينة الطباعة", exact: true })
        .click();
      await page.locator(".receipt").waitFor();
    });
    await page.evaluate(() => {
      window.print = () => {
        window.__printed = true;
      };
    });
    await measure("receipt_print_ready", async () => {
      await button("طباعة").click();
      await page.waitForFunction(() => window.__printed === true);
    });
    await measure("invoice_audit_navigation", async () => {
      await page
        .locator(".receipt-controls")
        .getByRole("link", { name: "سجل العمليات", exact: true })
        .click();
      await page
        .getByRole("cell", { name: "طباعة فاتورة", exact: true })
        .first()
        .waitFor();
    });
    await measure("audit_details_modal", async () => {
      await button("عرض التفاصيل").first().click();
      await dialog().waitFor();
    });
    await dialog().getByRole("button", { name: "إغلاق" }).click();
    await measure("audit_filter", async () => {
      await page.getByLabel("الإجراء", { exact: true }).selectOption("CREATE");
      const loaded = page.waitForResponse(
        (r) =>
          new URL(r.url()).pathname === "/api/audit-logs" &&
          new URL(r.url()).searchParams.get("action") === "CREATE",
      );
      await button("بحث").click();
      await loaded;
      await cell("إنشاء فاتورة").waitFor();
    });
    await measure("navigate_invoice_list", async () => {
      await page.getByRole("link", { name: "الفواتير", exact: true }).click();
      await cell("Perf customer edited").waitFor();
    });
    await page
      .getByRole("combobox", { name: "اسم الشركة", exact: true })
      .fill("Perf customer");
    await page
      .getByRole("option", { name: "Perf customer edited", exact: true })
      .click();
    await measure("invoice_customer_filter", async () => {
      const loaded = page.waitForResponse(
        (r) =>
          new URL(r.url()).pathname === "/api/invoices" &&
          new URL(r.url()).searchParams.has("customer_id"),
      );
      await button("بحث ⌕").click();
      await loaded;
      await cell("Perf customer edited").waitFor();
    });
    await measure("invoice_detail", async () => {
      await page.getByRole("link", { name: "عرض", exact: true }).click();
      await page.locator(".receipt").waitFor();
    });
    const saved = (
      await (await page.request.get(base + "/api/invoices/" + invoiceId)).json()
    ).data;
    assert.equal(saved.truck_load, 3);
    assert.equal(saved.cumulative, 3);
    assert.equal(saved.departure, "10:15");
    assert.ok(saved.printed_at);
    // Exercise actual cursor navigation with enough isolated invoices to span pages.
    for (let i = 0; i < 21; i++) {
      const created = await page.request.post(base + "/api/invoices", {
        headers: { "Idempotency-Key": crypto.randomUUID() },
        data: {
          ...Object.fromEntries(
            [
              "customer_id",
              "driver_id",
              "mix_type_id",
              "vehicle_id",
              "pump_id",
              "mixer_id",
            ].map((key) => [key, saved[key]]),
          ),
          date: "2026-11-20",
          pour_location: "Pagination fixture",
          requested: "100",
          truck_load: "1",
          departure: "10:00",
        },
      });
      assert.equal(created.status(), 201);
    }
    await page
      .getByRole("link", { name: "الفواتير", exact: true })
      .last()
      .click();
    await page
      .getByRole("combobox", { name: "اسم الشركة", exact: true })
      .fill("Perf customer");
    await page
      .getByRole("option", { name: "Perf customer edited", exact: true })
      .click();
    const filtered = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === "/api/invoices" &&
        new URL(r.url()).searchParams.has("customer_id"),
    );
    await button("بحث ⌕").click();
    await filtered;
    await button("التالي").waitFor();
    for (const [endpoint, navigation] of [
      ["invoices", null],
      ["audit-logs", "سجل العمليات"],
    ]) {
      if (navigation) {
        await page.getByRole("link", { name: navigation, exact: true }).click();
        await page.locator(".empty").waitFor({ state: "hidden" });
      }
      for (const [direction, label, targetPage] of [
        ["next", "التالي", "2"],
        ["previous", "السابق", "1"],
      ]) {
        await measure(endpoint + ":" + direction, async () => {
          const loaded = page.waitForResponse(
            (r) =>
              new URL(r.url()).pathname === "/api/" + endpoint &&
              new URL(r.url()).searchParams.get("page") === targetPage,
          );
          await button(label).click();
          const response = await loaded;
          const query = new URL(response.url()).searchParams;
          if (direction === "next") {
            assert.equal(query.get("count"), "0");
            assert.ok(query.get("cursor"));
          }
          await page.locator(".empty").waitFor({ state: "hidden" });
          assert.ok((await page.locator("tbody tr").count()) <= 20);
        });
      }
    }
    await page
      .getByRole("link", { name: "البيانات الأساسية", exact: true })
      .click();
    for (const [path, tab, , , name] of masters) {
      await button(tab).click();
      await cell(name + " edited").waitFor();
      await rowFor(name + " edited")
        .getByRole("button", { name: "حذف", exact: true })
        .click();
      await measure(path + ":delete", async () => {
        await dialog()
          .getByRole("button", { name: "حذف", exact: true })
          .click();
        await dialog().waitFor({ state: "hidden" });
        await cell(name + " edited").waitFor({ state: "hidden" });
      });
    }
    await measure("logout", async () => {
      await button("تسجيل الخروج").click();
      await page.waitForURL("**/login");
    });
    assert.deepEqual(errors, []);
    await writeFile(
      "tmp/action-responsiveness.json",
      JSON.stringify(
        {
          environment:
            "Synthetic disposable local Worker/D1, Chromium desktop. Action timings include browser automation; not hosted network SLAs. Password hashing remains intentionally expensive. No production data or credentials.",
          actions,
          requests,
        },
        null,
        2,
      ) + "\n",
    );
    console.log(
      `Action checks passed: ${actions.length} measured UI actions, ${requests.length} completed API requests; saved tmp/action-responsiveness.json.`,
    );
  } finally {
    await context.close();
  }
}
