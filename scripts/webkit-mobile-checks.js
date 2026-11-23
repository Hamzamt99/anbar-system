import assert from "node:assert/strict";
import { webkit, devices } from "@playwright/test";
import { checkFieldBounds } from "./mobile-checks.js";
import { writeFile } from "node:fs/promises";
export async function checkWebKitMobile({ base, password, out }) {
  // Keep IDE/Snap GTK/GIO plugins out of the browser's native network process.
  const env = Object.fromEntries(
    ["PATH", "HOME", "DISPLAY", "XDG_RUNTIME_DIR", "TMPDIR"]
      .filter((key) => process.env[key] !== undefined)
      .map((key) => [key, process.env[key]]),
  );
  const browser = await webkit.launch({ env });
  const evidence = [];
  try {
    const context = await browser.newContext({
      ...devices["iPhone 13"],
      viewport: { width: 402, height: 874 },
    });
    const login = await context.request.post(base + "/api/auth/login", {
      data: { email: "qa@example.com", password },
    });
    assert.equal(login.status(), 200);
    assert.match(login.headers()["set-cookie"], /Secure/);
    const origin = new URL(base);
    if (
      origin.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(origin.hostname)
    ) {
      // Geometry harness only: WebKit refuses Secure cookies on HTTP localhost.
      // Verify the real server flag above, then permit the disposable local fixture.
      await context.addCookies(
        (await context.cookies()).map((cookie) => ({
          ...cookie,
          secure: false,
        })),
      );
    }
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    for (const width of [320, 375, 390, 402, 430, 768]) {
      await page.setViewportSize({ width, height: 874 });
      for (const [name, route] of [
        ["create", "/invoices/new"],
        ["filters", "/invoices"],
        ["audit-filters", "/audit-logs"],
      ]) {
        await page.goto(base + route);
        try {
          await page
            .locator('main input[type="date"]')
            .first()
            .waitFor({ timeout: 10000 });
        } catch {
          await page.screenshot({ path: out + "/webkit-form-failure.png" });
          throw Error(
            "WebKit form unavailable: " +
              new URL(page.url()).pathname +
              "; page errors: " +
              JSON.stringify(errors),
          );
        }
        await page.evaluate(() => document.fonts.ready);
        const controls = page.locator(
          'main input[type="date"],main input[type="time"]',
        );
        for (const state of ["empty", "filled"]) {
          for (const control of await controls.all()) {
            const type = await control.getAttribute("type");
            await control.fill(
              state === "empty" ? "" : type === "date" ? "2026-11-23" : "23:55",
            );
            assert.equal(
              await control.inputValue(),
              state === "empty" ? "" : type === "date" ? "2026-11-23" : "23:55",
            );
          }
          await checkFieldBounds(page, `WebKit ${width}px ${name} ${state}`);
          assert.ok(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
            `${name}: horizontal overflow`,
          );
          evidence.push({
            engine: "WebKit",
            width,
            page: name,
            state,
            native_controls: await controls.count(),
            contained: true,
          });
          if (width === 402)
            await page.screenshot({
              path: `${out}/webkit-${width}-${name}-${state}.png`,
              fullPage: true,
            });
        }
      }
    }
    assert.deepEqual(errors, []);
    await context.close();
  } finally {
    await browser.close();
  }
  await writeFile(
    "tmp/mobile-native-field-verification.json",
    JSON.stringify(evidence, null, 2),
  );
  console.log(
    `WebKit mobile containment passed: ${evidence.length} page/width/value combinations.`,
  );
}
