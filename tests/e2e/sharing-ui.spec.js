import { test, expect } from "@playwright/test";
const headers = { Origin: "http://127.0.0.1:8099", "X-Cho-Em": "1" };
test("switches keep scroll and DOM; dismissing journal choice preserves old entries", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  const login = await context.request.post("/api/auth/login", {
    headers,
    data: { email: "sharing-em@example.test", password: "daily-test-password" },
  });
  expect(login.status()).toBe(200);
  const { user } = await login.json();
  const auth = { ...headers, "X-Cho-Em-Account": user.id };
  const res = await context.request.get("/api/state", { headers: auth });
  const initial = await res.json();
  initial.state.privacy.notes = true;
  initial.state.entries["2026-01-01"] = {
    mood: "",
    symptoms: [],
    note: "Keep this shared journal",
    shared: true,
  };
  expect(
    (
      await context.request.put("/api/state", { headers: auth, data: initial })
    ).status(),
  ).toBe(200);
  await page.goto("/");
  await expect(page.locator(".local-status")).toContainText("Đã đồng bộ");
  await page.locator('#nav [data-view="connect"]').click();
  await expect(
    page.getByRole("heading", { name: "Quyền riêng tư của Em", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".sharing-controls")).toHaveCount(0);
  await expect(page.locator(".connect-grid #sharing-preview-open")).toHaveCount(
    1,
  );
  await page.locator('[data-privacy="mood"]').scrollIntoViewIfNeeded();
  await page.evaluate(() => {
    window.scrollBy(0, -60);
    window.__sharingRoot = document.querySelector("#connection-root");
  });
  const before = await page.evaluate(() => window.scrollY);
  expect(before).toBeGreaterThan(100);
  for (const enabled of [true, false]) {
    await page.locator('[data-privacy="mood"]').click();
    await expect(page.locator('[data-privacy="mood"]')).toHaveAttribute(
      "aria-checked",
      String(enabled),
    );
    expect(
      await page.evaluate(
        () =>
          document.querySelector("#connection-root") === window.__sharingRoot,
      ),
    ).toBe(true);
    expect(
      Math.abs((await page.evaluate(() => window.scrollY)) - before),
    ).toBeLessThanOrEqual(2);
  }
  for (const dismiss of ["close", "escape", "backdrop"]) {
    if (
      (await page
        .locator('[data-privacy="notes"]')
        .getAttribute("aria-checked")) === "false"
    ) {
      await page.locator('[data-privacy="notes"]').click();
      await expect(page.locator('[data-privacy="notes"]')).toHaveAttribute(
        "aria-checked",
        "true",
      );
    }
    await page.locator('[data-privacy="notes"]').click();
    await expect(page.locator("#hide-old-journals")).toBeVisible();
    if (dismiss === "close") await page.locator(".dialog-close").click();
    if (dismiss === "escape") await page.keyboard.press("Escape");
    if (dismiss === "backdrop") await page.mouse.click(2, 2);
    await expect(page.locator("#dialog")).not.toBeVisible();
    const current = await (
      await context.request.get("/api/state", { headers: auth })
    ).json();
    expect(current.state.privacy.notes).toBe(false);
    expect(current.state.entries["2026-01-01"].shared).toBe(true);
    expect(current.state.entries["2026-01-01"].note).toBe(
      "Keep this shared journal",
    );
  }
  await page.locator('[data-privacy="notes"]').click();
  await expect(page.locator('[data-privacy="notes"]')).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await page.locator('[data-privacy="notes"]').click();
  await page.locator("#hide-old-journals").click();
  await expect(page.locator("#dialog")).not.toBeVisible();
  const hidden = await (
    await context.request.get("/api/state", { headers: auth })
  ).json();
  expect(hidden.state.entries["2026-01-01"].shared).toBe(false);
  expect(hidden.state.entries["2026-01-01"].note).toBe(
    "Keep this shared journal",
  );
});
