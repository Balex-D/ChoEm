# Cấu trúc và cách thay đổi code

## Giữ các chỉnh sửa của bản ZIP gửi ngày 28/10/2026

- Giữ nội dung và bố cục giao diện hiện có.
- Phần Lắng nghe cơ thể vẫn ở Lịch chu kỳ, gắn với ngày được chọn.
- Các ngày có trạng thái cơ thể/ghi chú vẫn có dấu đánh dấu.
- Trang Hôm nay vẫn ghi cảm xúc nhanh, không thêm lại khối ghi chú đã bỏ.
- Giữ các hình ảnh đang được giao diện sử dụng.

## Frontend

- `public/js/app.js`: logic hiển thị đang có, đã nối adapter dữ liệu. Không chuyển framework để tránh viết lại các chỉnh sửa của người dùng.
- `public/js/core/api.js`: gọi API cùng origin, timeout, chuẩn hóa lỗi; không dùng token trong localStorage.
- `public/js/core/cloud.js`: đọc/lưu IndexedDB, hàng đợi snapshot bền vững, revision, xung đột, tài khoản và xuất JSON.
- `public/js/features/account/account.js`: đăng ký/đăng nhập, đổi mật khẩu, nhập dữ liệu khách, xử lý xung đột, đăng xuất.
- `public/js/features/connections/connections.js`: tạo/nhận mã và QR, quyền chia sẻ, trạng thái của người đồng hành.
- `public/sw.js`: chỉ cache tài nguyên app trong allowlist; không cache API hoặc URL chứa query. Cache phiên bản mới dọn cache Cho Em cũ sau khi activate.

Dữ liệu khách giữ ở khóa `state` để tương thích bản cũ. Dữ liệu tài khoản giữ ở khóa `account:<id>`, kèm revision và dirty flag. Mỗi tài khoản tách khóa; dữ liệu khách không tự tải lên sau đăng nhập. Nhập khách là thao tác riêng và giữ quyền chia sẻ tài khoản hiện tại.

Khi offline, người đã đăng nhập có thể ghi trên bản lưu tài khoản. Ghi mới được lưu local trước, rồi thử đồng bộ khi online, khi quay lại tab và mỗi 30 giây khi tab đang mở. Hệ thống không hứa chạy đồng bộ khi app đã đóng. Chưa đăng nhập vẫn dùng được local.

Nếu đang có bản ghi chưa lưu trong ô nhập, background pull không thay giao diện. Nếu có chỉnh sửa mới trong lúc upload, bản mới giữ dirty và được gửi với revision đã được server xác nhận. Phiên hết hạn không xóa dữ liệu đang chờ; đăng nhập lại cùng tài khoản để tiếp tục.

Đăng xuất cần đồng bộ hết dữ liệu rồi xóa bản lưu tài khoản và các backup của tài khoản trên thiết bị. Bản khách có từ trước vẫn còn. IndexedDB không được mã hóa bằng mật khẩu riêng; người dùng chung profile trình duyệt có thể đọc bản offline.

## Logic dùng chung

- `shared/cycle/cycle-analysis.js`: tính trung bình, dự đoán và nhận xét từ lịch sử.
- `shared/cycle/period-records.js`: ghi nhận, kết thúc, chỉnh sửa và xóa kỳ kinh.
- `shared/cycle/cycle-model.js`: phân loại ngày và tạo dữ liệu lịch tháng.

Các module này chỉ xử lý dữ liệu, không truy cập DOM, tài khoản hay database. Backend import trực tiếp; frontend import từ `/shared/cycle/`, được Express phục vụ bằng route static riêng. Chỉ các thư mục `public` và `shared` được phục vụ công khai.

## Backend TypeScript

| Thư mục | Khi nào sửa |
| --- | --- |
| `server/src/modules/auth` | Đăng nhập, phiên, mật khẩu, khôi phục do quản trị viên |
| `server/src/modules/sync/schema.ts` | Kiểu dữ liệu và quy tắc kiểm tra |
| `server/src/modules/sync/repository.ts` | Cách lưu/đọc chu kỳ, nhật ký, profile |
| `server/src/modules/sync/routes.ts` | Giao thức đồng bộ |
| `server/src/modules/connections` | Mã mời, liên kết, giới hạn quyền chia sẻ |
| `server/src/common` | Lỗi, băm mật khẩu/token, rate limit |
| `server/src/db` | Kết nối PostgreSQL, giao dịch, migrations |
| `server/src/app.ts` | Ghép middleware, module API, static frontend |
| `server/src/config.ts` | Biến môi trường |

