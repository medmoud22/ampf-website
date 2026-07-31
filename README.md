# الجمعية الموريتانية لترقية الأسرة (AMPF)

نظام إدارة محتوى متكامل متعدد اللغات (عربي / فرنسي / إنجليزي) للموقع الرسمي للجمعية الموريتانية لترقية الأسرة. يشمل واجهة أمامية ديناميكية ولوحة تحكم خلفية كاملة.

---

## المميزات

- **متعدد اللغات:** دعم كامل للعربية (RTL) والفرنسية والإنجليزية
- **لوحة تحكم CMS:** إدارة الأخبار، البرامج، معرض الصور، الوثائق، الرسائل، وتعديل النصوص
- **محتوى ديناميكي:** كل المحتوى يُجلب من API، قابل للتعديل من لوحة التحكم
- **رفع الملفات:** رفع مباشر إلى Cloudinary (روابط `res.cloudinary.com`) — لا تخزين محلي
- **قاعدة بيانات سحابية:** كل المحتوى محفوظ في Upstash Redis — يبقى بعد إعادة تشغيل Render
- **تصدير واستيراد:** الملف المحلي `content.json` نسخة احتياطية فقط

---

## متطلبات التشغيل

- Node.js (v18+)
- npm
- حسابات Cloudinary (متغيرات البيئة: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`)
- قاعدة Upstash Redis مجانية (متغيرات البيئة: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`)

## إعداد قاعدة البيانات السحابية (Upstash Redis)

1. سجّل مجاناً على [upstash.com](https://upstash.com)
2. أنشئ قاعدة جديدة (Provider: **AWS**، Region: الأقرب إليك مثل `eu-central-1`)
3. من تبويب **REST API** انسخ قيمتين:
   - `UPSTASH_REDIS_REST_URL` — مثال: `https://xxxx.upstash.io`
   - `UPSTASH_REDIS_REST_TOKEN`
4. في Render → Service → **Environment** أضف المتغيرين (مع متغيرات Cloudinary)
5. عند أول تشغيل تُزرع البيانات تلقائياً من `content.json` إلى Redis

> بدون Upstash Redis سيعمل الموقع محلياً لكن البيانات **ستُمحى** عند إعادة تشغيل Render.

## طريقة التشغيل

```bash
cd ampf-website
npm install
# ضع مفاتيح Cloudinary (إلزامية للرفع)
node server.js
```

ثم افتح المتصفح على العنوان:

| الصفحة | الرابط |
|--------|--------|
| الموقع العام | http://localhost:3000/ |
| لوحة الإدارة | http://localhost:3000/admin |

## بيانات الدخول

| الحقل | القيمة |
|-------|--------|
| اسم المستخدم | `admin` |
| كلمة المرور | `ampf2026` |

## هيكل المشروع

```
ampf-website/
├── server.js          # خادم Express مع API كامل
├── index.html         # الواجهة الأمامية (SPA)
├── admin.html         # لوحة الإدارة (SPA)
├── data/
│   ├── content.json   # النسخة الاحتياطية المحلية (المصدر الحقيقي في Upstash Redis)
│   └── config.json    # بيانات تسجيل الدخول (محفوظة في Redis أيضاً، والمحلي مستبعد من git)
├── package.json
└── .gitignore
```

> **ملاحظة:** الصور تُرفع إلى Cloudinary وكل البيانات (الأخبار، المعرض، الأقسام، الفروع، النصوص) وكذلك بيانات تسجيل الدخول محفوظة في Upstash Redis، لذلك كل شيء يبقى بعد إعادة تشغيل Render.

## API

| الطريقة | المسار | الوصف |
|---------|--------|-------|
| GET | `/api/public-content` | جلب كل المحتوى للواجهة الأمامية |
| POST | `/api/login` | تسجيل الدخول |
| POST | `/api/news-with-image` | إضافة خبر مع صورة |
| PUT | `/api/news-with-image/:id` | تعديل خبر |
| POST | `/api/gallery` | رفع صورة للمعرض |
| PUT | `/api/site-content` | حفظ تعديلات النصوص |
| POST | `/api/messages` | إرسال رسالة (عام) |

---

# Mauritanian Association for Family Promotion (AMPF)

A complete multilingual CMS (Arabic / French / English) for the official website of the Mauritanian Association for Family Promotion (AMPF). Includes a dynamic frontend and a full-featured admin dashboard.

## Features

- **Multilingual:** Full support for Arabic (RTL), French, and English
- **CMS Dashboard:** Manage news, programs, gallery, documents, messages, and site content
- **Dynamic Content:** All content fetched from API, editable via admin panel
- **File Upload:** Uploads go directly to Cloudinary (`res.cloudinary.com` URLs) — no local storage
- **Cloud Database:** All content persisted in Upstash Redis — survives Render restarts
- **JSON Storage:** Local `content.json` is only a backup/seed file

## Requirements

- Node.js (v18+)
- npm
- Cloudinary account (env vars: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`)
- Free Upstash Redis database (env vars: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`)

## Setting up the cloud database (Upstash Redis)

1. Sign up free at [upstash.com](https://upstash.com)
2. Create a database (Provider: **AWS**, region nearest to you, e.g. `eu-central-1`)
3. From the **REST API** tab copy two values:
   - `UPSTASH_REDIS_REST_URL` — e.g. `https://xxxx.upstash.io`
   - `UPSTASH_REDIS_REST_TOKEN`
4. On Render → Service → **Environment**, add both variables (plus the Cloudinary ones)
5. On first boot the data is seeded automatically from `content.json` into Redis

> Without Upstash Redis the site works locally but data **will be wiped** on Render restarts.

## Quick Start

```bash
cd ampf-website
npm install
# Set Cloudinary keys (required for uploads)
node server.js
```

Open your browser:

| Page | URL |
|------|-----|
| Public site | http://localhost:3000/ |
| Admin panel | http://localhost:3000/admin |

## Login Credentials

| Field | Value |
|-------|-------|
| Username | `admin` |
| Password | `ampf2026` |

## Project Structure

```
ampf-website/
├── server.js          # Express server with full REST API
├── index.html         # Public frontend (SPA)
├── admin.html         # Admin dashboard (SPA)
├── data/
│   ├── content.json   # Local backup file (source of truth is Upstash Redis)
│   └── config.json    # Login credentials (also persisted to Redis; local file gitignored)
├── package.json
└── .gitignore
```

> **Note:** Images go to Cloudinary and all data (news, gallery, programs, branches, texts) plus login credentials are stored in Upstash Redis, so everything survives Render restarts.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/public-content` | Fetch all content for frontend |
| POST | `/api/login` | Admin login |
| POST | `/api/news-with-image` | Add news item with image |
| PUT | `/api/news-with-image/:id` | Update news item |
| POST | `/api/gallery` | Upload gallery image |
| PUT | `/api/site-content` | Save site content edits |
| POST | `/api/messages` | Submit contact form (public) |
