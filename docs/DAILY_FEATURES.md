# Ghi chép hôm nay, hoàn tác và chia sẻ chủ động

## Cập nhật

Bản này cần migration `008_daily_checkin.sql`, `009_needs_text.sql` và `010_intimacy_days.sql`. Migration 009 thêm ô viết nhu cầu riêng; migration 010 lưu ngày quan hệ và hai quyền xem/chỉnh sửa riêng. Trên checkout chạy Node:

```powershell
npm run build
npm run db:migrate
npm start
```

Với Docker, build lại app để container tự chạy migration. Migration chỉ thêm cột/bảng, giữ bản ghi hiện có. Service Worker đã tăng phiên bản và precache các module mới. Đã sao lưu và chạy migration đến 010 trên database Docker local; chưa triển khai production. Nếu app đang chạy bằng `npm start`, dừng bằng Ctrl+C rồi khởi động lại để nạp backend mới.

## Ghi lại một ngày của Em

Nút **Ghi lại một ngày của Em** có ở Hôm nay và Lịch chu kỳ, thay tên cũ “Ghi nhanh hôm nay”. Biểu mẫu dành cho tâm trạng, triệu chứng từ gợi ý, mức đau 0–10 và lượng kinh. Đã bỏ ô “Những điều Em muốn ghi lại”; ghi chú và quyền chia sẻ nhật ký cũ vẫn được giữ, có thể chỉnh ở chi tiết ngày trong Lịch chu kỳ. Bấm **Cất vào nhật ký** để lưu. Mức đau để trống khác với mức 0. Lượng kinh gồm lấm tấm, ít, vừa, nhiều; ghi lượng kinh không tự tạo kỳ kinh.

Hỗ trợ tài khoản và khách, kể cả offline; dữ liệu tài khoản chờ đồng bộ khi có mạng. Mức đau/lượng kinh xuất hiện trong nhật ký và chi tiết ngày trên lịch. Không thay đổi công thức dự đoán hoặc suy diễn nhu cầu từ chu kỳ.

## Hoàn tác

Sau khi lưu ghi chép hoặc nhu cầu, xóa nhật ký hoặc thêm/sửa/xóa khoảng kỳ kinh, thanh **Hoàn tác** xuất hiện trong một phút. Chỉ giữ thao tác gần nhất trong phiên hiện tại; không giữ qua tải lại trang hoặc đổi tài khoản.

Chỉ khôi phục nhật ký hoặc tập khoảng kỳ kinh liên quan, giữ các nội dung khác và quyền chia sẻ hiện tại. Từ chối nếu phần dữ liệu đó đã được sửa tiếp, tài khoản thay đổi, hết hạn hoặc đang có xung đột. Nhật ký khôi phục được đặt riêng tư, gồm cả nhu cầu; Em có thể chủ động chia sẻ lại. Nội dung đối phương đã đọc hoặc tự lưu không thể thu hồi bằng hoàn tác.

## Anh đang thấy gì?

Em mở **Người đồng hành → Anh đang thấy gì?**, chọn tháng và chuyển giữa Chu kỳ và lịch / Em chia sẻ. Bản xem trước lấy dữ liệu đã đồng bộ từ máy chủ, dùng đúng bộ lọc của API người đồng hành. Cần đăng nhập và có mạng; nếu còn lỗi đồng bộ hoặc xung đột, cần xử lý trước.

Đã bỏ khung “Quyền riêng tư của Em”. Hai nút xem trước/tạm dừng được đặt gọn ngay trong phần **Em chọn điều muốn chia sẻ**. Bật/tắt các mục cập nhật tại chỗ, giữ nguyên vị trí trang. Khi tắt Nhật ký, đóng hộp thoại bằng dấu X, Escape hoặc bấm bên ngoài được hiểu là **giữ lại nhật ký cũ**; chỉ nút **Ẩn tất cả nhật ký cũ** mới đổi quyền của những trang đã chia sẻ.

Quyền **Triệu chứng, mức đau và lượng kinh** kiểm soát cả ba nhóm dữ liệu cơ thể. Chia sẻ nhật ký từng ngày không tự chia sẻ mức đau/lượng kinh hoặc nhu cầu.

## Tạm dừng chia sẻ

Trong Người đồng hành, bấm **Tạm dừng mọi chia sẻ cá nhân**. Máy chủ ngừng trả chu kỳ, cảm xúc, triệu chứng, mức đau, lượng kinh, nhật ký và nhu cầu. Các lựa chọn và bản ghi vẫn giữ nguyên để có thể **Tiếp tục chia sẻ theo lựa chọn cũ**.

