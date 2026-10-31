# Cho Em — Full-stack PWA

Bổ sung backend vào đúng bản `Cho-Em-main.zip` đã chỉnh sửa. Giữ phong cách doodle, assets, vị trí phần Lắng nghe cơ thể trong lịch và dấu ghi chú trên từng ngày.

**Bắt đầu dễ nhất:** đọc phần 2 để chạy cả app và database bằng Docker. Deploy thật qua domain HTTPS: xem [docs/DEPLOY.md](docs/DEPLOY.md).

## 1. Những gì đã có

- Giao diện hiện có + tài khoản đăng ký/đăng nhập/đăng xuất/đổi mật khẩu.
- PostgreSQL: lưu profile, chu kỳ, nhật ký, phiên đăng nhập và kết nối.
- IndexedDB giữ dữ liệu offline, tách theo tài khoản; đồng bộ lại khi mở app có mạng.
- Kiểm tra revision, chặn ghi đè khi nhiều thiết bị sửa; màn hình chọn bản dữ liệu và xuất JSON dự phòng.
- Nhập dữ liệu khách trên trình duyệt vào tài khoản khi người dùng chủ động chọn.
- Mã mời/QR thật, mã dùng một lần, hạn 2 phút, kết nối hai tài khoản và ngắt kết nối.
- Chọn quyền chia sẻ chu kỳ, tâm trạng, ghi chú/triệu chứng; server lọc dữ liệu trước khi gửi người đồng hành.
- Backend TypeScript chia module; SQL migration có kiểm tra checksum; Dockerfile, Compose local và production HTTPS.
- 11 kiểm thử API/đồng bộ đã chạy qua; chi tiết và giới hạn tại [docs/TESTING.md](docs/TESTING.md).

Ứng dụng hiện tính độ dài chu kỳ và số ngày hành kinh trung bình từ tối đa 6 mẫu gần nhất, làm tròn đến ngày nguyên, để ước tính kỳ tiếp theo.

**Chưa có:** email xác minh/khôi phục tự phục vụ, Web Push/nhắc lịch khi app đóng. Có CLI đổi mật khẩu cho quản trị viên. Bản này chưa được deploy lên máy chủ thật hoặc kiểm toán bảo mật.

## 2. Chạy nhanh trên máy với Docker

Yêu cầu Docker Desktop đang chạy và có Docker Compose. Không cần cài Flutter hoặc Node.js nếu chỉ dùng Docker.

Giải nén, mở PowerShell **tại thư mục chứa `compose.yaml`**, chạy:

```powershell
Copy-Item .env.example .env
docker compose up --build -d
```

Sau khi các service chạy, mở **http://localhost:8080**. App container tự build TypeScript, chạy migration và khởi động. Lần đầu cần tải image và package; có thể mất vài phút.

Kiểm tra:

```powershell
docker compose ps
docker compose logs -f app
```

Dừng app:

```powershell
docker compose down
```

Lệnh `down` giữ volume database. **Không dùng `down -v` nếu muốn giữ dữ liệu** vì `-v` xóa volume.

Nếu cổng 8080 đã dùng: đổi port bên trái trong Compose và đổi `APP_ORIGIN` tương ứng; hoặc dừng ứng dụng đang dùng cổng. Dùng nhất quán `localhost:8080`, không đổi qua `127.0.0.1` khi đăng nhập vì origin khác nhau.

## 3. Chạy để sửa code bằng Node.js

Yêu cầu Node.js >=22.16 (Dockerfile dùng Node 24) và PostgreSQL. Nếu có Docker, dùng nó cho database:

```powershell
Copy-Item .env.example .env
docker compose up -d db
npm ci
npm run db:migrate
npm run dev
```

Mở http://localhost:8080. `npm run dev` tự khởi động lại khi code server thay đổi; sửa HTML/CSS/JS frontend rồi refresh trình duyệt. Không dùng VS Code Live Server để chạy bản full-stack vì Live Server không phục vụ API.

Nếu PostgreSQL đã cài riêng, bỏ qua bước `docker compose up -d db`, tạo database rồi sửa `DATABASE_URL` trong `.env`.

Lệnh kiểm tra và chạy bản build:

```powershell
npm test
npm run check
npm run build
npm start
```

Build chỉ biên dịch backend sang `server/build`; frontend trong `dist` đã là HTML/CSS/JS có thể phục vụ trực tiếp.

## 4. Dùng tài khoản và kết nối thật

