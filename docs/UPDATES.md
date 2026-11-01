# Triển khai đề xuất review — 02/11/2026

## Cập nhật ứng dụng

```powershell
npm ci
npm run build
npm run db:migrate
npm start
```

Cần migration `007_account_recovery.sql` trước khi dùng bản mới. Với Docker, build lại app để container tự chạy migration. Không sửa migrations đã chạy và không dùng `docker compose down -v` khi cần giữ database.

## Tính năng

- **Nhiều tab:** API ràng buộc UUID tài khoản với session. Khi tab khác đổi tài khoản/đăng xuất, tab cũ dừng lưu và đồng bộ, giữ bản chưa đồng bộ để xuất JSON hoặc đăng nhập lại. BroadcastChannel giúp báo ngay; kiểm tra server vẫn hoạt động khi không có BroadcastChannel.
- **Tải lại sau lỗi:** lần GET state đầu thất bại không làm tài khoản kẹt ở trạng thái chưa tải. Thử lại qua nút Đồng bộ ngay, sự kiện online, quay lại tab hoặc bộ đếm định kỳ.
- **Khôi phục JSON:** mở Tài khoản → Khôi phục JSON. Hỗ trợ tài khoản và khách; tối đa 2 MB. Kiểm tra ngày, trường dữ liệu, giới hạn bản ghi và khoảng kỳ kinh; hiển thị số kỳ/nhật ký trước xác nhận. Lưu bản dự phòng tại thiết bị, giữ quyền chia sẻ hiện tại, đặt nhật ký nhập vào riêng tư và tính lại dự đoán. Không nhập `serverConflict` làm dữ liệu chính. Bản dự phòng cục bộ không thay thế bản xuất JSON độc lập.
- **Email:** mở Tài khoản → Gửi email xác minh. Sau xác minh, người dùng có thể bấm Quên mật khẩu ở form đăng nhập. Link giữ token trong fragment, hạn 30 phút, dùng một lần; reset thu hồi các session. Địa chỉ chưa xác minh cần liên hệ quản trị viên nếu mất mật khẩu. Đăng ký/khởi động app không tự gửi email.
- **Xóa tài khoản:** cần mật khẩu và nhập đúng `XÓA TÀI KHOẢN`. Server xóa user, profile, chu kỳ, nhật ký, forecast, phiên, token, lời mời, kết nối và không gian chung qua khóa ngoại. Xóa bản tài khoản/backups cục bộ trên trình duyệt hiện tại. File đã tải hoặc cache trên thiết bị khác không thể xóa từ xa.
- **Nhắc lịch:** Tài khoản → Nhắc lịch → chọn số ngày nhắc trước → tải `.ics` và nhập vào ứng dụng lịch. Chỉ một ngày dự kiến, tiêu đề trung tính, không có nhật ký hoặc triệu chứng. `CLASS:PRIVATE` là gợi ý cho ứng dụng lịch, không phải mã hóa. Cần tạo lại khi dự đoán đổi; báo nhắc phụ thuộc cài đặt ứng dụng lịch, không phải Web Push.

## Resend

Điền trên server, không đưa vào frontend hoặc commit:

```dotenv
RESEND_API_KEY=<API key của bạn>
EMAIL_FROM=Cho Em <mail@domain-da-xac-minh.example>
```

Hai biến đã có trong `.env.example` và Compose. Để trống để tắt gửi email; request xác minh trả `503 EMAIL_UNAVAILABLE`. Cần kiểm tra domain và quyền gửi trên tài khoản Resend. Adapter gọi [Resend Send Email](https://resend.com/docs/api-reference/emails/send-email) bằng fetch; test giả lập phản hồi, không gửi email thật. Dịch vụ nhận email người dùng và nội dung thư xác minh/reset, không nhận nhật ký.

## Kiểm thử

```powershell
npm run check
npm test
```

Không có `TEST_DATABASE_URL`, nhóm PostgreSQL sẽ được báo bỏ qua. Để chạy đầy đủ, dùng một PostgreSQL test riêng:

```powershell
$env:TEST_DATABASE_URL='postgresql://test_user:test_password@localhost:5432/choem_test'
npm test
npx playwright install chromium
npm run test:e2e
```

Test tạo schema ngẫu nhiên riêng rồi drop schema sau khi kết thúc. Không dùng `.env` production; không dùng dữ liệu tài khoản thật. Playwright tạo app riêng trên `127.0.0.1:8099`; không dùng lại server đang chạy. Trên Windows, nếu buộc dừng process trước khi teardown, schema test có thể còn trong database test và cần dọn riêng.

Kết quả kiểm chứng tại máy phát triển: 19 kiểm thử đơn vị/tích hợp đạt với PostgreSQL 17 tạm; 5 kiểm thử Chromium đạt. Bao phủ mất mạng lúc tải state, reload offline, hai tab đổi tài khoản, nâng cấp cache, khôi phục JSON, riêng tư nhật ký nhập, thao tác lịch/nhật ký sau khi tách module, tải ICS và xóa tài khoản. Build TypeScript đạt. npm kiểm tra 133 package khi cài dependency, không báo lỗ hổng. Chưa gửi email thật qua Resend hoặc chạy trên hạ tầng production.

CI `.github/workflows/ci.yaml` dùng PostgreSQL service, Node 24 và Chromium. Chạy TypeScript, unit/integration, browser và `npm audit --audit-level=high`. Kiểm tra trình duyệt dựa trên [Playwright Test configuration](https://playwright.dev/docs/test-configuration). Trace khi test lỗi có thể chứa dữ liệu test nên không dùng tài khoản thật.

## Hiệu năng và cấu trúc

`saveState` cập nhật profile một lần, xóa bản ghi không còn trong snapshot và batch upsert hai tập chu kỳ/nhật ký. Giữ nguyên transaction và revision, không ghi lại những hàng không đổi. Test 500 nhật ký kiểm tra số truy vấn dưới 20; đây là kiểm tra số truy vấn, không phải benchmark tải production.

Đã tách IndexedDB, giao diện lịch, nhật ký và công cụ tài khoản thành module riêng. Các vị trí tính ngày Việt Nam dùng chung `shared/dates.js`. Service Worker precache các module mới để các công cụ cục bộ hoạt động offline.
