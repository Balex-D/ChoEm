# Deploy backend Cho Em

## A. Thử trên máy trước

Tại thư mục gốc dự án:

```powershell
Copy-Item .env.example .env
docker compose up --build -d
docker compose ps
```

Mở http://localhost:8080. Sau đó đăng ký hai tài khoản, ghi nhật ký, tạo lời mời và kiểm tra chia sẻ. Nếu lỗi, xem `docker compose logs -f app` và `docker compose logs -f db`. Các lệnh Docker trong tài liệu được cung cấp để chạy trên máy của bạn; môi trường tạo ZIP không có Docker nên chưa chạy image/Compose thực tế.

## B. Deploy một máy chủ với Docker + Caddy + PostgreSQL

### Chuẩn bị

- Một máy chủ Linux có Docker Engine và Docker Compose.
- Một domain/subdomain trỏ A (và AAAA nếu có IPv6 hoạt động) đến IP máy chủ.
- Mở TCP 80 và 443 cho Caddy. Không mở PostgreSQL trực tiếp ra Internet.
- Máy chủ cần truy cập được Docker registry, npm registry và dịch vụ cấp chứng chỉ TLS trong lần build/khởi tạo.

Upload toàn bộ source, gồm package-lock.json, dist, server, Dockerfile, Caddyfile và compose.production.yaml. Không upload node_modules, server/build từ máy cá nhân hoặc `.env` development đang dùng.

### Tạo cấu hình riêng trên máy chủ

Tạo file `.env` cạnh `compose.production.yaml`:

```dotenv
APP_DOMAIN=choem.tenmiencuaban.com
POSTGRES_PASSWORD=THAY_BANG_CHUOI_HEX_NGAU_NHIEN_DAI_IT_NHAT_48_KY_TU
```

`APP_DOMAIN` không có `https://` hoặc dấu `/`. Thay cả hai giá trị mẫu trước khi chạy. Dùng mật khẩu chỉ gồm ký tự hex hoặc ký tự an toàn cho URL; nếu dùng ký tự đặc biệt phải URL-encode phần mật khẩu trong DATABASE_URL.

Có thể tạo chuỗi hex trên máy có Node.js:

```sh
node -e "console.log(require('node:crypto').randomBytes(24).toString('hex'))"
```

Không commit `.env` hoặc gửi nội dung có mật khẩu vào issue/chat công khai.

### Khởi động

```sh
docker compose -f compose.production.yaml up --build -d
docker compose -f compose.production.yaml ps
docker compose -f compose.production.yaml logs -f app caddy
```

App tự chạy SQL migrations trước khi nhận request. Caddy sử dụng domain đã cấu hình để cấp/gia hạn chứng chỉ và chuyển HTTP sang HTTPS khi DNS/cổng đáp ứng yêu cầu.

Mở `https://<domain-cua-ban>` và `https://<domain-cua-ban>/healthz`. Health endpoint phải trả `{"status":"ok"}`. Production bật cookie Secure và kiểm tra Origin, vì vậy không truy cập production bằng HTTP/IP thay cho domain chính thức.

Chỉ Caddy publish cổng ra ngoài; Node và PostgreSQL ở trong mạng Compose. PostgreSQL và chứng chỉ được giữ trong named volumes.

### Cập nhật code

1. Sao lưu database trước.
2. Upload code mới, giữ `.env` và volumes.
3. Chạy lại:

```sh
docker compose -f compose.production.yaml up --build -d
```

Thêm bảng/cột bằng migration SQL mới; không đổi nội dung migration đã áp dụng. Migrations chạy trong giao dịch và được ghi checksum. Dùng thay đổi tương thích ngược nếu cần rollback image; rollback source không tự rollback schema/data.

Nếu đổi tài nguyên PWA cache, tăng tên `CACHE` trong `dist/sw.js`. Người dùng cần mở app khi có mạng để nhận phiên bản mới.

## C. Sao lưu database

Ví dụ xuất SQL bằng công cụ trong container rồi copy ra ngoài; tránh lỗi encoding khi dùng redirection của PowerShell cũ:

