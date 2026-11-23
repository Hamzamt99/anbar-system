import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";

export async function checkMasterTabCache(browser, { base, password }) {
  assert.equal(base, "http://localhost:8788");
  const context = await browser.newContext();
  const page = await context.newPage();
  const masters = [
    ["customers", "العملاء", "شركة البناء الحديث"],
    ["drivers", "السائقون", "أحمد محمد"],
    ["mix-types", "أنواع الخلطات", "C-250N"],
    ["vehicles", "السيارات", "104"],
    ["pumps", "المضخات", "12"],
    ["mixers", "المكسر", "MX-01"],
  ];
  const paths = new Set(masters.map(([path]) => "/api/" + path));
  let reads = 0;
  const timings = [];
  page.on("request", (r) => {
    if (
      r.method() === "GET" &&
      paths.has(new URL(r.url()).pathname) &&
      new URL(r.url()).searchParams.get("include_deleted") !== "1"
    )
      reads++;
  });
  try {
    const login = await context.request.post(base + "/api/auth/login", {
      data: { email: "qa@example.com", password },
    });
    assert.ok(login.ok());
    const warmed = masters.map(([path]) =>
      page.waitForResponse((r) => new URL(r.url()).pathname === "/api/" + path),
    );
    await page.goto(base + "/master");
    await Promise.all(warmed);
    for (const [, label, name] of masters) {
      await page.getByRole("button", { name: label, exact: true }).click();
      await page.getByRole("cell", { name, exact: true }).waitFor();
    }
    assert.equal(reads, 6, "Exactly one initial bounded fetch per master tab");
    await page.route("**/api/*", async (route) => {
      if (
        route.request().method() === "GET" &&
        paths.has(new URL(route.request().url()).pathname) &&
        new URL(route.request().url()).searchParams.get("include_deleted") !==
          "1"
      ) {
        await route.abort();
      } else await route.continue();
    });
    const before = reads;
    for (let round = 0; round < 3; round++) {
      for (const [path, label, name] of masters) {
        const start = performance.now();
        await page.getByRole("button", { name: label, exact: true }).click();
        await page.getByRole("cell", { name, exact: true }).waitFor();
        assert.equal(
          await page.getByText("جارٍ التحميل...", { exact: true }).count(),
          0,
        );
        timings.push({
          path,
          elapsed_ms: +(performance.now() - start).toFixed(1),
        });
      }
    }
    await page.getByRole("link", { name: "المستخدمون", exact: true }).click();
    await page
      .getByRole("cell", { name: "qa@example.com", exact: true })
      .waitFor();
    await page
      .getByRole("link", { name: "البيانات الأساسية", exact: true })
      .click();
    await page
      .getByRole("cell", { name: "شركة البناء الحديث", exact: true })
      .waitFor();
    assert.equal(
      reads,
      before,
      "Warm tab switches and route return must issue zero master GETs",
    );
    await page.unrouteAll({ behavior: "wait" });
    // A different tab's successful write invalidates and refreshes only its affected catalog.
    const writer = await context.newPage();
    await writer.goto(base + "/master");
    await writer.getByRole("button", { name: "إضافة عميل" }).click();
    await writer
      .getByRole("dialog")
      .getByLabel("اسم العميل")
      .fill("Cache cross-tab fixture");
    const refreshed = page.waitForResponse(
      (r) => new URL(r.url()).pathname === "/api/customers",
    );
    await writer
      .getByRole("dialog")
      .getByRole("button", { name: "حفظ", exact: true })
      .click();
    await refreshed;
    await page
      .getByRole("cell", { name: "Cache cross-tab fixture", exact: true })
      .waitFor();
    assert.equal(reads, before + 1);
    await writer
      .getByRole("row")
      .filter({ hasText: "Cache cross-tab fixture" })
      .getByRole("button", { name: "حذف", exact: true })
      .click();
    const removed = page.waitForResponse(
      (r) => new URL(r.url()).pathname === "/api/customers",
    );
    await writer
      .getByRole("dialog")
      .getByRole("button", { name: "حذف", exact: true })
      .click();
    await removed;
    await page
      .getByRole("cell", { name: "Cache cross-tab fixture", exact: true })
      .waitFor({ state: "hidden" });
    await writer.close();
    await page.getByRole("button", { name: "إضافة عميل" }).click();
    await page
      .getByRole("dialog")
      .getByLabel("اسم العميل")
      .fill("Cache local fixture");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "حفظ", exact: true })
      .click();
    await page
      .getByRole("cell", { name: "Cache local fixture", exact: true })
      .waitFor();
    await page
      .getByRole("row")
      .filter({ hasText: "Cache local fixture" })
      .getByRole("button", { name: "حذف", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "حذف", exact: true })
      .click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page
      .getByRole("cell", { name: "Cache local fixture", exact: true })
      .waitFor({ state: "hidden" });
    const countBeforeReload = reads;
    await page.reload();
    await page
      .getByRole("cell", { name: "شركة البناء الحديث", exact: true })
      .waitFor();
    assert.ok(
      reads > countBeforeReload,
      "Full reload must start a new private cache",
    );
    await writeFile(
      "tmp/master-tab-cache.json",
      JSON.stringify(
        {
          initial_reads: before,
          warm_switches: timings.length,
          warm_switch_reads: 0,
          survives_route_return: true,
          cross_tab_mutation_invalidates: true,
          same_tab_mutation_invalidates: true,
          refresh_reloads: true,
          timings,
        },
        null,
        2,
      ) + "\n",
    );
    console.log(
      "Master tab cache checks passed: six initial reads, 18 warm switches plus route return without requests, mutation invalidation and reload.",
    );
  } finally {
    await context.close();
  }
}
