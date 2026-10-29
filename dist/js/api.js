export class ApiError extends Error {
  constructor(status, payload) {
    super(payload?.error?.message || "Không thể kết nối máy chủ.");
    this.status = status;
    this.code = payload?.error?.code;
    this.details = payload?.error?.details;
  }
}
export async function api(path, { method = "GET", body } = {}) {
  let response;
  try {
    response = await fetch("/api" + path, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json", "X-Cho-Em": "1" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new ApiError(0);
  }
  const payload =
    response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, payload);
  if (response.status !== 204 && !payload)
    throw new ApiError(503, {
      error: {
        message:
          "Máy chủ chưa có API. Hãy chạy bản backend, không chỉ mở hosting tĩnh.",
      },
    });
  return payload;
}