1. Bấm avatar góc trên để đăng ký hai tài khoản riêng trong tab Em và Anh. Mật khẩu tối thiểu 6 ký tự và phải nhập lại khớp nhau.
2. Mỗi tài khoản lưu dữ liệu riêng. Nếu đã có dữ liệu khách trên cùng trình duyệt/domain, mở Tài khoản → Nhập dữ liệu khách trên thiết bị. Đây là thao tác thay thế, có cảnh báo trước.
3. Trên tài khoản chính, mở Người đồng hành → Tạo mã mời và QR. Chỉ gửi mã cho đúng người muốn kết nối.
4. Tài khoản Anh đăng nhập trên trình duyệt/thiết bị khác, mở Người đồng hành → Quét QR bằng camera → Gửi yêu cầu liên kết. Có thể mở link QR hoặc dán mã thủ công. QR chỉ chứa mã mời, không chứa UUID Em; backend tự ánh xạ mã về tài khoản. Camera cần HTTPS hoặc localhost, hình ảnh không gửi lên máy chủ.
5. Tài khoản chính bật từng mục muốn chia sẻ. Mặc định mọi cờ của tài khoản mới đều tắt. Người đồng hành chỉ đọc được ngày hiện tại.
6. Đổi dữ liệu rồi bấm Làm mới ở góc người đồng hành để xem cập nhật. Bản thân dữ liệu của chủ tài khoản được đồng bộ tự động khi tab đang mở.
7. Có thể ngắt kết nối từ một trong hai phía.

Ở localhost, hai tài khoản có thể thử bằng trình duyệt thường và cửa sổ riêng tư. Để QR mở trên điện thoại khác, cần deploy lên domain HTTPS truy cập được từ thiết bị đó; QR chứa localhost sẽ chỉ trỏ đến chính thiết bị quét.

### Ghi nhận kỳ kinh bằng nút bấm

Chức năng áp dụng cho cả dữ liệu trên thiết bị và dữ liệu đồng bộ theo tài khoản. Sau khi cập nhật mã nguồn, chạy `npm run db:migrate` để bổ sung trường lưu thời lượng ước tính trước khi khởi động backend.

Người dùng chọn ngày bắt đầu và bấm **Ghi nhận kỳ kinh**. Ứng dụng sử dụng **số ngày hành kinh trung bình của chính người dùng**, không dùng độ dài chu kỳ, để xác định ngày kết thúc dự kiến:

```text
Ngày kết thúc dự kiến = Ngày bắt đầu + Số ngày hành kinh trung bình − 1
```

Số ngày hành kinh được tính bao gồm cả ngày bắt đầu và ngày kết thúc. Ngày hiện tại được xác định theo múi giờ Việt Nam.

**Dữ liệu ban đầu:** khi chưa có lịch sử đủ để tính trung bình, sử dụng **5 ngày hành kinh** và **chu kỳ 28 ngày**. Khi có dữ liệu thực tế hợp lệ, thay các giá trị mặc định bằng trung bình từ lịch sử của người dùng. Các giá trị mặc định không được tạo thành bản ghi kỳ kinh thực tế.

**Kỳ kinh còn đang diễn ra:**

- Nếu ngày kết thúc dự kiến nằm trong tương lai, tô hồng các ngày từ ngày bắt đầu đến hôm nay. Các ngày từ ngày mai đến ngày kết thúc dự kiến hiển thị theo kiểu **ngày kinh dự kiến**.
- Ngày dự kiến chưa diễn ra không được ghi nhận thành ngày hành kinh thực tế.
- Nếu kỳ kinh kéo dài hơn số ngày trung bình, tiếp tục tô hồng các ngày đã diễn ra khi kỳ kinh còn mở. Trong khoảng sau thời lượng trung bình đến hết ngày thứ 7 của kỳ kinh, nút ghi nhận chuyển thành **Kết thúc kỳ kinh** để người dùng xác nhận ngày kết thúc thực tế.
- Ngày thứ 7 được tính từ ngày bắt đầu, với ngày bắt đầu là ngày thứ 1. Sau khi hết ngày thứ 7 (từ ngày thứ 8), nếu người dùng vẫn chưa ghi nhận ngày kết thúc, tự đặt số ngày hành kinh của kỳ này bằng số ngày hành kinh trung bình đã dùng khi ghi nhận bắt đầu; nếu chưa có trung bình thì dùng 5 ngày.
- Khi tự kết thúc, ngày kết thúc bằng ngày bắt đầu cộng số ngày hành kinh trung bình trừ 1. Cập nhật lại phần tô hồng theo khoảng này, bỏ tô hồng các ngày ngoài khoảng đã tự đặt. Người dùng có thể sửa lại ngày kết thúc theo thực tế.

**Ghi nhận kỳ kinh trong quá khứ:**

- Nếu ngày kết thúc tính theo trung bình nằm trước hôm nay, tự đặt ngày kết thúc bằng ngày bắt đầu cộng số ngày hành kinh trung bình trừ 1.
- Tô hồng toàn bộ khoảng ngày đó. Độ dài kỳ hành kinh được đặt bằng số ngày hành kinh trung bình của người dùng; người dùng có thể sửa lại theo thực tế.

