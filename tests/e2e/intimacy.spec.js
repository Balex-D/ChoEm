import { test, expect } from "@playwright/test";
const headers = { Origin: "http://127.0.0.1:8099", "X-Cho-Em": "1" };
test("Em records privately, grants view/edit to Anh and revokes the right immediately", async ({
  browser,
}) => {
  const emContext = await browser.newContext({
    baseURL: "http://127.0.0.1:8099",
  });
  const anhContext = await browser.newContext({
    baseURL: "http://127.0.0.1:8099",
  });
  try {
    const login = async (context, role) => {
      const res = await context.request.post("/api/auth/login", {
        headers,
        data: {
          email: `calendar-${role}@example.test`,
          password: "daily-test-password",
        },
      });
      expect(res.status()).toBe(200);
      return (await res.json()).user;
    };
    const em = await login(emContext, "em"),
      anh = await login(anhContext, "anh");
    const invite = await emContext.request.post("/api/connections/invites", {
      headers: { ...headers, "X-Cho-Em-Account": em.id },
      data: {},
    });
    const linked = await anhContext.request.post("/api/connections/accept", {
      headers: { ...headers, "X-Cho-Em-Account": anh.id },
      data: { code: (await invite.json()).code },
    });
    expect(linked.status()).toBe(201);
    const { id } = await linked.json();
    const owner = await emContext.newPage(),
      companion = await anhContext.newPage();
    await owner.goto("/");
    await expect(owner.locator(".local-status")).toContainText("Đã đồng bộ");
    await owner.locator('#nav [data-view="calendar"]').click();
    await owner.locator("#intimacy-toggle").click();
    await expect(owner.locator("#intimacy-toggle")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(owner.locator(".day.today .intimacy-marker")).toHaveCount(1);
    await companion.goto("/");
    await companion.locator('#nav [data-companion-nav="day"]').click();
    await expect(
      companion.locator("#shared-summary .intimacy-controls"),
    ).toHaveCount(0);
    await owner.locator('#nav [data-view="connect"]').click();
    await owner.locator('[data-privacy="intimacy"]').click();
    await expect(owner.locator('[data-privacy="intimacy"]')).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await companion.locator("#refresh-summary").click();
    await expect(companion.locator(".intimacy-controls")).toContainText(
      "Đã ghi nhận quan hệ",
    );
    await expect(companion.locator("[data-intimacy-toggle]")).toHaveCount(0);
    await owner.locator('[data-privacy="intimacyEdit"]').click();
    await expect(
      owner.locator('[data-privacy="intimacyEdit"]'),
    ).toHaveAttribute("aria-checked", "true");
    await companion.locator("#refresh-summary").click();
    const date = await companion
      .locator("[data-intimacy-toggle]")
      .getAttribute("data-intimacy-toggle");
    await companion.locator("[data-intimacy-toggle]").click();
    await expect(companion.locator("[data-intimacy-toggle]")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await owner.reload();
    await expect(owner.locator(".local-status")).toContainText("Đã đồng bộ");
    await owner.locator('#nav [data-view="calendar"]').click();
    await expect(owner.locator("#intimacy-toggle")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await owner.locator('#nav [data-view="connect"]').click();
    await owner.locator('[data-privacy="intimacyEdit"]').click();
    await expect(
      owner.locator('[data-privacy="intimacyEdit"]'),
    ).toHaveAttribute("aria-checked", "false");
    // A stale open page cannot bypass a revoked permission, even before its next refresh.
    const current = await emContext.request.get("/api/state", {
      headers: { "X-Cho-Em-Account": em.id },
    });
    const denied = await anhContext.request.patch(
      `/api/connections/${id}/intimacy/${date}`,
      {
        headers: { ...headers, "X-Cho-Em-Account": anh.id },
        data: { revision: (await current.json()).revision, recorded: true },
      },
    );
    expect(denied.status()).toBe(403);
    await companion.locator("#refresh-summary").click();
    await expect(companion.locator("[data-intimacy-toggle]")).toHaveCount(0);
    await owner.locator('[data-privacy="intimacy"]').click();
    await expect(owner.locator('[data-privacy="intimacy"]')).toHaveAttribute(
      "aria-checked",
      "false",
    );
    await companion.locator("#refresh-summary").click();
    await expect(
      companion.locator("#shared-summary .intimacy-controls"),
    ).toHaveCount(0);
  } finally {
    await emContext.close();
    await anhContext.close();
  }
});