```sh
docker compose -f compose.production.yaml exec db sh -c 'pg_dump -U choem -d choem > /tmp/choem-backup.sql'
docker compose -f compose.production.yaml cp db:/tmp/choem-backup.sql ./choem-backup.sql
```

File SQL chứa dữ liệu riêng tư. Lưu ở nơi có kiểm soát truy cập, mã hóa bản sao lưu và đặt lịch sao lưu theo hạ tầng của bạn. Không đưa backup vào repo/source ZIP.

Trước khi dùng dữ liệu thật, cần kiểm tra khôi phục trên database thử nghiệm riêng. Ví dụ copy file vào một container DB thử nghiệm rồi dùng `psql -U choem -d <database-thu-nghiem> -f <duong-dan-file>`; không thử restore đè lên DB đang dùng. Sao lưu trong cùng ổ đĩa/VPS không bảo vệ được khi mất toàn bộ máy chủ.

`docker compose down` giữ volumes. Không chạy `down -v`, `docker volume rm` hoặc xóa thư mục dữ liệu khi chưa có backup đã kiểm tra.

Đổi POSTGRES_PASSWORD trong `.env` không tự thay mật khẩu role trong một volume PostgreSQL đã tồn tại. Cần đổi mật khẩu ở PostgreSQL rồi cập nhật cấu hình app tương ứng trong một lần bảo trì.

## D. Deploy lên nền tảng chạy Node/Docker khác

Bộ source không phụ thuộc nhà cung cấp. Cần:

- PostgreSQL có lưu trữ bền vững.
- Node >=22.16 hoặc build Dockerfile.
- Build: `npm ci`, `npm run build`.
- Migrate trước khi khởi động: `node server/build/db/migrate.js`.
- Start: `node server/build/index.js`.
- Biến môi trường: `NODE_ENV=production`, `APP_ORIGIN=https://<domain>`, `DATABASE_URL=<ket-noi-db>`, `PORT=<port-nha-cung-cap>`. Chỉ đặt `TRUST_PROXY_HOPS` theo đúng số proxy tin cậy của hạ tầng.
- Giữ thư mục `dist` và `server/src/db/migrations` trong artifact runtime.
- Không đặt DATABASE_URL hoặc mật khẩu vào frontend.
- Nếu DB bên ngoài yêu cầu TLS, dùng cấu hình TLS/chứng chỉ đúng theo nhà cung cấp, không tắt xác minh chứng chỉ để bỏ qua lỗi.

Nền tảng phải proxy cả giao diện và `/api` trên cùng origin. Nếu muốn giữ frontend ở Netlify và backend ở nơi khác, cần cấu hình proxy `/api/*`, Cookie/Origin và kết nối HTTPS phù hợp; không chỉ thay URL fetch sang một domain khác. Cấu hình chia hosting đó chưa được đưa vào ZIP.

## E. Khôi phục mật khẩu do quản trị viên

Hiện chưa tích hợp email reset. Trên môi trường quản trị có Node và dependencies development, dùng:

```sh
npm run password:reset -- diachi@example.com
```

Script hỏi mật khẩu mới hai lần bằng nhập ẩn, không nhận mật khẩu qua tham số dòng lệnh. Mọi phiên của tài khoản bị thu hồi sau khi đổi. Chỉ thực hiện sau khi quản trị viên xác minh đúng người yêu cầu; email tài khoản hiện chưa được xác minh tự động.

Container production không cài tsx; nếu vận hành hoàn toàn bằng Docker, có thể dùng một bản checkout quản trị riêng để chạy script này với DATABASE_URL thích hợp. Không mở database ra Internet chỉ để chạy CLI.

## F. Trước khi đưa vào sử dụng thật

Kiểm tra tài khoản, chia sẻ/tắt chia sẻ, đồng bộ hai thiết bị, xung đột, restore backup, rate limit, log và HTTPS trên hạ tầng thật. Chưa có Web Push, email verification, email reset hoặc trang tự xóa tài khoản. Cần hoàn thiện chính sách dữ liệu, vận hành và kiểm tra bảo mật theo phạm vi sử dụng.

Tài liệu chính thức:

- Caddy HTTPS: https://caddyserver.com/docs/automatic-https
- Docker Compose .env: https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/
