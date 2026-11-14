# PlayID TV + Cloudflare Worker

## ไฟล์
- `index.html` — หน้า PlayID TV พร้อม Xtream login, catalog และ video player
- `worker.js` — API/stream proxy, CORS, byte-range forwarding, HLS playlist rewrite และ error handling
- `wrangler.toml` — ค่าตั้งต้นสำหรับ deploy

## เงื่อนไข
ใช้กับ Backend และสตรีมที่คุณได้รับอนุญาตเท่านั้น ระบบนี้ไม่ข้ามการ Login, DRM, paywall หรือข้อจำกัดของผู้ให้บริการ

## Deploy
ติดตั้ง Wrangler และ Login:

```bash
npm install -g wrangler
wrangler login
```

ตรวจสอบ `BACKEND_BASE_URL` ใน `wrangler.toml` ว่าเป็น Backend ที่ผู้ให้บริการมอบให้ จากนั้น:

```bash
wrangler deploy
```

ทดสอบ `https://ชื่อ-worker.workers.dev/health` ต้องได้ JSON `ok: true`

## ใช้งาน
1. เปิด `index.html` ผ่าน HTTPS hosting
2. ในช่อง Server URL ใส่ URL ของ Worker เช่น `https://ชื่อ-worker.workers.dev`
3. กรอก Username และ Password ที่ผู้ให้บริการออกให้
4. Worker รองรับ `/player_api.php`, `/live/`, `/movie/`, `/series/` และ `/proxy?url=...` สำหรับ playlist/segment ย่อยของ HLS

## CDN allowlist
ถ้า HLS playlist ชี้ไป CDN hostname อื่น ให้เพิ่มเฉพาะ hostname ที่ผู้ให้บริการอนุญาตใน `ALLOWED_UPSTREAM_HOSTS` เช่น `cdn.example.com` ห้ามใช้ wildcard `*`

## Error
- `404`: path ไม่รองรับ
- `403`: hostname ปลายทางไม่อยู่ใน allowlist
- `502`: Worker ติดต่อ upstream ไม่สำเร็จ หรือ redirect ไม่ปลอดภัย
- `401/403` จาก upstream: ตรวจสอบบัญชีและสิทธิ์กับผู้ให้บริการ

## ความปลอดภัยและข้อจำกัด
- อย่าเผยแพร่ข้อมูลบัญชี Xtream หรือ URL ที่มีรหัสผ่าน
- ตั้ง CORS เป็นโดเมนเว็บไซต์จริงใน production แทน `*`
- ถ้าใช้ `http://` ระหว่าง Worker กับ Backend การเชื่อมต่อนั้นไม่เข้ารหัส ควรใช้ HTTPS upstream เมื่อมีให้บริการ
- `UPSTREAM_REFERER` และ `UPSTREAM_ORIGIN` เป็น optional และควรใช้เฉพาะค่าที่ผู้ให้บริการระบุ
- หน้าเว็บเดิมบันทึกข้อมูลล็อกอินใน `localStorage`; ควรใช้เครื่องส่วนตัวและออกจากระบบเมื่อเสร็จ
- ยังไม่ได้ทดสอบกับ Backend จริง ความสำเร็จขึ้นกับสถานะเครือข่าย รูปแบบ API และสิทธิ์บัญชี
