import type { Config } from "../../config.js";
import { HttpError } from "../../common/errors.js";

export const emailEnabled = (c: Config) =>
  Boolean(c.RESEND_API_KEY && c.EMAIL_FROM);
export async function sendAccountEmail(
  c: Config,
  to: string,
  purpose: "verify" | "reset",
  token: string,
) {
  if (!emailEnabled(c))
    throw new HttpError(
      503,
      "EMAIL_UNAVAILABLE",
      "Chức năng email chưa được quản trị viên cấu hình.",
    );
  // Fragment avoids disclosing recovery secrets in HTTP access logs or referrers.
  const url = `${c.APP_ORIGIN}/#${purpose}=${token}`;
  const action = purpose === "verify" ? "Xác minh email" : "Đặt lại mật khẩu";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${c.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: c.EMAIL_FROM,
      to: [to],
      subject: `${action} — Cho Em`,
      text: `${action} cho tài khoản Cho Em:\n${url}\n\nLiên kết có hiệu lực 30 phút và chỉ dùng một lần. Nếu bạn không yêu cầu, hãy bỏ qua email này.`,
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok)
    throw new HttpError(
      503,
      "EMAIL_DELIVERY_FAILED",
      "Chưa gửi được email. Vui lòng thử lại sau.",
    );
}
