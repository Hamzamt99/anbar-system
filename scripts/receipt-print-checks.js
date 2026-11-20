import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

export async function verifyReceiptPrint(browser, { base, password, out }) {
  const output = "output/pdf";
  await mkdir(output, { recursive: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const login = await context.request.post(base + "/api/auth/login", {
    data: { email: "qa@example.com", password },
  });
  assert.equal(login.status(), 200);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  async function request(path, method = "GET", data) {
    const response = await context.request.fetch(base + "/api" + path, {
      method,
      data,
    });
    const result = await response.json();
    assert.ok(response.ok(), JSON.stringify(result));
    return result;
  }
  const [drivers, mixes, vehicles, pumps] = await Promise.all(
    ["/drivers", "/mix-types", "/vehicles", "/pumps"].map((path) =>
      request(path),
    ),
  );
  const names = {
    normal: "شركة الاختبار للخرسانة والمقاولات",
    long: "شركة العنبر وشركاؤها للمقاولات العامة والتطوير العمراني وتنفيذ مشاريع الأبنية السكنية والتجارية والبنية التحتية والخدمات الهندسية في المملكة الأردنية الهاشمية وخدمات إدارة المشاريع والإشراف الهندسي",
  };
  const locations = {
    normal: "عمّان - البنيات - مشروع المبنى السكني",
    long: "عمّان - منطقة البنيات - مشروع المجمع السكني والتجاري الجديد، القطعة رقم 125 بجانب المدخل الشرقي ومقابل المستودعات الرئيسية، صب سقف الطابق الثالث في المبنى رقم 12 بعد التنسيق مع مهندس الموقع - بوابة 2",
  };
  assert.ok(names.long.length > 140 && names.long.length <= 200);
  assert.ok(locations.long.length > 160 && locations.long.length <= 200);
  const measurements = [];
  let normalId, normalBody;
  for (const kind of ["normal", "long"]) {
    const customer = (
      await request("/customers", "POST", { name: names[kind] })
    ).data;
    const body = {
      customer_id: customer.id,
      driver_id: drivers.data[0].id,
      mix_type_id: mixes.data[0].id,
      vehicle_id: vehicles.data[0].id,
      pump_id: pumps.data[0].id,
      date: "2026-11-20",
      pour_location: locations[kind],
      requested: "125.5",
      truck_load: "12.75",
      departure: "15:46",
      arrival: "16:15",
      factory_arrival: "17:20",
      finish: "16:45",
      chemicals: "ملدن فائق للخرسانة حسب مواصفات الخلطة المعتمدة",
      added_water: "20 لتر حسب طلب العميل",
      receiver: "محمود عبد الله الحسن",
    };
    const invoice = (await request("/invoices", "POST", body)).data;
    assert.equal(invoice.factory_arrival, "17:20");
    assert.equal(invoice.previous, 0);
    assert.equal(invoice.cumulative, 12.75);
    await page.goto(base + "/invoices/" + invoice.id + "/edit");
    await page.getByLabel("ساعة الوصول إلى المصنع", { exact: true }).waitFor();
    assert.equal(
      await page
        .getByLabel("ساعة الوصول إلى المصنع", { exact: true })
        .inputValue(),
      "17:20",
    );
    await page
      .getByLabel("ساعة الوصول إلى المصنع", { exact: true })
      .fill("17:35");
    await page
      .getByRole("button", { name: "حفظ الفاتورة", exact: true })
      .click();
    await page.waitForURL(base + "/invoices/" + invoice.id);
    const saved = (await request("/invoices/" + invoice.id)).data;
    assert.equal(saved.factory_arrival, "17:35");
    await page.locator(".receipt-logo img").evaluate((image) => image.decode());
    await page.evaluate(() => document.fonts.ready);
    await page.emulateMedia({ media: "print" });
    assert.equal(await page.locator("header").isVisible(), false);
    assert.equal(await page.locator(".receipt-controls").isVisible(), false);
    assert.equal(
      await page.getByRole("button", { name: "طباعة", exact: true }).count(),
      0,
    );
    const geometry = await page.locator(".receipt").evaluate((receipt) => {
      const bounds = receipt.getBoundingClientRect();
      const logo = receipt
        .querySelector(".receipt-logo")
        .getBoundingClientRect();
      const heading = receipt.querySelector("h1").getBoundingClientRect();
      const content = Array.from(
        receipt.querySelectorAll(".receipt-line,td,.words,.signatures strong"),
      ).map((element) => ({
        text: element.textContent,
        width: element.clientWidth,
        scroll: element.scrollWidth,
        top: element.getBoundingClientRect().top,
        bottom: element.getBoundingClientRect().bottom,
      }));
      return {
        height: bounds.height,
        width: bounds.width,
        logoLeft: logo.left - bounds.left,
        logoTop: logo.top - bounds.top,
        titleCenter:
          (heading.left + heading.right) / 2 - (bounds.left + bounds.right) / 2,
        overflow: content.filter((x) => x.scroll > x.width + 1),
        clipped: content.filter(
          (x) => x.top < bounds.top - 1 || x.bottom > bounds.bottom + 1,
        ),
      };
    });
    assert.ok(
      geometry.height <= (180 / 25.4) * 96 + 1,
      `${kind}: receipt is taller than printable area: ` +
        JSON.stringify(geometry),
    );
    assert.ok(
      geometry.logoLeft < 12 && geometry.logoTop < 12,
      "Logo must be upper-left",
    );
    assert.ok(Math.abs(geometry.titleCenter) < 1, "Title must be centered");
    assert.deepEqual(geometry.overflow, [], `${kind}: text overflow`);
    assert.deepEqual(geometry.clipped, [], `${kind}: clipped content`);
    const file = `${output}/anbar-receipt-${kind}-220x190.pdf`;
    await page.pdf({
      path: file,
      preferCSSPageSize: true,
      scale: 1,
      printBackground: true,
      displayHeaderFooter: false,
    });
    await page.screenshot({
      path: `${out}/receipt-custom-${kind}.png`,
      fullPage: true,
    });
    measurements.push({
      kind,
      file,
      geometry,
      customerLength: names[kind].length,
      locationLength: locations[kind].length,
      factoryArrival: saved.factory_arrival,
    });
    const totalsBefore = (await request("/invoices?customer_id=" + customer.id))
      .total;
    await request("/invoices/" + invoice.id + "/print", "POST", {});
    await request("/invoices/" + invoice.id + "/print", "POST", {});
    const after = (await request("/invoices/" + invoice.id)).data;
    assert.equal(
      (await request("/invoices?customer_id=" + customer.id)).total,
      totalsBefore,
    );
    for (const key of ["previous", "truck_load", "cumulative"])
      assert.equal(after[key], saved[key]);
    if (kind === "normal") {
      normalId = invoice.id;
      normalBody = body;
    }
    await page.emulateMedia({ media: "screen" });
  }
  // Test the printable fallback without altering any production assets or records.
  const fallback = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await fallback.request.post(base + "/api/auth/login", {
    data: { email: "qa@example.com", password },
  });
  await fallback.route(/anbar-logo.*\.png$/, (route) => route.abort());
  const fallbackPage = await fallback.newPage();
  await fallbackPage.goto(base + "/invoices/" + normalId);
  await fallbackPage.locator(".receipt-logo-fallback").waitFor();
  await fallbackPage.evaluate(() => {
    window.__printed = false;
    window.print = () => {
      window.__printed = true;
    };
  });
  await fallbackPage
    .getByRole("button", { name: "طباعة", exact: true })
    .click();
  await fallbackPage.waitForFunction(() => window.__printed === true);
  await fallbackPage.emulateMedia({ media: "print" });
  await fallbackPage.screenshot({
    path: `${out}/receipt-custom-logo-fallback.png`,
    fullPage: true,
  });
  const admin = await browser.newContext();
  await admin.request.post(base + "/api/auth/login", {
    data: { email: "manager@example.com", password },
  });
  const forbidden = await admin.request.put(
    base + "/api/invoices/" + normalId,
    { data: normalBody },
  );
  assert.equal(
    forbidden.status(),
    403,
    "Printed invoice must remain locked for ADMIN",
  );
  await admin.close();
  await fallback.close();
  assert.deepEqual(errors, []);
  await writeFile(
    "tmp/receipt-print-verification.json",
    JSON.stringify(measurements, null, 2),
  );
  await context.close();
  console.log(
    "Custom receipt checks passed: all fields, factory arrival edit/save, long Arabic values, image fallback, stable reprint totals, and printed-invoice permissions.",
  );
}
