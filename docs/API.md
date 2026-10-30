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
| PATCH | `/state/privacy` | `{revision,privacy:{cycle,mood,symptoms,notes},hideExistingJournals?}`; trả state và revision mới; tùy chọn ẩn nhật ký cũ chỉ dùng khi `notes=false` |
| PATCH | `/state/entries/:date/sharing` | `{revision,shared}`; ẩn/hiện từng nhật ký của chính tài khoản, xác nhận từ server |
| GET | `/connections` | Danh sách kết nối của chính tài khoản, tên đối phương và vai trò |
| POST | `/connections/invites` | Chỉ Em chưa liên kết; trả `{code,token,url,qr,expiresAt}`; mã 6 ký tự A–Z/0–9 dùng một lần, hạn 2 phút; không trả UUID Em; `token` là alias của `code` |
| DELETE | `/connections/invites` | Hủy lời mời đang chờ |
| POST | `/connections/accept` | Chỉ Anh; `{ownerId,code}` từ QR, `{code}` cho mã 6 ký tự thủ công hoặc `{token}` cho client cũ; trả `{id}` khi liên kết thành công |
| DELETE | `/connections/:id` | Chủ sở hữu hoặc người đồng hành ngắt kết nối |
| GET | `/connections/:id/summary?date=YYYY-MM-DD` | Chỉ người đồng hành đã liên kết; chỉ ngày hiện tại theo Asia/Ho_Chi_Minh |
| GET | `/connections/:id/shared?month=YYYY-MM` | Chỉ Anh đã liên kết; lịch theo tháng, tâm trạng/triệu chứng theo ngày và các nhật ký Em cho phép |
| GET | `/healthz` (ngoài `/api`) | Kiểm tra app và kết nối database |

Mỗi tài khoản có tối đa một liên kết Anh–Em. Backend khóa hai tài khoản theo thứ tự UUID trong transaction, kiểm tra vai trò hiện tại, UUID khớp chủ mã, thời hạn và kết nối đã tồn tại. Sau khi tạo quan hệ trong bảng `connections`, mã bị xóa trong cùng transaction. Các ràng buộc UNIQUE hiện có là lớp bảo vệ cuối chống trùng. Không tự thay người đồng hành hoặc bật quyền chia sẻ.

QR mới phiên bản 2 chỉ chứa URL cùng origin: `/#invite=<code>&v=2`. Không đưa UUID Em vào QR, liên kết, nội dung hiển thị hay response tạo lời mời. Backend ánh xạ bản băm mã về UUID trong database. API vẫn chấp nhận QR phiên bản 1 và `{token}` cũ tới khi mã hết hạn/hủy. Mã chỉ xuất hiện trong fragment, không gửi trong URL request/log. Không có bảng yêu cầu chờ mới: “Gửi yêu cầu liên kết” là xác nhận của Anh, sau đó server lưu quan hệ ngay nếu hợp lệ. Hộp thoại đếm ngược theo `expiresAt`, ẩn mã/QR và khóa sao chép khi hết hạn.

Đăng ký Anh chỉ nhập tên/email/mật khẩu/nhập lại mật khẩu; nhập mã hoặc quét QR sau khi đăng nhập. Anh chỉ thấy trang kết nối khi chưa liên kết. Sau khi liên kết, chỉ render các trường có trong summary đã lọc theo quyền Em; không hiển thị lịch/nhật ký cá nhân, quảng bá hoặc lời khuyên không thuộc chia sẻ. Làm mới mỗi 15 giây khi trang hiển thị, xóa summary khi mất quyền/kết nối hoặc lỗi mạng; không lưu offline. Bật/tắt tất cả mục chia sẻ áp dụng ngay, không hỏi xác nhận.

Mã mới sinh bằng `crypto.randomInt` không thiên lệch, 6 ký tự từ 36 chữ/số (ví dụ `K7M9X2`). Không thay UUID hoặc cấu trúc database: `connection_invites.token_hash` ánh xạ bản băm mã tới `owner_id`. Cấp mã dùng `INSERT ... ON CONFLICT(token_hash) DO NOTHING RETURNING` để kiểm tra trùng nguyên tử, thử tối đa 12 mã, trả 503 nếu không cấp được. Lỗi này rollback để giữ mã cũ của Em. Mã ngắn nhập thường tự chuyển thành chữ hoa; mã dài 64 ký tự đã cấp vẫn được chấp nhận tới khi hết hạn/hủy. Mã sai, hết hạn hoặc đã dùng trả lỗi chung 404, không tiết lộ tài khoản Em. Giới hạn số lần thử áp dụng trước kiểm tra định dạng mã.

Camera dùng `getUserMedia` trên HTTPS/localhost, chỉ xin video sau khi Anh bấm Quét QR. Bộ giải mã jsQR 1.4.0 được phục vụ từ `dist/vendor` (giấy phép Apache-2.0 đi kèm), không dùng CDN và không tải hình ảnh lên server. Camera dừng khi quét xong, đóng hộp thoại, đổi màn hình, ẩn trang hoặc hết 90 giây. Sau khi quét, Anh xác nhận gửi yêu cầu; mã sai, hết hạn hoặc tài khoản đã liên kết sẽ hiện lỗi và không tạo quan hệ mới.

## Snapshot

Phân tích tự động nằm trong `dist/js/cycle-analysis.js`, được PWA và backend dùng chung. Bỏ `length`/`duration` khỏi schema mới; request/cache cũ vẫn nhận nhưng bỏ qua các trường này. Migration `004_automatic_cycle_analysis.sql` bỏ cột cấu hình cũ, tăng revision cho thiết bị tải lại và giữ nguyên các bảng lịch sử thực tế. Tên cá nhân vẫn được lưu độc lập.

