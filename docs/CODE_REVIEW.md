# Kết quả rà soát mã nguồn — 02/11/2026

## Lỗi đã sửa

| Mức độ | Vị trí | Lỗi và cách sửa |
| --- | --- | --- |
| Vừa | `public/js/core/cloud.js` | Chỉ nhận dữ liệu từ GET `/state` khi revision thay đổi. Máy chủ có thể tự tính ngày kết thúc hoặc bổ sung forecast mà không tăng revision, khiến bản cục bộ bỏ qua thay đổi. So sánh thêm nội dung state; vẫn kiểm tra sequence, dirty và bản nháp trước khi nhận dữ liệu. |
| Vừa | `server/src/modules/sync/schema.ts` | Ước tính chưa có ngày kết thúc có thể vượt sang kỳ sau nhưng vẫn qua validation; khi tự kết thúc sẽ tạo khoảng chồng nhau. Kiểm tra ngày kết thúc suy ra từ thời lượng với ngày bắt đầu kỳ tiếp theo. |
| Vừa | `server/src/modules/connections/service.ts` | `inPeriod` chỉ xét có ngày kết thúc hay chưa. Khi tự điền ngày kết thúc ước tính còn ở tương lai, phần chia sẻ báo đã hết kỳ dù lịch vẫn ghi nhận ngày hiện tại nằm trong kỳ. Xét thêm ngày hiện tại so với ngày kết thúc, bao gồm ngày cuối. |
| Vừa | `compose.yaml` | Hướng dẫn chạy backend bằng Node và database bằng Docker dùng `localhost:5432`, nhưng database không publish cổng. Bổ sung cổng 5432 chỉ trên loopback cho Compose local. File Compose production riêng không thay đổi. |

Đã đổi tên cache Service Worker để bản frontend sửa lỗi có bộ cache mới.

## Dọn dẹp và cấu trúc

- Xóa hai thư mục rỗng `dist/assets` và `dist`. Thêm `dist/` vào Git ignore và Docker ignore để tránh đưa output cũ vào source hoặc build context.
- Không tìm thấy ảnh không được tham chiếu khi đối chiếu tên file với nguồn frontend; một số tên được tạo động nên không thể chỉ tìm nguyên đường dẫn để kết luận file dư.
- Giữ SQL migrations, package lock, thư viện QR và giấy phép: đây là thành phần cần thiết để triển khai và tái tạo ứng dụng.
- Cấu trúc `public`, `shared`, `server`, `docs` đã phù hợp quy mô hiện tại; chưa có lý do để di chuyển hàng loạt file.

## Kiểm chứng

- `npm run check`: đạt.
- `npm test`: build backend và chạy 5 test, tất cả đạt.
- `node --check`: đạt với 24 file JavaScript trong `public` và `shared`.
- `git diff --check`: không có lỗi khoảng trắng.
- Test bao phủ trạng thái chia sẻ ở trước/đúng/sau ngày kết thúc ước tính; lọc trường riêng tư; chặn kỳ ước tính chồng nhau; nhận dữ liệu cùng revision; bảo toàn thay đổi cục bộ khi GET đang chờ.

Chưa chạy kiểm thử với PostgreSQL thật, Docker stack hoặc trình duyệt. Các kiểm tra trên không chứng minh toàn bộ luồng đăng nhập, migration, camera và offline hoạt động thực tế. Chưa kiểm tra lỗ hổng dependency qua cơ sở dữ liệu trực tuyến.

## Đề xuất ban đầu

**Đã triển khai trong bản cập nhật tiếp theo.** Danh sách dưới đây giữ nội dung đề xuất ban đầu; hướng dẫn sử dụng, cấu hình và kiểm thử mới nằm tại [UPDATES.md](UPDATES.md). Phần kiểm chứng phía trên ghi nhận thời điểm review ban đầu.

1. **Ưu tiên cao: ràng buộc tài khoản khi gọi API và phối hợp nhiều tab.** Session cookie được dùng chung giữa các tab, còn `Cloud.user` được giữ riêng trong bộ nhớ mỗi tab. Nếu một tab chuyển tài khoản, tab cũ có thể tiếp tục gửi dữ liệu với cookie tài khoản mới. Revision không đại diện cho danh tính tài khoản. Nên kiểm tra danh tính dự kiến ở server và báo đổi tài khoản qua `BroadcastChannel`, kèm test hai tab/hai tài khoản.
2. **Ưu tiên cao: kiểm thử tích hợp dữ liệu và quyền truy cập.** Dùng PostgreSQL tạm để kiểm tra migration, cạnh tranh revision, chấp nhận mã mời đồng thời, thu hồi chia sẻ và ngắt kết nối. Bổ sung kiểm thử trình duyệt cho mất mạng, đăng nhập lại, nhiều tab và nâng cấp Service Worker.
3. **Độ bền đồng bộ:** `Cloud.attach()` gán user trước khi tải state. Nếu lần tải đầu thất bại và chưa có cache tài khoản, envelope vẫn rỗng, còn `sync()` hiện bỏ qua trường hợp này. Nên có trạng thái tải/thử lại rõ ràng và test mất mạng đúng thời điểm đăng nhập.
4. **Bảo trì:** tách lớp lưu IndexedDB và phần lịch/nhật ký khỏi `public/js/app.js` khi tiếp tục mở rộng. Đưa hàm ngày Việt Nam đang lặp ở nhiều module vào một module dùng chung. Thiết lập CI chạy check, test và kiểm tra dependency.
5. **Hiệu năng:** `saveState()` xóa rồi chèn lại toàn bộ chu kỳ và nhật ký bằng nhiều truy vấn tuần tự. Khi lịch sử tăng, nên dùng batch/upsert hoặc API cập nhật từng phần; đo trước khi thay đổi.
6. **Tính năng:** xác minh email và khôi phục mật khẩu tự phục vụ; nhập bản sao JSON có kiểm tra schema, xem trước và xác nhận; xóa tài khoản/dữ liệu chủ động; nhắc lịch tùy chọn. Các chức năng này cần thiết kế quyền riêng tư và hành vi offline trước khi triển khai.
