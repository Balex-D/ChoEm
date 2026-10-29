# API v1 — Cho Em

Base path: `/api`. JSON request/response. Frontend và API phục vụ cùng origin.

## Xác thực và chống CSRF

- Đăng nhập dùng cookie `ce_session`: HttpOnly, SameSite=Strict, Secure trong production, thời hạn 30 ngày.
- Giá trị cookie là token ngẫu nhiên 256 bit; database chỉ lưu SHA-256 của token.
- Mọi POST/PUT/PATCH/DELETE cần `Origin` khớp `APP_ORIGIN`, header `X-Cho-Em: 1`, `Content-Type: application/json`, kể cả logout/delete không có body thì gửi `{}`.
- Mọi API response có `Cache-Control: no-store`. Không có CORS cho frontend bên ngoài.
- Giới hạn request: 800/15 phút/IP chung; login 12, register 5, tạo lời mời 15. Chấp nhận lời mời giới hạn 15 lần/15 phút/IP và 10 lần/15 phút/tài khoản, tính cả mã sai định dạng và yêu cầu thành công; thay IP không đặt lại bộ đếm tài khoản. Bộ đếm dùng database, chia sẻ giữa process; vượt giới hạn trả 429 và `Retry-After`.

## Endpoints

| Method | Path | Nội dung |
| --- | --- | --- |
| GET | `/auth/me` | Tài khoản phiên hiện tại; 401 nếu chưa đăng nhập |
| POST | `/auth/register` | `{email,password,name}`; trả user và cookie |
| POST | `/auth/login` | `{email,password}`; trả user và cookie |
| POST | `/auth/logout` | Hủy phiên hiện tại |
| POST | `/auth/change-password` | `{currentPassword,newPassword}`; hủy các phiên cũ và cấp phiên mới |
| GET | `/state` | `{state,revision}` của chính tài khoản |
| PUT | `/state` | `{state,revision}`; đồng bộ snapshot nguyên tử; trả revision mới |
| PATCH | `/state/privacy` | `{revision,privacy:{cycle,mood,notes}}`; trả state và revision mới |
| GET | `/connections` | Danh sách kết nối của chính tài khoản, tên đối phương và vai trò |
| POST | `/connections/invites` | Chỉ Em chưa liên kết; trả `{code,token,url,qr,expiresAt}`; mã 6 ký tự A–Z/0–9 dùng một lần, hạn 2 phút; không trả UUID Em; `token` là alias của `code` |
| DELETE | `/connections/invites` | Hủy lời mời đang chờ |
| POST | `/connections/accept` | Chỉ Anh; `{ownerId,code}` từ QR, `{code}` cho mã 6 ký tự thủ công hoặc `{token}` cho client cũ; trả `{id}` khi liên kết thành công |
| DELETE | `/connections/:id` | Chủ sở hữu hoặc người đồng hành ngắt kết nối |
| GET | `/connections/:id/summary?date=YYYY-MM-DD` | Chỉ người đồng hành đã liên kết; chỉ ngày hiện tại theo Asia/Ho_Chi_Minh |
| GET | `/healthz` (ngoài `/api`) | Kiểm tra app và kết nối database |

Mỗi tài khoản có tối đa một liên kết Anh–Em. Backend khóa hai tài khoản theo thứ tự UUID trong transaction, kiểm tra vai trò hiện tại, UUID khớp chủ mã, thời hạn và kết nối đã tồn tại. Sau khi tạo quan hệ trong bảng `connections`, mã bị xóa trong cùng transaction. Các ràng buộc UNIQUE hiện có là lớp bảo vệ cuối chống trùng. Không tự thay người đồng hành hoặc bật quyền chia sẻ.

QR mới phiên bản 2 chỉ chứa URL cùng origin: `/#invite=<code>&v=2`. Không đưa UUID Em vào QR, liên kết, nội dung hiển thị hay response tạo lời mời. Backend ánh xạ bản băm mã về UUID trong database. API vẫn chấp nhận QR phiên bản 1 và `{token}` cũ tới khi mã hết hạn/hủy. Mã chỉ xuất hiện trong fragment, không gửi trong URL request/log. Không có bảng yêu cầu chờ mới: “Gửi yêu cầu liên kết” là xác nhận của Anh, sau đó server lưu quan hệ ngay nếu hợp lệ. Hộp thoại đếm ngược theo `expiresAt`, ẩn mã/QR và khóa sao chép khi hết hạn.

Đăng ký Anh chỉ nhập tên/email/mật khẩu/nhập lại mật khẩu; nhập mã hoặc quét QR sau khi đăng nhập. Anh chỉ thấy trang kết nối khi chưa liên kết. Sau khi liên kết, chỉ render các trường có trong summary đã lọc theo quyền Em; không hiển thị lịch/nhật ký cá nhân, quảng bá hoặc lời khuyên không thuộc chia sẻ. Làm mới mỗi 15 giây khi trang hiển thị, xóa summary khi mất quyền/kết nối hoặc lỗi mạng; không lưu offline. Bật/tắt tất cả mục chia sẻ áp dụng ngay, không hỏi xác nhận.

