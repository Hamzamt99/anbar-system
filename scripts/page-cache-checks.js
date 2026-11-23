import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
export async function checkPageCache(browser, { base, password, invoiceId }) {
  assert.equal(base, "http://localhost:8788");
  const context = await browser.newContext();
  const page = await context.newPage();
  const resources = new Set(["/api/invoices", "/api/users", "/api/audit-logs"]);
  let reads = 0,
    filterReads = 0;
  const historyRequest = (url) =>
    ["/api/customers", "/api/drivers"].includes(url.pathname) &&
    url.searchParams.get("include_deleted") === "1";
  page.on("request", (r) => {
    if (r.method() === "GET" && historyRequest(new URL(r.url()))) filterReads++;
    if (r.method() === "GET" && resources.has(new URL(r.url()).pathname))
      reads++;
  });
  const timings = [];
  const debug = [];
  page.on("response", (r) => {
    if (new URL(r.url()).pathname === "/api/users")
      debug.push([r.request().method(), r.status()]);
  });
  page.on("pageerror", (error) => debug.push(error.message));
  try {
    assert.ok(
      (
        await context.request.post(base + "/api/auth/login", {
          data: { email: "qa@example.com", password },
        })
      ).ok(),
    );
    const warmed = [...resources].map((path) =>
      page.waitForResponse((r) => new URL(r.url()).pathname === path),
    );
    for (const path of ["/api/customers", "/api/drivers"])
      warmed.push(
        page.waitForResponse(
          (r) =>
            new URL(r.url()).pathname === path &&
            historyRequest(new URL(r.url())),
        ),
      );
    await page.goto(base + "/invoices/new");
    await Promise.all(warmed);
    assert.equal(reads, 3);
    await page.route("**/api/**", async (route) => {
      if (
        route.request().method() === "GET" &&
        (resources.has(new URL(route.request().url()).pathname) ||
          historyRequest(new URL(route.request().url())))
      )
        await route.abort();
      else await route.continue();
    });
    for (let round = 0; round < 3; round++) {
      for (const label of ["الفواتير", "المستخدمون", "سجل العمليات"]) {
        const start = performance.now();
        await page.getByRole("link", { name: label, exact: true }).click();
        await page
          .getByRole("heading", {
            name: label === "المستخدمون" ? "إدارة المستخدمين" : label,
            exact: true,
          })
          .waitFor();
        assert.equal(
          await page.getByText("جارٍ التحميل...", { exact: true }).count(),
          0,
        );
        timings.push({
          label,
          elapsed_ms: +(performance.now() - start).toFixed(1),
        });
      }
    }
    assert.equal(reads, 3, "Warm route returns must issue zero list requests");
    assert.equal(
      filterReads,
      2,
      "Warm invoice navigation must also reuse filter option pages",
    );
    await page.unrouteAll({ behavior: "wait" });
    await page.getByRole("link", { name: "المستخدمون", exact: true }).click();
    await page
      .getByRole("heading", { name: "إدارة المستخدمين", exact: true })
      .waitFor();
    await page
      .getByLabel("البريد الإلكتروني")
      .fill("list-cache-fixture@example.invalid");
    await page.getByLabel("كلمة المرور المؤقتة").fill(password);
    assert.equal(
      await page.locator("form").evaluate((form) => form.checkValidity()),
      true,
      JSON.stringify(
        await page.locator("input").evaluateAll((inputs) =>
          inputs.map((input) => ({
            type: input.type,
            valid: input.validity.valid,
            message: input.validationMessage,
            length: input.value.length,
          })),
        ),
      ),
    );
    const refreshed = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === "/api/users" &&
        r.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "إضافة مستخدم", exact: true })
      .click();
    await refreshed;
    await page
      .getByRole("cell", {
        name: "list-cache-fixture@example.invalid",
        exact: true,
      })
      .waitFor();
    await page
      .getByRole("row")
      .filter({ hasText: "list-cache-fixture@example.invalid" })
      .getByRole("button", { name: "حذف", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "حذف", exact: true })
      .click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page
      .getByRole("cell", {
        name: "list-cache-fixture@example.invalid",
        exact: true,
      })
      .waitFor({ state: "hidden" });
    // A print in another browser tab must invalidate both invoice rows/locks and audit history.
    await page.getByRole("link", { name: "الفواتير", exact: true }).click();
    const writer = await context.newPage();
    await writer.goto(base + "/invoices/" + invoiceId);
    await writer.locator(".receipt").waitFor();
    await writer.evaluate(() => {
      window.print = () => {
        window.__printed = true;
      };
    });
    const invoiceRefresh = page.waitForResponse(
      (r) => new URL(r.url()).pathname === "/api/invoices",
    );
    await writer.getByRole("button", { name: "طباعة", exact: true }).click();
    await invoiceRefresh;
    await writer.waitForFunction(() => window.__printed === true);
    const auditRefresh = page.waitForResponse(
      (r) => new URL(r.url()).pathname === "/api/audit-logs",
    );
    await page.getByRole("link", { name: "سجل العمليات", exact: true }).click();
    const auditData = await (await auditRefresh).json();
    assert.ok(
      auditData.data.some(
        (row) =>
          String(row.invoice_id) === String(invoiceId) &&
          row.action === "PRINT",
      ),
    );
    await writer.close();
    const watcher = await context.newPage();
    await watcher.goto(base + "/users");
    await watcher
      .getByRole("cell", { name: "qa@example.com", exact: true })
      .waitFor();
    const watcherLoggedOut = watcher.waitForURL("**/login");
    await page
      .getByRole("button", { name: "تسجيل الخروج", exact: true })
      .click();
    await page.waitForURL("**/login");
    await watcherLoggedOut;
    await watcher
      .getByRole("button", { name: "تسجيل الدخول", exact: true })
      .waitFor();
    assert.equal(
      await watcher
        .getByRole("cell", { name: "qa@example.com", exact: true })
        .count(),
      0,
    );
    await watcher.close();
    const oldReads = reads;
    let privilegedReads = 0;
    page.on("request", (request) => {
      if (
        ["/api/users", "/api/audit-logs"].includes(
          new URL(request.url()).pathname,
        )
      )
        privilegedReads++;
    });
    await page.getByLabel("البريد الإلكتروني").fill("entry@example.com");
    await page.getByLabel("كلمة المرور", { exact: true }).fill(password);
    const freshEntryRead = page.waitForResponse(
      (r) => new URL(r.url()).pathname === "/api/invoices",
    );
    await page
      .getByRole("button", { name: "تسجيل الدخول", exact: true })
      .click();
    await page.waitForURL("**/invoices/new");
    await freshEntryRead;
    assert.ok(
      reads > oldReads,
      "Logout/login must create a fresh private cache",
    );
    assert.equal(
      privilegedReads,
      0,
      "Data Entry must never prefetch users or audit history",
    );
    assert.equal(
      await page.getByRole("link", { name: "المستخدمون", exact: true }).count(),
      0,
    );
    await writeFile(
      "tmp/page-cache.json",
      JSON.stringify(
        {
          initial_reads: 3,
          initial_filter_reads: 2,
          warm_filter_requests: 0,
          warm_navigations: 9,
          warm_list_requests: 0,
          local_user_mutation_refresh: true,
          cross_tab_print_invalidates_invoices_and_audit: true,
          logout_clears: true,
          cross_tab_logout_discards_private_state: true,
          account_switch_respects_role: true,
          timings,
        },
        null,
        2,
      ) + "\n",
    );
    console.log(
      "Page cache checks passed: role-authorized preload, nine warm navigations without list requests, mutation refresh and logout cleanup.",
    );
  } catch (error) {
    console.error(
      "Page cache diagnostic:",
      debug,
      await page.locator(".error").allTextContents(),
      await page.locator("input").evaluateAll((inputs) =>
        inputs.map((input) => ({
          type: input.type,
          valid: input.validity.valid,
          message: input.validationMessage,
          length: input.value.length,
        })),
      ),
    );
    throw error;
  } finally {
    await context.close();
  }
}
