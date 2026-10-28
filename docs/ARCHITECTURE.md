# Cấu trúc và cách thay đổi code

## Giữ các chỉnh sửa của bản ZIP gửi ngày 28/10/2026

- Giữ nội dung và bố cục giao diện hiện có.
- Phần Lắng nghe cơ thể vẫn ở Lịch chu kỳ, gắn với ngày được chọn.
- Các ngày có trạng thái cơ thể/ghi chú vẫn có dấu đánh dấu.
- Trang Hôm nay vẫn ghi cảm xúc nhanh, không thêm lại khối ghi chú đã bỏ.
- Giữ nguyên toàn bộ hình ảnh từ bản đính kèm.

## Frontend

- `dist/app.js`: logic hiển thị đang có, đã nối adapter dữ liệu. Không chuyển framework để tránh viết lại các chỉnh sửa của người dùng.
- `dist/js/api.js`: gọi API cùng origin, timeout, chuẩn hóa lỗi; không dùng token trong localStorage.
- `dist/js/cloud.js`: đọc/lưu IndexedDB, hàng đợi snapshot bền vững, revision, xung đột, tài khoản và xuất JSON.
- `dist/js/account.js`: đăng ký/đăng nhập, đổi mật khẩu, nhập dữ liệu khách, xử lý xung đột, đăng xuất.
- `dist/js/connections.js`: tạo/nhận mã và QR, quyền chia sẻ, trạng thái của người đồng hành.
- `dist/sw.js`: chỉ cache tài nguyên app trong allowlist; không cache API hoặc URL chứa query. Cache phiên bản mới dọn cache Cho Em cũ sau khi activate.

Dữ liệu khách giữ ở khóa `state` để tương thích bản cũ. Dữ liệu tài khoản giữ ở khóa `account:<id>`, kèm revision và dirty flag. Mỗi tài khoản tách khóa; dữ liệu khách không tự tải lên sau đăng nhập. Nhập khách là thao tác riêng và giữ quyền chia sẻ tài khoản hiện tại.

Khi offline, người đã đăng nhập có thể ghi trên bản lưu tài khoản. Ghi mới được lưu local trước, rồi thử đồng bộ khi online, khi quay lại tab và mỗi 30 giây khi tab đang mở. Hệ thống không hứa chạy đồng bộ khi app đã đóng. Chưa đăng nhập vẫn dùng được local.

Nếu đang có bản ghi chưa lưu trong ô nhập, background pull không thay giao diện. Nếu có chỉnh sửa mới trong lúc upload, bản mới giữ dirty và được gửi với revision đã được server xác nhận. Phiên hết hạn không xóa dữ liệu đang chờ; đăng nhập lại cùng tài khoản để tiếp tục.

Đăng xuất cần đồng bộ hết dữ liệu rồi xóa bản lưu tài khoản và các backup của tài khoản trên thiết bị. Bản khách có từ trước vẫn còn. IndexedDB không được mã hóa bằng mật khẩu riêng; người dùng chung profile trình duyệt có thể đọc bản offline.

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

Ví dụ thêm triệu chứng mới: sửa danh sách trong `dist/app.js` và enum `symptoms` trong `schema.ts`, bổ sung test nếu có quy tắc mới. Thêm cột database: tạo migration SQL mới `002_...sql`; không sửa file migration đã chạy. Tách bảng và module hiện có cho phép nâng cấp một chức năng mà không đổi bộ assets/giao diện.

## Quyết định triển khai

Một Node service phục vụ cả frontend và API, cùng một origin, cộng PostgreSQL. Điều này giảm cấu hình CORS, cookie liên miền và phần frontend phải thay. Backend dùng các module nhỏ, không cần microservices cho quy mô hiện tại.

Mật khẩu dùng scrypt với salt ngẫu nhiên và N=65536, r=8, p=1. Session/mã mời dùng token ngẫu nhiên, chỉ hash lưu database. PostgreSQL phân quyền truy cập qua server, không đưa DATABASE_URL ra frontend. Production dùng TLS bên ngoài qua Caddy và cookie Secure; cấu hình database TLS riêng nếu DB nằm trên mạng bên ngoài.

## Những phần còn cần phát triển trước khi mở rộng sử dụng công khai

- Xác minh email và quy trình quên mật khẩu tự phục vụ qua email (hiện có CLI khôi phục cho quản trị viên).
- Web Push, nhắc lịch nền và thông báo khi ứng dụng đóng.
- Tự động tính độ dài chu kỳ từ lịch sử; hiện vẫn dùng thông số cá nhân đã cài đặt.
- Tự nhập file JSON backup vào UI (đã có xuất JSON và nhập dữ liệu khách IndexedDB).
- Trang quản trị, chức năng tự xóa tài khoản và chính sách lưu/xóa dữ liệu.
- Tích hợp giám sát, sao lưu tự động, kiểm thử khôi phục và đánh giá bảo mật trước khi đưa dữ liệu thật lên máy chủ.

Không tuyên bố mã nguồn đã được kiểm toán bảo mật hoặc đã chạy production. Xem TESTING.md để biết kiểm tra thực tế và giới hạn môi trường.

## Tài liệu tham khảo

- Express security: https://expressjs.com/en/advanced/best-practice-security/
- PostgreSQL transactions in node-postgres: https://node-postgres.com/features/transactions
- Parameterized queries: https://node-postgres.com/features/queries
