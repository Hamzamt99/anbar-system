import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
export async function checkDropdownLoading(browser, { base, password }) {
  const context = await browser.newContext();
  const cleanup = [];
  let release = () => {};
  const evidence = {};
  try {
    const login = await context.request.post(base + "/api/auth/login", {
      data: { email: "qa@example.com", password },
    });
    assert.equal(login.status(), 200);
    const page = await context.newPage();
    let hold = false,
      requests = 0,
      blockedRequests = 0;
    const barrier = new Promise((resolve) => {
      release = resolve;
    });
    await page.route("**/api/mix-types?*", async (route) => {
      requests++;
      if (hold) {
        blockedRequests++;
        await barrier;
      }
      try {
        await route.continue();
      } catch (error) {
        // Canceled stale lookups can finish after the interception was disposed.
        if (!/Route is already handled|Target.*closed/.test(error.message))
          throw error;
      }
    });
    const first = page.waitForResponse(
      (r) => new URL(r.url()).pathname === "/api/mix-types",
    );
    await page.goto(base + "/invoices/new");
    await page
      .getByRole("combobox", { name: "نوع الخلطة", exact: true })
      .waitFor();
    const initial = await (await first).json();
    assert.ok(initial.data.length);
    assert.equal(requests, 1, "First page should prefetch before any focus");
    evidence.prefetch_before_first_focus = true;
    const name = initial.data[0].name,
      toggle = page.getByRole("button", {
        name: "فتح نوع الخلطة",
        exact: true,
      });
    hold = true;
    const samples = [];
    for (let i = 0; i < 3; i++) {
      const start = performance.now();
      await toggle.click();
      await page
        .getByRole("option", { name, exact: true })
        .waitFor({ timeout: 2000 });
      assert.equal(
        (await page.getByRole("listbox").innerText()).includes("جارٍ التحميل"),
        false,
      );
      samples.push(Math.round(performance.now() - start));
      if (i < 2) await toggle.click();
    }
    assert.ok(
      blockedRequests > 0,
      "Refresh must actually be held while cached options remain usable",
    );
    evidence.warm_open_ms = samples;
    evidence.warm_options_visible_while_network_held = true;
    console.log(
      "Warm dropdown opens while refresh is held (ms): " + samples.join(", "),
    );
    release();
    hold = false;
    await page.unrouteAll({ behavior: "wait" });
    const field = page.getByRole("combobox", {
      name: "نوع الخلطة",
      exact: true,
    });
    // Complete small catalog provides immediate literal/ASCII-case-insensitive matches.
    await field.fill(name.toLowerCase());
    await page.getByRole("option", { name, exact: true }).waitFor();
    evidence.small_catalog_search = true;
    await toggle.click();
    await toggle.click();
    const other = await context.newPage();
    await other.goto(base + "/master");
    await other
      .getByRole("button", { name: "أنواع الخلطات", exact: true })
      .click();
    const added = "Lookup live cache entry",
      renamed = "Lookup changed entry";
    await other.getByRole("button", { name: "إضافة خلطة" }).click();
    await other
      .getByRole("dialog")
      .getByLabel("نوع الخلطة", { exact: true })
      .fill(added);
    await other
      .getByRole("dialog")
      .getByRole("button", { name: "حفظ", exact: true })
      .click();
    const row = other
      .getByRole("row")
      .filter({ has: other.getByRole("cell", { name: added, exact: true }) });
    await row.waitFor();
    await page.getByRole("option", { name: added, exact: true }).waitFor();
    await row.getByRole("button", { name: "تعديل", exact: true }).click();
    await other
      .getByRole("dialog")
      .getByLabel("نوع الخلطة", { exact: true })
      .fill(renamed);
    await other
      .getByRole("dialog")
      .getByRole("button", { name: "حفظ", exact: true })
      .click();
    const renamedRow = other
      .getByRole("row")
      .filter({ has: other.getByRole("cell", { name: renamed, exact: true }) });
    await renamedRow.waitFor();
    await page.getByRole("option", { name: renamed, exact: true }).waitFor();
    assert.equal(
      await page.getByRole("option", { name: added, exact: true }).count(),
      0,
    );
    await renamedRow.getByRole("button", { name: "حذف", exact: true }).click();
    await other
      .getByRole("dialog")
      .getByRole("button", { name: "حذف", exact: true })
      .click();
    await page
      .getByRole("option", { name: renamed, exact: true })
      .waitFor({ state: "hidden" });
    evidence.cross_tab_create_edit_delete_invalidation = true;
    await other.close();
    // Larger catalogs remain bounded: first page only, cursor More and remote search.
    for (let i = 0; i < 55; i++) {
      const r = await context.request.post(base + "/api/mix-types", {
        data: { name: "AA Lookup bulk " + String(i).padStart(3, "0") },
      });
      assert.equal(r.status(), 201);
      cleanup.push((await r.json()).data.id);
    }
    const tail = await context.request.post(base + "/api/mix-types", {
      data: { name: "ZZ Lookup tail" },
    });
    assert.equal(tail.status(), 201);
    cleanup.push((await tail.json()).data.id);
    await toggle.click();
    const refreshed = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === "/api/mix-types" &&
        new URL(r.url()).searchParams.get("search") === "",
    );
    await toggle.click();
    const result = await (await refreshed).json();
    assert.equal(result.data.length, 50);
    assert.equal(result.has_more, true);
    await page
      .getByRole("listbox")
      .getByRole("button", { name: "المزيد", exact: true })
      .click();
    await page
      .getByRole("option", { name: "ZZ Lookup tail", exact: true })
      .waitFor();
    await field.fill("ZZ Lookup tail");
    await page
      .getByRole("option", { name: "ZZ Lookup tail", exact: true })
      .waitFor();
    evidence.bounded_large_catalog_pagination_and_remote_search = true;
    await page
      .getByRole("button", { name: "تسجيل الخروج", exact: true })
      .click();
    await page.waitForURL("**/login");
    assert.equal(await page.getByRole("option").count(), 0);
    evidence.logout_unmounts_private_picker_state = true;
    await writeFile(
      "tmp/dropdown-verification.json",
      JSON.stringify(evidence, null, 2),
    );
    console.log(
      "Dropdown checks passed: prefetch, network-independent warm opens, cross-tab mutation invalidation, bounded large-catalog search/pagination and logout cleanup.",
    );
  } finally {
    release();
    // This context is synthetic and isolated; use the runner's valid QA session to clean up.
    await context.request.post(base + "/api/auth/login", {
      data: { email: "qa@example.com", password },
    });
    for (const id of cleanup)
      await context.request.delete(base + "/api/mix-types/" + id, { data: {} });
    await context.close();
  }
}
