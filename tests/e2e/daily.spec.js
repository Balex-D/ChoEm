import { test, expect } from "@playwright/test";
const headers = { Origin: "http://127.0.0.1:8099", "X-Cho-Em": "1" };

test("mobile quick check-in persists offline; deleting journal and recording a period can be undone", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator(".local-status")).toContainText(
    "Chỉ trên thiết bị",
  );
  await page.locator('#mobile-nav [data-view="calendar"]').click();
  const recordButtons = await page.evaluate(() =>
    ["#selected-period-action", "#intimacy-toggle"].map((selector) => {
      const box = document.querySelector(selector).getBoundingClientRect();
      return { top: box.top, left: box.left, right: box.right };
    }),
  );
  expect(
    Math.abs(recordButtons[0].top - recordButtons[1].top),
  ).toBeLessThanOrEqual(1);
  expect(recordButtons[0].right).toBeLessThanOrEqual(recordButtons[1].left);
  await expect(page.locator(".day-details .intimacy-controls")).toHaveCount(0);
  await page.locator("#note").fill("Ghi nhanh riêng tư");
  await page.locator("#save-note").click();
  await page.locator('#mobile-nav [data-view="home"]').click();
  await page
    .getByRole("button", { name: "Ghi lại một ngày của Em", exact: true })
    .click();
  await page.locator("#quick-mood").selectOption("Vui vẻ");
  await page.locator("#quick-pain").selectOption("0");
  await page.locator("#quick-flow").selectOption("medium");
  await expect(page.locator("#quick-note")).toHaveCount(0);
  await expect(page.locator("#quick-shared")).toHaveCount(0);
  await expect(page.locator("#quick-needs")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Cất vào nhật ký", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Hôm nay Em cần gì?", exact: true })
    .click();
  await expect(page.locator("#quick-note")).toHaveCount(0);
  await page.locator('#quick-needs input[value="rest"]').check();
  await page.locator("#needs-text").fill("Em muốn đi dạo một chút");
  const widths = await page.evaluate(() => [
    document.querySelector("#needs-text").getBoundingClientRect().width,
    document.querySelector("#quick-needs").getBoundingClientRect().width,
  ]);
  expect(Math.abs(widths[0] - widths[1])).toBeLessThanOrEqual(1);
  await expect(page.locator("#quick-send-needs")).toBeDisabled();
  await page
    .getByRole("button", { name: "Lưu điều Em cần", exact: true })
    .click();
  await page.locator('#mobile-nav [data-view="journal"]').click();
  await expect(page.locator(".entry")).toContainText("Mức đau: 0/10");
  await expect(page.locator(".entry")).toContainText("Lượng kinh: Vừa");
  await expect(page.locator(".entry")).toContainText("Cần nghỉ ngơi");
  await expect(page.locator(".entry")).toContainText("Em muốn đi dạo một chút");
  await page.locator(".entry [data-delete]").click();
  await page.locator("#delete-entry").click();
  await expect(page.locator(".entry")).toHaveCount(0);
  await page.locator("#undo-banner button").click();
  await expect(page.locator(".entry")).toContainText("Ghi nhanh riêng tư");
  await expect(page.locator(".journal-sharing")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await page.locator('#mobile-nav [data-view="home"]').click();
  await page.locator("#period-action").click();
  await expect(page.locator(".day.today")).toHaveClass(/period/);
  await page.locator("#undo-banner button").click();
  await expect(page.locator(".day.today")).not.toHaveClass(/period/);
  await page.locator("#intimacy-toggle").click();
  await expect(page.locator("#intimacy-toggle")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    )
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator(".day.today .intimacy-marker")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Ghi lại một ngày của Em", exact: true })
    .click();
  await expect(page.locator("#quick-pain")).toHaveValue("0");
  await expect(page.locator("#quick-note")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Cất vào nhật ký", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Hôm nay Em cần gì?", exact: true })
    .click();
  await expect(page.locator("#needs-text")).toHaveValue(
    "Em muốn đi dạo một chút",
  );
  await expect(page.locator('#quick-needs input[value="rest"]')).toBeChecked();
  await context.setOffline(false);
});