Tên, kết nối, lời nhắn Anh gửi và ngày bên nhau vẫn được giữ. Nội dung Anh đã đọc hoặc tự lưu không thể xóa từ xa. Thay đổi quyền cần mạng và xác nhận từ máy chủ. PUT snapshot thông thường không thể bật/tắt tạm dừng; chỉ PATCH quyền chia sẻ thực hiện được. Anh nhận thay đổi ở lần tải lại tiếp theo hoặc làm mới định kỳ.

## Hôm nay Em cần gì?

Nút **Hôm nay Em cần gì?** mở hộp thoại riêng, không mở biểu mẫu ghi nhật ký nữa. Chọn **Muốn được lắng nghe**, **Cần nghỉ ngơi**, **Muốn có người bên cạnh**, hoặc tự viết điều mình cần (tối đa 500 ký tự). Có thể chỉ viết, không cần chọn mục có sẵn. Lưu nhu cầu không thay đổi ghi chép cơ thể/nhật ký; lưu nhật ký cũng giữ nguyên nhu cầu đã ghi.

Chỉ khi đánh dấu **Gửi điều này cho Anh trong hôm nay** và bấm **Lưu điều Em cần**, Anh đã kết nối mới đọc được sau đồng bộ. Không mặc định gửi cho ngày mới; khách chỉ lưu riêng trên thiết bị. Ô tự viết tuân theo cùng quyền chia sẻ, tạm dừng và giới hạn trong ngày như các lựa chọn có sẵn.

Anh xem ở **Em chia sẻ** của ngày hiện tại. Nhu cầu không phụ thuộc quyền nhật ký/triệu chứng nhưng bị chặn khi tạm dừng. Sang ngày mới theo giờ Việt Nam, API không trả nhu cầu ngày cũ. Em vẫn xem được lịch sử trong nhật ký cá nhân. Để thu hồi trong ngày, bỏ đánh dấu gửi hoặc bỏ mọi lựa chọn rồi lưu và đồng bộ. Không tự gửi email hoặc Web Push.

## Ghi nhận ngày quan hệ

Em mở **Lịch chu kỳ**, chọn ngày rồi dùng **Ghi nhận ngày quan hệ** hoặc **Bỏ ghi nhận ngày quan hệ** nằm cùng hàng với nút ghi nhận kỳ kinh, không có khung/chú thích riêng. Ký hiệu ♡ đánh dấu ngày đã ghi; chỉ ghi ngày hôm nay hoặc quá khứ. Mỗi ngày có một trạng thái ghi nhận, không đếm số lần. Dữ liệu này lưu riêng với nhật ký và không làm thay đổi dự đoán chu kỳ. Khách và Em có thể lưu offline; dữ liệu tài khoản cần đồng bộ để Anh thấy.

Trong **Người đồng hành**, hai quyền mặc định đều tắt:

- **Chia sẻ ngày quan hệ**: Anh xem được ngày đã ghi trên lịch chia sẻ.
- **Cho Anh chỉnh sửa ngày quan hệ**: chỉ bật sau quyền xem; cho phép Anh thêm/bỏ ngày ở mục Em chia sẻ sau khi chọn ngày trên lịch. Anh cần có mạng.

Chia sẻ nhật ký/triệu chứng không tự bật hai quyền này. Tắt quyền xem tự thu hồi quyền sửa. Tạm dừng chia sẻ chặn cả xem và sửa. Ngắt kết nối thu hồi quyền sửa; kết nối mới phải được cấp lại. Server kiểm tra quyền trong transaction, nên trang Anh đang mở trước khi bị thu hồi cũng không thể tiếp tục sửa. Hai bên sửa đồng thời được kiểm tra revision, tránh ghi đè dữ liệu cũ. Bản xem trước chỉ cho xem, không chỉnh sửa.

## Kiểm thử bản có lịch quan hệ

- 35 kiểm thử đơn vị/tích hợp đạt với PostgreSQL 17 tạm: quyền xem/sửa ngày quan hệ, kiểm tra revision, thu hồi quyền, bảo toàn dữ liệu và cập nhật quyền không dựng lại trang.
- Bộ Chromium kiểm tra màn hình điện thoại, hai nút ghi nhận cùng hàng, vị trí cuộn khi đổi quyền, ba cách đóng hộp thoại giữ nhật ký cũ và nút ẩn nhật ký cũ khi được chọn rõ ràng.
- Test dùng schema riêng trong database tạm; không thay đổi dữ liệu ứng dụng thật.
