# Local development — optional

Bạn không cần phần này để deploy production.

Chỉ dùng nếu muốn debug trên PC:

```powershell
npm.cmd install
npm.cmd run build
npm.cmd run dev
```

Worker local sẽ serve cả PWA và API.

Nếu muốn chạy Vite HMR riêng:

```powershell
npm.cmd run dev:web
```

copy:

```text
apps/web/.env.local.example
```

thành:

```text
apps/web/.env.local
```

để frontend gọi Worker local tại `http://localhost:8787`.
