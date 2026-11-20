import assert from "node:assert/strict";

export async function openNavigation(page) {
  const button = page.getByRole("button", { name: "القائمة", exact: true });
  if (
    (await button.isVisible()) &&
    (await button.getAttribute("aria-expanded")) === "false"
  )
    await button.click();
}

async function checkWidth(page, label) {
  const dimensions = await page.evaluate(() => ({
    viewport: innerWidth,
    page: document.documentElement.scrollWidth,
  }));
  assert.ok(
    dimensions.page <= dimensions.viewport,
    `${label}: document width ${dimensions.page} exceeds ${dimensions.viewport}`,
  );
}

export async function checkMobilePages(page, { base, out, invoiceId }) {
  const routes = [
    ["create", "/invoices/new", "إنشاء فاتورة"],
    ["invoices", "/invoices", "الفواتير"],
    ["master", "/master", "البيانات الأساسية"],
    ["users", "/users", "إدارة المستخدمين"],
    ["audit", "/audit-logs", "سجل العمليات"],
    ["receipt", `/invoices/${invoiceId}`, "شهادة استلام"],
  ];
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    for (const [name, path, heading] of routes) {
      await page.goto(base + path);
      await page
        .getByRole("heading", { name: heading, exact: true })
        .first()
        .waitFor();
      if (["invoices", "master", "users", "audit"].includes(name))
        await page
          .locator(".responsive-table tbody td:not(.empty)")
          .first()
          .waitFor();
      if (name === "create") await page.getByLabel("مكان الصب").waitFor();
      await page.evaluate(() => document.fonts.ready);
      await checkWidth(page, `${width}px ${name}`);
      if (width <= 900) {
        const overflowing = await page
          .locator(".responsive-table")
          .evaluateAll(
            (tables) =>
              tables.filter((t) => t.scrollWidth > t.clientWidth + 1).length,
          );
        assert.equal(overflowing, 0, `${name}: mobile table overflows`);
        const tiny = await page
          .locator("main input, main select, main button, main a.button")
          .evaluateAll((elements) =>
            elements
              .filter(
                (el) =>
                  el.getClientRects().length &&
                  el.getBoundingClientRect().height < 43,
              )
              .map((el) => el.getAttribute("aria-label") || el.textContent),
          );
        assert.deepEqual(tiny, [], `${name}: controls too small to tap`);
      }
      await page.screenshot({
        path: `${out}/mobile-${width}-${name}.png`,
        fullPage: true,
      });
      if (name === "create" && width === 320) {
        await page
          .getByRole("combobox", { name: "اسم العميل", exact: true })
          .fill("شركة");
        const option = page.getByRole("option", {
          name: "شركة البناء الحديث",
          exact: true,
        });
        await option.waitFor();
        await checkWidth(page, "320px open searchable selector");
        await option.click();
        assert.equal(
          await page
            .getByRole("combobox", { name: "اسم العميل", exact: true })
            .inputValue(),
          "شركة البناء الحديث",
        );
      }
      if (name === "master" && width === 390) {
        await page
          .getByRole("button", { name: "حذف", exact: true })
          .first()
          .click();
        await page.getByRole("dialog").waitFor();
        await page.screenshot({
          path: `${out}/mobile-${width}-confirmation.png`,
          fullPage: true,
        });
        await page
          .getByRole("dialog")
          .getByRole("button", { name: "إلغاء", exact: true })
          .click();
      }
    }
    await openNavigation(page);
    await page.screenshot({
      path: `${out}/mobile-${width}-navigation.png`,
      fullPage: true,
    });
    await page.getByRole("link", { name: "المستخدمون", exact: true }).click();
    await page
      .getByRole("heading", { name: "إدارة المستخدمين", exact: true })
      .waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "القائمة", exact: true })
        .getAttribute("aria-expanded"),
      "false",
    );
    await openNavigation(page);
    await page.keyboard.press("Escape");
    assert.equal(
      await page
        .getByRole("button", { name: "القائمة", exact: true })
        .getAttribute("aria-expanded"),
      "false",
    );
    assert.equal(
      await page
        .getByRole("button", { name: "القائمة", exact: true })
        .evaluate((el) => document.activeElement === el),
      true,
    );
    await page
      .getByRole("row")
      .filter({ hasText: "qa@example.com" })
      .getByRole("button", { name: "تعديل", exact: true })
      .click();
    await page.getByRole("dialog").waitFor();
    await checkWidth(page, `${width}px user dialog`);
    await page.screenshot({
      path: `${out}/mobile-${width}-user-dialog.png`,
      fullPage: true,
    });
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "إغلاق" })
      .click();
    await page.goto(base + "/audit-logs");
    await page
      .locator(".responsive-table tbody td:not(.empty)")
      .first()
      .waitFor();
    await page
      .getByRole("row")
      .filter({ hasText: "إنشاء فاتورة" })
      .getByRole("button", { name: "عرض التفاصيل" })
      .first()
      .click();
    await page.getByRole("dialog").waitFor();
    await checkWidth(page, `${width}px audit dialog`);
    const bounds = await page.getByRole("dialog").boundingBox();
    assert.ok(
      bounds.y >= 15 && bounds.y + bounds.height <= 845,
      "Audit dialog must fit in the viewport",
    );
    await page.screenshot({
      path: `${out}/mobile-${width}-audit-dialog.png`,
      fullPage: true,
    });
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "إغلاق" })
      .click();
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  console.log(
    "Mobile checks passed at 320, 390 and 768px: every page, table cards, touch controls, dialogs and navigation.",
  );
}
