export class ApiError extends Error {
  constructor(status, payload) {
    super(payload?.error?.message || "Không thể kết nối máy chủ.");
    this.status = status;
    this.code = payload?.error?.code;
    this.details = payload?.error?.details;
  }
}
let expectedAccount = null;
let blocked = false;
export function setApiAccount(id, suspended = false) {
  expectedAccount = id;
  blocked = suspended;
}
export async function api(
  path,
  { method = "GET", body, anonymous = false } = {},
) {
  const account = expectedAccount;
  if (blocked && !anonymous)
    throw new ApiError(409, {
      error: {
        code: "ACCOUNT_CHANGED",
        message:
          "Tài khoản đã đổi ở tab khác. Hãy đăng nhập lại; dữ liệu chưa đồng bộ vẫn được giữ.",
      },
    });
  let response;
  try {
    response = await fetch("/api" + path, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "X-Cho-Em": "1",
        ...(!anonymous && account ? { "X-Cho-Em-Account": account } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new ApiError(0);
  }
  const payload =
    response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    if (
      payload?.error?.code === "ACCOUNT_CHANGED" &&
      !anonymous &&
      account === expectedAccount &&
      typeof window !== "undefined"
    )
      window.dispatchEvent(new Event("cho-em:account-changed"));
    throw new ApiError(response.status, payload);
  }
  if (!anonymous && (account !== expectedAccount || blocked))
    throw new ApiError(409, {
      error: {
        code: "ACCOUNT_CHANGED",
        message: "Tài khoản đã thay đổi trong lúc tải dữ liệu.",
      },
    });
  if (response.status !== 204 && !payload)
    throw new ApiError(503, {
      error: {
        message:
          "Máy chủ chưa có API. Hãy chạy bản backend, không chỉ mở hosting tĩnh.",
      },
    });
  return payload;
}