test("preview matches companion needs; pause hides journal and needs until explicitly resumed", async ({
  browser,
}) => {
  const emContext = await browser.newContext({
    baseURL: "http://127.0.0.1:8099",
  });
  const anhContext = await browser.newContext({
    baseURL: "http://127.0.0.1:8099",
  });
  try {
    async function login(context, role) {
      const response = await context.request.post("/api/auth/login", {
        headers,
        data: {
          email: `daily-${role}@example.test`,
          password: "daily-test-password",
        },
      });
      expect(response.status()).toBe(200);
      return (await response.json()).user;
    }
    const em = await login(emContext, "em"),
      anh = await login(anhContext, "anh");
    const invite = await emContext.request.post("/api/connections/invites", {
      headers: { ...headers, "X-Cho-Em-Account": em.id },
      data: {},
    });
    const accept = await anhContext.request.post("/api/connections/accept", {
      headers: { ...headers, "X-Cho-Em-Account": anh.id },
      data: { code: (await invite.json()).code },
    });
    expect(accept.status()).toBe(201);
    const owner = await emContext.newPage();
    await owner.goto("/");
    await expect(owner.locator(".local-status")).toContainText("Đã đồng bộ");
    await owner.locator('#nav [data-view="calendar"]').click();
    await owner.locator("#note").fill("Nhật ký gửi Anh");
    await owner.locator("#share-day-journal").check();
    await owner.locator("#save-note").click();
    await owner.locator('#nav [data-view="home"]').click();
    await owner
      .getByRole("button", { name: "Ghi lại một ngày của Em", exact: true })
      .click();
    await owner.locator("#quick-pain").selectOption("4");
    await owner
      .getByRole("button", { name: "Cất vào nhật ký", exact: true })
      .click();
    await owner
      .getByRole("button", { name: "Hôm nay Em cần gì?", exact: true })
      .click();
    await owner.locator('#quick-needs input[value="listen"]').check();
    await owner
      .locator("#needs-text")
      .fill("Tối nay Anh đi dạo cùng Em nhé <b>một chút</b>");
    await owner.locator("#quick-send-needs").check();
    await owner
      .getByRole("button", { name: "Lưu điều Em cần", exact: true })
      .click();
    await expect(owner.locator(".local-status")).toContainText("Đã đồng bộ");
    const companion = await anhContext.newPage();
    await companion.goto("/");
    await companion.locator('#nav [data-companion-nav="day"]').click();
    await expect(companion.locator("#shared-summary")).toContainText(
      "Muốn được lắng nghe",
    );
    await expect(companion.locator(".today-needs")).toContainText(
      "Tối nay Anh đi dạo cùng Em nhé <b>một chút</b>",
    );
    await expect(companion.locator(".today-needs b")).toHaveCount(0);
    await expect(companion.locator("#shared-summary")).toContainText(
      "Nhật ký gửi Anh",
    );
    await expect(companion.locator("#shared-summary")).not.toContainText(
      "Mức đau: 4/10",
    );
    await owner.locator('#nav [data-view="connect"]').click();
    await owner.locator("#sharing-preview-open").click();
    await owner.locator('[data-preview-tab="day"]').click();
    await expect(owner.locator("#sharing-preview")).toContainText(
      "Muốn được lắng nghe",
    );
    await expect(owner.locator("#sharing-preview")).toContainText(
      "Nhật ký gửi Anh",
    );
    await expect(owner.locator("#sharing-preview")).not.toContainText(
      "Mức đau: 4/10",
    );
    await owner.locator(".dialog-close").click();
    await owner.locator("#sharing-pause").click();
    await expect(owner.locator("#sharing-pause")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await companion.locator("#refresh-summary").click();
    await expect(companion.locator("#shared-summary")).toContainText(
      "tạm dừng",
    );
    await expect(companion.locator("#shared-summary")).not.toContainText(
      "Nhật ký gửi Anh",
    );
    await owner.locator("#sharing-preview-open").click();
    await expect(owner.locator("#sharing-preview")).toContainText("tạm dừng");
    await owner.locator(".dialog-close").click();
    await owner.locator("#sharing-pause").click();
    await expect(owner.locator("#sharing-pause")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await companion.locator("#refresh-summary").click();
    await expect(companion.locator("#shared-summary")).toContainText(
      "Nhật ký gửi Anh",
    );
  } finally {
    await emContext.close();
    await anhContext.close();
  }
});