Ví dụ thêm triệu chứng mặc định: sửa danh sách trong `public/js/app.js` và giá trị mặc định trong `schema.ts`; triệu chứng được lưu dưới dạng chuỗi. Thêm cột database: tạo migration SQL mới với số thứ tự tiếp theo; không sửa file migration đã chạy. Tách bảng và module hiện có cho phép nâng cấp một chức năng mà không đổi bộ assets/giao diện.

## Quyết định triển khai

Một Node service phục vụ cả frontend và API, cùng một origin, cộng PostgreSQL. Điều này giảm cấu hình CORS, cookie liên miền và phần frontend phải thay. Backend dùng các module nhỏ, không cần microservices cho quy mô hiện tại.

Mật khẩu dùng scrypt với salt ngẫu nhiên và N=65536, r=8, p=1. Session/mã mời dùng token ngẫu nhiên, chỉ hash lưu database. PostgreSQL phân quyền truy cập qua server, không đưa DATABASE_URL ra frontend. Production dùng TLS bên ngoài qua Caddy và cookie Secure; cấu hình database TLS riêng nếu DB nằm trên mạng bên ngoài.

## Cập nhật an toàn tài khoản và dữ liệu

Client gửi `X-Cho-Em-Account` trên API dùng session. Server so sánh với UUID của cookie; thiếu hoặc lệch trả `409 ACCOUNT_CHANGED`. `/auth/me` dùng để khám phá phiên hiện tại. BroadcastChannel báo đổi phiên cho các tab cùng origin, dừng sửa/đồng bộ và giữ bản chưa đồng bộ theo tài khoản. Kiểm tra server vẫn bắt buộc khi không có BroadcastChannel.

Lần tải state đầu thất bại được thử lại khi có mạng, quay lại tab hoặc theo chu kỳ. `saveState` giữ transaction/revision, xóa những hàng đã bỏ và batch upsert các hàng còn lại. Số truy vấn không tăng theo số nhật ký.

`public/js/core/storage.js` quản lý IndexedDB; `shared/dates.js` xác định ngày Việt Nam; các module `calendar-page.js` và `journal-page.js` hiển thị lịch/nhật ký. Khôi phục JSON kiểm tra dữ liệu, xem trước, xác nhận và đặt nhật ký nhập vào riêng tư. File ICS không chứa nội dung nhật ký.

Migration 007 thêm trạng thái xác minh email và token tài khoản. Token chỉ lưu SHA-256, hạn 30 phút, dùng một lần và xử lý trong transaction khóa user. Reset thu hồi mọi session. Chỉ địa chỉ đã xác minh mới được gửi email reset. Người dùng chủ động bấm gửi thư; test và khởi động server không tự gửi email.

## Những phần còn cần phát triển trước khi mở rộng sử dụng công khai

- Web Push. Hiện nhắc qua file ICS, cần nhập vào ứng dụng lịch và cập nhật khi dự đoán thay đổi.
- Trang quản trị và chính sách lưu/xóa dữ liệu cho vận hành công khai. Người dùng đã có chức năng tự xóa tài khoản.
- Tích hợp giám sát, sao lưu tự động, kiểm thử khôi phục và đánh giá bảo mật trước khi đưa dữ liệu thật lên máy chủ.

Ứng dụng tính trung bình từ lịch sử thực tế, dùng mặc định chu kỳ 28 ngày và hành kinh 5 ngày khi chưa đủ dữ liệu. Ngày kết thúc ước tính được tách khỏi ngày do người dùng xác nhận. Dùng `npm test` cho unit/integration, `npm run test:e2e` cho Chromium; cần `TEST_DATABASE_URL` để chạy PostgreSQL. CI chạy TypeScript, các nhóm test và npm audit. Xem [UPDATES.md](UPDATES.md). Không tuyên bố mã nguồn đã được kiểm toán bảo mật hoặc đã chạy production.

## Tài liệu tham khảo

- Express security: https://expressjs.com/en/advanced/best-practice-security/
- PostgreSQL transactions in node-postgres: https://node-postgres.com/features/transactions
- Parameterized queries: https://node-postgres.com/features/queries
