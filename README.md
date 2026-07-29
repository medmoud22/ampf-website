# الجمعية الموريتانية لترقية الأسرة (AMPF)

نظام إدارة محتوى متكامل متعدد اللغات (عربي / فرنسي / إنجليزي) للموقع الرسمي للجمعية الموريتانية لترقية الأسرة. يشمل واجهة أمامية ديناميكية ولوحة تحكم خلفية كاملة.

---

## المميزات

- **متعدد اللغات:** دعم كامل للعربية (RTL) والفرنسية والإنجليزية
- **لوحة تحكم CMS:** إدارة الأخبار، البرامج، معرض الصور، الوثائق، الرسائل، وتعديل النصوص
- **محتوى ديناميكي:** كل المحتوى يُجلب من API، قابل للتعديل من لوحة التحكم
- **رفع الملفات:** دعم رفع الصور والأخبار والمعرض
- **تصدير واستيراد:** تخزين البيانات في ملف JSON

---

## متطلبات التشغيل

- Node.js (v18+)
- npm

## طريقة التشغيل

```bash
cd ampf-website
npm install
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
│   ├── content.json   # قاعدة البيانات (JSON)
│   └── config.json    # بيانات تسجيل الدخول (مستبعد من git)
├── uploads/           # الملفات المرفوعة (مستبعد من git)
├── package.json
└── .gitignore
```

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
- **File Upload:** Image upload support for news and gallery
- **JSON Storage:** Lightweight file-based data storage

## Requirements

- Node.js (v18+)
- npm

## Quick Start

```bash
cd ampf-website
npm install
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
│   ├── content.json   # Database (JSON file)
│   └── config.json    # Login credentials (gitignored)
├── uploads/           # Uploaded files (gitignored)
├── package.json
└── .gitignore
```

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