- Trung bình chu kỳ: tối đa 6 khoảng cách giữa những lần bắt đầu thực tế gần nhất, làm tròn; cần ít nhất 2 lần bắt đầu. Trung bình hành kinh: tối đa 6 kỳ có ngày kết thúc thực tế, tính cả hai đầu, không tính kỳ đang diễn ra.
- Dự kiến chỉ có khi tính được cả hai trung bình: bắt đầu gần nhất + trung bình chu kỳ; ngày cuối = ngày dự kiến + trung bình hành kinh − 1. Không dùng 28/5 mặc định, không tự nhân thêm các chu kỳ giả định khi chưa có ghi nhận mới. Rụng trứng ước tính hiện có chỉ hiển thị khi có dự kiến hợp lệ.
- Nhận xét độ đều dùng biên độ tối đa–tối thiểu: chu kỳ ≤3 / 4–7 / >7 ngày. Để đáp ứng mục 4.1 của tài liệu, chỉ nhận xét khi có 3 khoảng chu kỳ hợp lệ (cần 4 ngày bắt đầu). Hành kinh cần 3 kỳ hoàn tất; biên độ ≤1 ngày là tương đối ổn định, từ 2 ngày là thay đổi. Không chẩn đoán.
- `cycle_forecasts` giữ bản dự kiến theo ngày bắt đầu làm mốc, với `issued_at` do server cấp. Snapshot được vật hóa khi tải hồ sơ hoặc lưu thay đổi; ngày cấp không đổi nếu dự kiến không đổi. `forecasts` trong response là metadata chỉ đọc; giá trị client gửi lên bị bỏ qua. Nhật ký/chia sẻ không tự sửa ngày cấp. Xóa kỳ kinh sẽ dọn snapshot gắn với mốc bị xóa.
- Chỉ so sánh kỳ thực tế gần nhất với snapshot của kỳ liền trước được lưu trước ngày bắt đầu mới (giờ Việt Nam); không tính ngược dự kiến. Chênh lệch tối đa 1 ngày là gần dự kiến; còn lại sớm/muộn theo số ngày. Không đủ bằng chứng thì không nhận xét. Guest dùng snapshot lưu cục bộ; backend không tin timestamp client.
- Biểu đồ độ dài chu kỳ và số ngày hành kinh chỉ dùng tối đa 6 quan sát thực tế, có đường trung bình. Kỳ chưa kết thúc không vào biểu đồ hành kinh. Thiếu dữ liệu hiển thị `--`/“Chưa đủ dữ liệu”, không số giả định.

`privacy.symptoms` là quyền xem triệu chứng; `privacy.notes` là mặc định chia sẻ của nhật ký mới. PWA khởi tạo `entry.shared` theo mặc định này khi ghi tâm trạng hoặc nhật ký mới; bài đã có `shared=false` luôn giữ lựa chọn riêng, kể cả bật mặc định lại. Nhật ký Anh xem được dựa vào `entry.shared`, không phụ thuộc mặc định hiện tại. Tắt mặc định áp dụng ngay cho ngày mới và hỏi có ẩn bài cũ không: giữ bài cũ thì giữ nguyên `shared`; chọn ẩn thì gửi `hideExistingJournals=true` và đặt tất cả bài đã lưu về `shared=false` trong cùng transaction, không xóa nội dung. Đóng popup giữ nguyên lựa chọn các bài cũ. Tâm trạng/triệu chứng được lọc riêng theo quyền tương ứng, cả trong bài nhật ký công khai. API tháng trả các ngày kinh thực tế, kỳ kinh dự kiến và rụng trứng ước tính khi bật `privacy.cycle`; không gửi toàn bộ state. Các kỳ kinh có ngày kết thúc thực tế, có thể sửa hoặc xóa qua snapshot; xóa kỳ kinh không xóa nhật ký. Chưa ghi ngày kết thúc của kỳ mới nhất thì vẫn coi là đang trong kỳ, không tự kết thúc sau số ngày mặc định.

Migration `003_journal_visibility.sql` thêm quyền triệu chứng, mặc định ẩn nhật ký cũ và tăng revision để các thiết bị tải lại cấu trúc mới. Bật quyền nhật ký chung không tự hiện các bài cũ.

Ghi nhận kéo và nút hành động cùng lưu `starts`/`ends` qua API snapshot hiện có, không cần bảng mới. `period-records.js` chuẩn hóa khoảng ngày, gộp các khoảng trùng/liền nhau; sửa khoảng cũ sẽ thay thế ngày bắt đầu/kết thúc tương ứng, xóa khoảng chỉ xóa kỳ kinh. Không có `ends[start]` ở kỳ mới nhất nghĩa là đang ghi nhận tới hôm nay. Kết thúc lưu hôm nay bao gồm cả ngày đầu và cuối; ngày tương lai chỉ là dự kiến. Dự báo dùng trung bình các khoảng chu kỳ và kỳ đã hoàn tất thực tế, không dùng cài đặt thủ công hay mặc định. Calendar, dữ liệu Anh được phép xem và thống kê cập nhật theo snapshot mới.

```json
{
  "revision": 0,
  "state": {
    "name": "Em",
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

Dữ liệu được kiểm tra: ngày thực, ngày bắt đầu/kết thúc không ở tương lai, kết thúc sau bắt đầu và không lấn sang kỳ kế tiếp, ghi chú tối đa 2000 ký tự, tối đa 1000 kỳ và 10000 ngày nhật ký, body tối đa 2 MB.

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