Ví dụ với số ngày hành kinh trung bình là **5 ngày**:

| Thao tác | Kết quả mong muốn |
| --- | --- |
| Hôm nay 03/10, ghi nhận bắt đầu 01/10 | Tô hồng 01–03/10; hiển thị 04–05/10 là ngày kinh dự kiến. |
| Đến 06/10 vẫn đang hành kinh | Tô hồng đến 06/10; nút hiển thị **Kết thúc kỳ kinh** trong ngày thứ 6 và thứ 7. |
| Hôm nay 10/10, ghi nhận bắt đầu 01/10 | Đặt kỳ hành kinh từ 01–05/10 và tô hồng toàn bộ khoảng này. |
| Đến 08/10, kỳ bắt đầu 01/10 vẫn chưa được ghi nhận kết thúc | Tự đặt ngày kết thúc là 05/10 theo trung bình 5 ngày; chỉ tô hồng 01–05/10. |

Nếu ngày kết thúc dự kiến đúng hôm nay, kỳ kinh vẫn mở để người dùng xác nhận kết thúc. Quy tắc tự kết thúc từ ngày thứ 8 vẫn áp dụng khi số ngày hành kinh trung bình từ 7 ngày trở lên; ngày kết thúc được điền theo trung bình, không mặc định cắt về 7 ngày. Thời lượng trung bình được giữ tại lúc ghi nhận bắt đầu. Ngày kết thúc được điền theo trung bình được phân biệt với ngày do người dùng xác nhận và không tham gia tính trung bình hành kinh cho đến khi được xác nhận. Việc tự kết thúc được áp dụng khi mở lại ứng dụng, đổi ngày hoặc đọc dữ liệu trên máy chủ, không cần ứng dụng chạy nền.

## 5. Đọc code ở đâu?

| Muốn thay đổi | File/thư mục |
| --- | --- |
| Giao diện, màu, vị trí khối | `dist/style.css`, `dist/app.js`, `dist/index.html` |
| Gọi API và lỗi mạng | `dist/js/api.js` |
| Đồng bộ, offline, xung đột | `dist/js/cloud.js` |
| Màn hình tài khoản | `dist/js/account.js` |
| UI kết nối và chia sẻ | `dist/js/connections.js` |
| Đăng nhập, phiên, mật khẩu | `server/src/modules/auth/` |
| Kiểu dữ liệu và lưu chu kỳ/nhật ký | `server/src/modules/sync/` |
| Kết nối và lọc dữ liệu chia sẻ | `server/src/modules/connections/` |
| Bảng database | `server/src/db/migrations/` |
| Biến môi trường | `.env.example`, `server/src/config.ts` |

Không sửa file trong `server/build` vì đó là kết quả biên dịch. Khi đổi cấu trúc bảng, tạo migration mới; không sửa migration đã chạy. Xem [ARCHITECTURE.md](docs/ARCHITECTURE.md) và [API.md](docs/API.md).

## 6. Riêng tư và dữ liệu

- Không có khóa API hoặc tài khoản mẫu bí mật trong ZIP. `.env.example` chỉ chứa cấu hình development, phải đổi mật khẩu database trước khi deploy thật.
- Mật khẩu tài khoản được băm scrypt; session cookie HttpOnly và Secure trong production. Đây không phải mã hóa đầu cuối cho nhật ký.
- Chủ máy chủ/database có quyền kỹ thuật truy cập dữ liệu; IndexedDB trên thiết bị không được khóa riêng bằng mật khẩu tài khoản.
- Xóa dữ liệu trình duyệt có thể mất các thay đổi chưa đồng bộ; dữ liệu đã đồng bộ vẫn nằm ở server.
- Đổi domain/trình duyệt không tự chuyển dữ liệu khách cũ. Đăng nhập cùng tài khoản mới tải dữ liệu đã có trên server.
- Không cache API của người đồng hành cho chế độ offline. Thông tin đối phương đã tự chụp/lưu trước khi thu hồi quyền không thể bị xóa từ xa.
- Các ngày dự đoán chỉ là ước tính, không dùng làm biện pháp tránh thai.

## 7. Deploy và cập nhật

**Không chỉ kéo `dist` lên Netlify Drop cho bản backend.** Hãy chạy Node service + PostgreSQL cùng domain hoặc thiết lập reverse proxy phù hợp. Bộ cấu hình production có Caddy cấp HTTPS, app Node và PostgreSQL: [DEPLOY.md](docs/DEPLOY.md).

`netlify.toml` cũ chỉ dùng cho preview tĩnh. ZIP này không tự cập nhật website Sites ở cuộc trò chuyện trước; cần triển khai backend lên hạ tầng của bạn.
