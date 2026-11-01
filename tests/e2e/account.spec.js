import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";

const headers = { Origin: "http://127.0.0.1:8099", "X-Cho-Em": "1" };
async function register(context) {
  const email = `${randomUUID()}@example.com`;
  const response = await context.request.post("/api/auth/register", {
    headers,
    data: { email, password: "test-password-123", name: "Em", role: "em" },
  });
  expect(response.status()).toBe(201);
  return (await response.json()).user;
}
test("state download retries after a failed first request; offline reload preserves account", async ({
  page,
  context,
}) => {
  const user = await register(context);
  let fail = true;
  await page.route("**/api/state", async (route) => {
    if (fail) {
      fail = false;
      await route.abort();
    } else await route.continue();
  });
  await page.goto("/");
  await expect(page.locator(".local-status")).toContainText("Ngoại tuyến");
  await page.locator(".local-status").click();
  await page.getByRole("button", { name: "Đồng bộ ngay", exact: true }).click();
  await expect(page.locator(".local-status")).toContainText("Đã đồng bộ");
  await expect(page.locator("#dialog-body")).toContainText(user.email);
  await page.locator(".dialog-close").click();
  await page.unroute("**/api/state");
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
  await expect(page.locator(".local-status")).toContainText("Ngoại tuyến");
  await page.locator(".local-status").click();
  await expect(page.locator("#dialog-body")).toContainText(user.email);
  await context.setOffline(false);
});

test("changing login in one tab suspends another and prevents stale writes", async ({
  page,
  context,
}) => {
  const a = await register(context);
  await page.goto("/");
  await expect(page.locator(".local-status")).toContainText("Đã đồng bộ");
  const second = await context.newPage();
  await second.goto("/");
  await expect(second.locator(".local-status")).toContainText("Đã đồng bộ");
  // Simulate a new login via the same client implementation used by the account form.
  const b = await second.evaluate(async () => {
    const { Cloud } = await import("/js/core/cloud.js");
    const { openStorage } = await import("/js/core/storage.js");
    const client = new Cloud(await openStorage(), {
      empty: () => ({}),
      status() {},
      remote() {},
      canRefresh: () => true,
    });
    client.channel = new BroadcastChannel("cho-em-session");
    await client.authenticate("register", {
      email: `${crypto.randomUUID()}@example.com`,
      password: "test-password-123",
      name: "Second",
      role: "em",
    });
    const user = client.user;
    client.channel.close();
    return user;
  });
  await expect(page.locator(".local-status")).toContainText("Tài khoản đã đổi");
  const stale = await page.evaluate(
    async ({ a, b }) => {
      const { api } = await import("/js/core/api.js");
      let blocked;
      try {
        await api("/state", {
          method: "PUT",
          body: { revision: 0, state: {} },
        });
      } catch (error) {
        blocked = error.code;
      }
      const response = await fetch("/api/state", {
        headers: { "X-Cho-Em-Account": a.id },
      });
      const current = await fetch("/api/state", {
        headers: { "X-Cho-Em-Account": b.id },
      });
      return {
        blocked,
        status: response.status,
        current: await current.json(),
      };
    },
    { a, b },
  );
  expect(stale.blocked).toBe("ACCOUNT_CHANGED");
  expect(stale.status).toBe(409);
  expect(stale.current.revision).toBe(0);
  expect(stale.current.state.name).toBe("Second");
  await second.close();
});

test("service worker replaces old caches and precaches every module for offline tools", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    await caches.open("cho-em-obsolete-test");
    await navigator.serviceWorker.getRegistration().then((r) => r.unregister());
  });
  await page.reload();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() =>
      page.evaluate(async () =>
        (await caches.keys()).includes("cho-em-obsolete-test"),
      ),
    )
    .toBe(false);
  for (const path of [
    "/shared/dates.js",
    "/shared/backup.js",
    "/shared/reminders.js",
    "/js/core/storage.js",
    "/js/features/account/recovery.js",
    "/js/features/account/data-tools.js",
  ]) {
    expect(
      await page.evaluate(
        async (path) => Boolean(await caches.match(path)),
        path,
      ),
    ).toBe(true);
  }
});

test("guest can preview and restore a backup and download a private reminder", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".local-status")).toContainText(
    "Chỉ trên thiết bị",
  );
  await page.locator(".local-status").click();
  await page
    .getByRole("button", { name: "Khôi phục JSON", exact: true })
    .click();
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - 20);
  const start = date.toISOString().slice(0, 10);
  date.setUTCDate(date.getUTCDate() + 4);
  const end = date.toISOString().slice(0, 10);
  const state = {
    name: "Restored",
    starts: [start],
    ends: { [start]: end },
    entries: {
      [start]: {
        mood: "Vui vẻ",
        symptoms: [],
        note: "Restored private journal",
        shared: true,
      },
    },
    symptomSuggestions: [],
    periodEstimates: {},
  };
  await page.locator("#backup-file").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ state })),
  });
  await expect(page.locator("#backup-preview")).toContainText("1 kỳ kinh");
  await expect(page.locator("#main")).not.toContainText("Restored");
  await page.getByRole("button", { name: "Thay thế bằng bản sao này" }).click();
  await expect(page.locator("#main")).toContainText("Restored");
  await page.locator(".local-status").click();
  await page.getByRole("button", { name: "Nhắc lịch", exact: true }).click();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Tải file lịch", exact: true })
    .click();
  expect((await download).suggestedFilename()).toBe("cho-em-nhac-lich.ics");
  await page.locator(".dialog-close").click();
  await page.locator('#nav [data-view="journal"]').click();
  await expect(page.locator("#main")).toContainText("Restored private journal");
  await expect(page.locator(".journal-sharing")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await page.locator('#nav [data-view="calendar"]').click();
  await page.locator("#note").fill("A new local note");
  await page.getByRole("button", { name: "Lưu ghi chú" }).click();
  await page.locator('#nav [data-view="journal"]').click();
  await expect(page.locator("#main")).toContainText("A new local note");
});

test("account deletion uses explicit confirmation and returns to guest mode", async ({
  page,
  context,
}) => {
  await register(context);
  await page.goto("/");
  await expect(page.locator(".local-status")).toContainText("Đã đồng bộ");
  await page.locator(".local-status").click();
  await page
    .getByRole("button", { name: "Xóa tài khoản", exact: true })
    .click();
  await page.locator("#delete-password").fill("test-password-123");
  await page.locator("#delete-confirm").fill("XÓA TÀI KHOẢN");
  await page
    .getByRole("button", { name: "Xóa vĩnh viễn", exact: true })
    .click();
  await expect(page.locator(".local-status")).toContainText(
    "Chỉ trên thiết bị",
  );
  expect((await context.request.get("/api/auth/me")).status()).toBe(401);
});
