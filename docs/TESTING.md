# Kiểm thử và giới hạn xác minh

## Đã chạy

- `npm test`: **11/11 test qua**.
- `npm run check`: TypeScript kiểm tra kiểu qua.
- `npm run build`: biên dịch backend thành công.
- `node --check` cho app.js, các module frontend mới và Service Worker: qua.

Nhóm API chạy ứng dụng Express thật, middleware và SQL migrations/repository trên PGlite (PostgreSQL nhúng cho test). HTTP dùng light-my-request để đưa request trực tiếp vào Express, không cần mở cổng mạng. Đây không phải mock dữ liệu repository.

Các tình huống:

1. Đăng ký/đăng nhập, từ chối chưa xác thực, chặn Origin lạ, cookie và header an toàn.
2. Cách ly dữ liệu hai tài khoản, revision, xóa dữ liệu và đọc lại.
3. Từ chối ngày không có thật, tương lai, kỳ chồng ngày, số ngày và ghi chú không hợp lệ.
4. QR/mã mời hash, dùng một lần, chặn tự kết nối; lọc quyền chia sẻ ở response server; chỉ xem ngày hiện tại; ngắt kết nối và truy cập trái phép.
5. Tạo lời mời mới vô hiệu hóa mã cũ; mã hết hạn hoặc đã hủy không dùng được.
6. Đổi mật khẩu thu hồi phiên cũ; logout vô hiệu hóa cookie.
7. Hai request cùng revision: một thành công, một nhận 409.
8. Rate limit dùng database.
9. Người dùng sửa tiếp trong lúc upload: bản mới được gửi với revision được xác nhận, không mất thay đổi.
10. Xung đột: giữ bản offline và ngừng tự retry ghi đè.
11. Mất mạng: giữ hàng đợi, không báo đồng bộ thành công.

## Chưa chạy trong môi trường tạo file

- Không có Docker daemon/psql nên chưa build/run Docker image, Compose hoặc PostgreSQL service bên ngoài. PGlite không thay thế kiểm thử vận hành của pg.Pool, TCP/TLS và PostgreSQL production.
- Chưa deploy lên VPS/domain thật, chưa cấp chứng chỉ thực tế.
- Chưa chạy kiểm thử toàn bộ giao diện mới trên trình duyệt/điện thoại thật; chưa xác nhận cài PWA và offline thực tế sau bản nâng cấp backend.
- Chưa load test, audit bảo mật hoặc kiểm thử phục hồi backup trên hạ tầng thật.

## Checklist kiểm thử thủ công sau khi chạy

- Mở http://localhost:8080, đăng ký A, ghi ngày kinh và ghi chú trong Lịch chu kỳ. Tải lại trang rồi kiểm tra dữ liệu.
- Đăng nhập cùng A bằng trình duyệt khác: thấy dữ liệu server. Sửa trên hai tab khi một tab offline, kết nối lại: phải hiện xung đột, không tự mất bản cũ.
- Đăng xuất: tài khoản chuyển về dữ liệu khách, bản local của A bị xóa sau khi đã đồng bộ.
- Tài khoản B trên trình duyệt khác nhận lời mời từ A. Chưa bật quyền thì không thấy các trường riêng tư. Bật/tắt từng quyền và làm mới phía B để kiểm tra.
- Ngắt kết nối: B không đọc được summary qua API nữa.
- Thử QR trên domain HTTPS; QR localhost không mở được backend máy tính trên điện thoại.
- Mở app online cho Service Worker cache xong, tắt mạng, ghi nhật ký, tải lại; bật mạng và đợi đồng bộ.
- Kiểm tra /api không xuất hiện trong Cache Storage của trình duyệt.
- Đổi mật khẩu: thiết bị khác cần đăng nhập lại; dữ liệu pending ở thiết bị đó không tự xóa.
- Thử backup/restore trên môi trường thử nghiệm trước khi dùng dữ liệu cá nhân thật.
