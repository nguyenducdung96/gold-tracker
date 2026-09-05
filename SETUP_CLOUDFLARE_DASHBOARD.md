# Setup V7.1 bằng Cloudflare Dashboard + GitHub

Sau setup lần đầu, quy trình hằng ngày chỉ còn: **push GitHub -> Cloudflare tự deploy**.

---

## A. Đưa source lên GitHub

Tạo một repository, ví dụ:

```text
gold-tracker
```

Upload toàn bộ source V7.1 vào repo.

Bạn có thể làm hoàn toàn bằng giao diện GitHub web nếu muốn, không cần npm.

---

## B. Tạo D1 trên Cloudflare Dashboard

Cloudflare Dashboard:

```text
Workers & Pages
→ D1 SQL Database
→ Create database
```

Tên:

```text
gold-tracker-db
```

Sau khi tạo, copy **Database ID**.

Mở file trong GitHub:

```text
wrangler.jsonc
```

thay:

```text
PASTE_D1_DATABASE_ID_HERE
```

bằng ID vừa copy và commit.

Đây là phần cấu hình ID duy nhất phải sửa trong source.

---

## C. Tạo bảng D1 ngay trên Dashboard

Vào database:

```text
gold-tracker-db
→ Console
```

Mở file:

```text
database/schema.sql
```

Copy toàn bộ SQL, paste vào D1 Console và Run.

Chỉ cần làm một lần.

---

## D. Connect GitHub với Cloudflare Worker

Cloudflare Dashboard:

```text
Workers & Pages
→ Create
→ Import a repository
```

Chọn GitHub repository `gold-tracker`.

Thiết lập build:

```text
Build command:
npm run build

Deploy command:
npx wrangler deploy
```

Root directory:

```text
/
```

Cloudflare sẽ tự:

```text
npm install
→ npm run build
→ wrangler deploy
```

trên server Cloudflare.

Bạn không cần chạy các lệnh đó trên PC.

---

## E. Deployment đầu tiên

Sau deploy thành công bạn có URL tương tự:

```text
https://gold-tracker.<account>.workers.dev
```

Mở:

```text
https://gold-tracker.<account>.workers.dev
```

để vào PWA.

Test API trên cùng domain:

```text
/health
/api/gold/dashboard
/api/debug/vietnam-quality
/api/debug/vietnam/DOJI
```

Ví dụ:

```text
https://gold-tracker.<account>.workers.dev/health
```

Không còn Worker URL và Pages URL riêng.

Không còn CORS.

---

## F. D1 binding

`wrangler.jsonc` đã khai báo:

```json
{
  "binding": "DB",
  "database_name": "gold-tracker-db",
  "database_id": "<ID của bạn>"
}
```

Sau deployment, vào:

```text
Worker
→ Settings
→ Bindings
```

kiểm tra có:

```text
D1 database
Variable name: DB
Database: gold-tracker-db
```

---

## G. Cron

`wrangler.jsonc` có sẵn:

```text
*/5 * * * *  → cập nhật vàng Việt Nam 5 phút/lần
17 * * * *   → USD/VND 1 lần/giờ
0 3 * * *    → cleanup history
```

Sau deployment kiểm tra:

```text
Worker
→ Settings / Triggers
→ Cron Triggers
```

Cloudflare dùng UTC, nhưng cron 5 phút không phụ thuộc múi giờ.

---

## H. Cài trên điện thoại

### Android / Chrome

```text
mở URL Worker
→ ⋮
→ Install app / Add to Home screen
```

### iPhone / Safari

```text
mở URL Worker
→ Share
→ Add to Home Screen
```

---

# Sau này update code

Từ lần thứ hai trở đi:

```text
Bạn sửa code
      ↓
commit / push GitHub
      ↓
Cloudflare phát hiện commit
      ↓
tự build
      ↓
tự deploy
```

Không cần thao tác Cloudflare lại.

---

# Custom domain sau này

Có thể đổi:

```text
https://gold-tracker.xxx.workers.dev
```

thành:

```text
https://market.tenmiencuaban.com
```

trong Worker → Settings → Domains & Routes.

PWA đã cài trên điện thoại vẫn hoạt động, nhưng nếu đổi origin/domain hoàn toàn thì
nên cài lại shortcut PWA theo domain mới.
