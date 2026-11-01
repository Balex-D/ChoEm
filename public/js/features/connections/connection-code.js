const tokenPattern = /^[a-f0-9]{64}$/;
const shortCodePattern = /^[A-Z0-9]{6}$/i;
const uuidPattern =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

// QR secrets remain in the URL fragment, never in server access logs.
export function parseConnectionCode(raw, origin = globalThis.location.origin) {
  const value = String(raw || "").trim();
  if (shortCodePattern.test(value)) return { code: value.toUpperCase() };
  if (tokenPattern.test(value)) return { token: value };
  if (value.length > 512) throw new Error("Mã kết nối không hợp lệ.");
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Hãy nhập mã hoặc quét QR kết nối của Em.");
  }
  if (
    url.origin !== origin ||
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error("QR không thuộc ứng dụng này.");
  const params = new URLSearchParams(url.hash.slice(1));
  if (["invite", "em", "v"].some((key) => params.getAll(key).length > 1))
    throw new Error("QR kết nối không hợp lệ.");
  const rawCode = params.get("invite") || "";
  const token = shortCodePattern.test(rawCode)
    ? rawCode.toUpperCase()
    : rawCode;
  if (!shortCodePattern.test(token) && !tokenPattern.test(token))
    throw new Error("QR không chứa mã kết nối hợp lệ.");
  const ownerId = params.get("em");
  const version = params.get("v");
  if (version === "2") {
    if (ownerId || !shortCodePattern.test(token))
      throw new Error("QR kết nối không hợp lệ.");
    return { code: token };
  }
  if (ownerId || version) {
    if (version !== "1" || !uuidPattern.test(ownerId || ""))
      throw new Error("UUID hoặc phiên bản QR không hợp lệ.");
    return { ownerId, code: token };
  }
  return shortCodePattern.test(token) ? { code: token } : { token }; // Keep existing invitations until expiry.
}
