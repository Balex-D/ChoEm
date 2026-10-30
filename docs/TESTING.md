# Kiểm thử và giới hạn xác minh

## Đã chạy

- `npm test`: **43/43 test qua** (bao gồm kéo khoảng ngày, bắt đầu/kết thúc, mặc định nhật ký, QR và vòng đời camera).
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
12. Giải mã ảnh QR do API tạo, không chứa UUID Em, lấy mã để gửi liên kết; UUID sai trong payload cũ, QR sai origin/phiên bản hoặc không đủ trường bị từ chối.
13. Chặn tài khoản đã liên kết, mã đã dùng và hai yêu cầu đồng thời; chỉ một quan hệ được tạo.
14. Camera dùng fixture video/MediaStream: giải mã khung hình QR thật, dừng track trước khi trả kết quả, dừng cả khi người dùng đóng hộp thoại trong lúc chờ quyền, và hiển thị cách nhập mã nếu từ chối camera.
15. Mã 6 ký tự A–Z/0–9, chuẩn hóa chữ thường; UUID database giữ nguyên, mã mới hết hạn sau 2 phút. Cưỡng bức trùng mã để xác minh cấp lại mã khác và rollback giữ mã cũ nếu hết lượt thử sinh mã.
16. Chặn dò mã theo cả tài khoản và IP, hết cửa sổ giới hạn được thử lại; vẫn dùng được mã dài trước đây tới khi hết hạn.
17. View Anh chỉ render nhóm được Em cho phép trong cả 8 tổ hợp quyền; nội dung ghi chú được escape. Đồng hồ kiểm thử xác minh 02:00 → 01:59 → hết hạn, xóa QR/mã và khóa sao chép; không render UUID.

## Chưa chạy trong môi trường tạo file

- Các test tự động database dùng PGlite. Việc kiểm thử vận hành pg.Pool, TCP/TLS và PostgreSQL production cần thực hiện riêng.
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
- Em tạo QR → kiểm tra không có UUID và có đếm ngược 2 phút → Anh đăng nhập → Quét QR → Gửi yêu cầu liên kết. Anh chỉ thấy phần kết nối trước khi liên kết; sau đó chỉ thấy các mục Em cho phép. Tắt quyền phía Em và kiểm tra phần tương ứng biến mất ở Anh trong lần cập nhật tiếp theo (15 giây). Thử mã hết hạn, QR của website khác, từ chối quyền camera, đóng hộp thoại và chuyển ứng dụng khi đang quét; đèn camera phải tắt. Chưa xác minh camera trên thiết bị vật lý.
- Mở app online cho Service Worker cache xong, tắt mạng, ghi nhật ký, tải lại; bật mạng và đợi đồng bộ.
- Kiểm tra /api không xuất hiện trong Cache Storage của trình duyệt.
- Đổi mật khẩu: thiết bị khác cần đăng nhập lại; dữ liệu pending ở thiết bị đó không tự xóa.
- Thử backup/restore trên môi trường thử nghiệm trước khi dùng dữ liệu cá nhân thật.

## Chia sẻ lịch và nhật ký

- Kiểm thử API tháng, phân quyền độc lập lịch/tâm trạng/triệu chứng/nhật ký; nhật ký ẩn không xuất hiện trong payload.
- Kiểm tra đủ 16 tổ hợp quyền, xung đột revision khi đổi quyền từng bài, ngày kết thúc thực tế dài hơn mặc định và xóa kỳ kinh giữ nguyên nhật ký.

## Ghi nhận kỳ kinh bằng kéo và nút hành động

- Model kiểm thử: khoảng ngày tính cả hai đầu, kéo ngược, qua tháng, hợp nhất trùng/liền nhau, chỉnh ngày cuối, xóa mà giữ nhật ký, trạng thái đang ghi nhận sau serialize/reload và từ chối ngày tương lai/không hợp lệ.
- Ví dụ dữ liệu thực tế 03/09–07/09 và 01/10–05/10 cho trung bình chu kỳ 28 ngày, hành kinh 5 ngày, dự kiến 29/10–02/11. Một kỳ đơn lẻ không tự tạo dự báo.
- Đã kiểm thử Chrome headless thật ở màn hình 1280×1100 và touch emulation 430×932: giữ/kéo, preview, giữ mép lịch chuyển tháng, thu ngắn khoảng cũ, xóa, vị trí nút dưới ngày và trên ghi chú, bắt đầu, tải lại và kết thúc hôm nay. Tài khoản thử riêng đã được xóa sau kiểm tra.
- Touch emulation chưa thay thế kiểm tra trên điện thoại vật lý, đặc biệt Safari/iOS.

## Phân tích tự động theo prompt.pdf

- 43 test qua, bổ sung kiểm tra không có mặc định khi thiếu dữ liệu, tối đa 6 khoảng chu kỳ/kỳ hoàn tất, làm tròn, loại kỳ đang diễn ra, ngưỡng nhận xét và snapshot trước thời điểm bắt đầu thực tế.
- Migration thử trên database đã có cấu hình cũ, kỳ kinh và nhật ký: bỏ hai cột cấu hình, giữ nguyên lịch sử, tên và quyền chia sẻ; request cũ có length/duration vẫn nhận nhưng bỏ qua. Client không thể giả mạo forecast đã lưu bằng JSON gửi lên.
- Kiểm thử Chrome headless desktop và bố cục 430×932: rỗng hiển thị bốn chỉ số --; modal chỉ giữ tên; dữ liệu thực tế cho trung bình 28/5 và dự kiến đúng 24/04–28/04; hai biểu đồ có đúng số quan sát, loại kỳ chưa kết thúc; một kỳ hoàn tất chỉ tính được ngày hành kinh, không sinh chu kỳ hoặc dự báo. Không tràn ngang trên bố cục điện thoại.
- Đối chiếu SHA-256 của toàn bộ hàng cycles/journal_entries trước và sau migration trên localhost trùng khớp. Tài khoản Chrome thử nghiệm đã được dọn, không thay lịch sử hay tài khoản có sẵn.