Mã mới sinh bằng `crypto.randomInt` không thiên lệch, 6 ký tự từ 36 chữ/số (ví dụ `K7M9X2`). Không thay UUID hoặc cấu trúc database: `connection_invites.token_hash` ánh xạ bản băm mã tới `owner_id`. Cấp mã dùng `INSERT ... ON CONFLICT(token_hash) DO NOTHING RETURNING` để kiểm tra trùng nguyên tử, thử tối đa 12 mã, trả 503 nếu không cấp được. Lỗi này rollback để giữ mã cũ của Em. Mã ngắn nhập thường tự chuyển thành chữ hoa; mã dài 64 ký tự đã cấp vẫn được chấp nhận tới khi hết hạn/hủy. Mã sai, hết hạn hoặc đã dùng trả lỗi chung 404, không tiết lộ tài khoản Em. Giới hạn số lần thử áp dụng trước kiểm tra định dạng mã.

Camera dùng `getUserMedia` trên HTTPS/localhost, chỉ xin video sau khi Anh bấm Quét QR. Bộ giải mã jsQR 1.4.0 được phục vụ từ `dist/vendor` (giấy phép Apache-2.0 đi kèm), không dùng CDN và không tải hình ảnh lên server. Camera dừng khi quét xong, đóng hộp thoại, đổi màn hình, ẩn trang hoặc hết 90 giây. Sau khi quét, Anh xác nhận gửi yêu cầu; mã sai, hết hạn hoặc tài khoản đã liên kết sẽ hiện lỗi và không tạo quan hệ mới.

## Snapshot

```json
{
  "revision": 0,
  "state": {
    "name": "Em",
    "length": 28,
    "duration": 5,
    "starts": ["2025-01-01"],
    "ends": {"2025-01-01": "2025-01-05"},
    "entries": {
      "2025-01-01": {"mood": "Vui vẻ", "symptoms": ["Đau bụng"], "note": "Hôm nay nghỉ ngơi"}
    },
    "privacy": {"cycle": false, "mood": false, "notes": false}
  }
}
```

Database có bảng riêng cho users, profiles, cycles, journal_entries, sessions, connection_invites, connections, rate_limits. Snapshot là giao thức đồng bộ thuận tiện cho frontend hiện có, không phải lưu toàn bộ database dưới dạng một chuỗi JSON.

Dữ liệu được kiểm tra: ngày thực, ngày bắt đầu/kết thúc không ở tương lai, kết thúc sau bắt đầu và không lấn sang kỳ kế tiếp, độ dài chu kỳ 15–90, hành kinh 1–15 và nhỏ hơn chu kỳ, ghi chú tối đa 2000 ký tự, tối đa 1000 kỳ và 10000 ngày nhật ký, body tối đa 2 MB.

## Xung đột và giao dịch

Mỗi tài khoản có một revision. Server khóa hàng profile trong giao dịch, so revision rồi ghi profile/cycles/journal nguyên tử. Hai thiết bị cùng gửi một revision: chỉ một bên thành công, bên kia nhận 409 `SYNC_CONFLICT` cùng snapshot máy chủ. Xóa bản ghi cũng nằm trong snapshot nên không bị phục hồi ngược bởi một thiết bị đang giữ revision cũ.

Frontend giữ bản offline, dừng tự thử khi xung đột và cho chọn bản thiết bị hoặc máy chủ. Không tự trộn ghi chú cùng ngày. Người dùng có thể xuất JSON chứa cả hai bản trước khi lựa chọn; bản cũ được giữ dự phòng trong IndexedDB.

Đây là đồng bộ theo snapshot, phù hợp ứng dụng cá nhân với quy mô bản ghi nhỏ. Khi dữ liệu lớn hoặc cần nhiều người sửa liên tục, có thể thay repository bằng upsert theo bản ghi và giao thức delta, giữ nguyên các module UI.

## Quyền riêng tư

`summary` xây dựng response theo danh sách cho phép ở server. Khi `notes=false`, cả `note` lẫn `symptoms` không có trong JSON; `mood=false` loại mood; `cycle=false` loại cycle. Không chỉ ẩn bằng CSS. Người đồng hành không được gọi `/state` để xem dữ liệu của người khác và không được yêu cầu lịch sử ngày khác.

Tất cả cờ chia sẻ của tài khoản mới mặc định false. Thay đổi quyền cần online, xử lý dữ liệu chờ đồng bộ, rồi nhận xác nhận từ server. Ngắt kết nối vô hiệu hóa các lần đọc sau đó. Dữ liệu người nhận đã đọc hoặc tự lưu trước đó không thể thu hồi.

## Lỗi

```json
{"error":{"code":"VALIDATION_ERROR","message":"Dữ liệu chưa hợp lệ.","issues":[]}}
```

Các mã chính: 400 validation, 401 chưa đăng nhập/sai mật khẩu, 403 CSRF, 404 tài nguyên/mã mời không tồn tại, 409 conflict hoặc email/kết nối trùng, 413 quá lớn, 429 quá nhanh, 500 lỗi nội bộ. Lỗi nội bộ không trả SQL, token hoặc stack trace cho client. Header `X-Request-Id` dùng đối chiếu log; log không ghi request body, query string, email, mật khẩu, session token hoặc ghi chú.
