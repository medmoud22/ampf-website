const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const morgan = require('morgan');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const app = express();
const PORT = 3000;

// ─── Middleware ───────────────────────────────────────────
app.set('trust proxy', 1);
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'ampf-mr-secret-key-2026',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false, sameSite: 'lax', maxAge: 24 * 60 * 60 * 1000 }
}));
// Block access to sensitive directories
app.use((req, res, next) => {
    if (req.path.startsWith('/data/') || req.path.startsWith('/node_modules/')) {
        return res.status(403).send('Forbidden');
    }
    next();
});
app.use(express.static(__dirname));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ─── Cloudinary ──────────────────────────────────────────
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || '',
    api_key: process.env.CLOUDINARY_API_KEY || '',
    api_secret: process.env.CLOUDINARY_API_SECRET || ''
});
const useCloudinary = !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
if (useCloudinary) {
    console.log('[AMPF] Using Cloudinary for image uploads');
} else {
    console.log('[AMPF] Cloudinary not configured, using local storage');
}

// ─── File Upload ─────────────────────────────────────────
let storage;
if (useCloudinary) {
    storage = new CloudinaryStorage({
        cloudinary,
        params: {
            folder: 'ampf',
            allowed_formats: ['jpeg', 'jpg', 'png', 'gif', 'webp', 'svg', 'pdf', 'doc', 'docx', 'xlsx'],
            public_id: (req, file) => Date.now() + '-' + file.originalname.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/\s/g, '_')
        }
    });
} else {
    storage = multer.diskStorage({
        destination: (req, file, cb) => cb(null, './uploads/'),
        filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/\s/g, '_'))
    });
}
const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = /jpeg|jpg|png|gif|webp|svg|pdf|doc|docx|xlsx/;
        const ext = allowed.test(path.extname(file.originalname).toLowerCase());
        const mime = allowed.test(file.mimetype);
        cb(null, ext || mime);
    }
});

// Ensure uploads dir (for local fallback)
if (!fs.existsSync('./uploads')) fs.mkdirSync('./uploads');

// ─── Data Helpers ────────────────────────────────────────
const dataPath = path.join(__dirname, 'data', 'content.json');
const configPath = path.join(__dirname, 'data', 'config.json');

function readData() {
    try { return JSON.parse(fs.readFileSync(dataPath, 'utf8')); }
    catch { return { news: [], programs: [], documents: [], messages: [], gallery: [], site_content: {} }; }
}
function writeData(data) {
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8');
}
function readConfig() {
    try { return JSON.parse(fs.readFileSync(configPath, 'utf8')); }
    catch {
        console.warn('[AMPF] config.json not found, using default credentials');
        const defaults = { credentials: { username: 'admin', password: 'ampf2026' } };
        writeConfig(defaults);
        return defaults;
    }
}
function writeConfig(cfg) {
    fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2), 'utf8');
}

// ─── Helpers ─────────────────────────────────────────────
function getFileUrl(file) {
    if (!file) return '';
    if (useCloudinary) return file.path;
    return '/uploads/' + file.filename;
}
function getFilePublicId(imageUrl) {
    if (!imageUrl) return null;
    if (useCloudinary) {
        const parts = imageUrl.split('/');
        const last = parts[parts.length - 1];
        return 'ampf/' + last.split('.')[0];
    }
    return null;
}

// ─── Auth Middleware ─────────────────────────────────────
function requireAuth(req, res, next) {
    if (req.session.authenticated) return next();
    res.status(401).json({ error: 'غير مصرح به' });
}

// =========================================================
//  PUBLIC API (no auth required - for frontend)
// =========================================================
app.get('/api/public-content', (req, res) => {
    const data = readData();
    res.json({
        site_content: data.site_content || {},
        news: (data.news || []).slice(-6).reverse(),
        programs: data.programs || [],
        documents: data.documents || [],
        gallery: data.gallery || []
    });
});

// =========================================================
//  AUTH API
// =========================================================
app.post('/api/login', (req, res) => {
    try {
        const { username, password } = req.body || {};
        console.log('[AMPF] Login attempt:', username, 'from IP:', req.ip);
        const config = readConfig();
        const validUser = config.credentials?.username || 'admin';
        const validPass = config.credentials?.password || 'ampf2026';
        if (username === validUser && password === validPass) {
            req.session.authenticated = true;
            req.session.username = username;
            console.log('[AMPF] Login success:', username);
            return res.json({ success: true, message: 'تم تسجيل الدخول بنجاح' });
        }
        console.log('[AMPF] Login failed:', username);
        res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    } catch (e) {
        console.error('[AMPF] Login error:', e.message);
        // Fallback: accept hardcoded credentials if config fails
        const { username, password } = req.body || {};
        if (username === 'admin' && password === 'ampf2026') {
            req.session.authenticated = true;
            req.session.username = username;
            return res.json({ success: true, message: 'تم تسجيل الدخول بنجاح (fallback)' });
        }
        res.status(500).json({ error: 'خطأ داخلي في الخادم' });
    }
});

app.post('/api/logout', (req, res) => {
    req.session.destroy(() => res.json({ success: true }));
});

app.get('/api/check-auth', (req, res) => {
    res.json({ authenticated: !!req.session.authenticated });
});

// Change password
app.post('/api/change-password', requireAuth, (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const config = readConfig();
    if (currentPassword !== config.credentials.password) {
        return res.status(400).json({ error: 'كلمة المرور الحالية غير صحيحة' });
    }
    if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ error: 'كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل' });
    }
    config.credentials.password = newPassword;
    writeConfig(config);
    res.json({ success: true, message: 'تم تغيير كلمة المرور' });
});

// =========================================================
//  CONTENT CRUD API (auth required)
// =========================================================
app.get('/api/content', requireAuth, (req, res) => {
    const data = readData();
    const type = req.query.type;
    if (type && Array.isArray(data[type])) return res.json({ [type]: data[type] });
    res.json(data);
});

// Generic CRUD for arrays
app.post('/api/content/:type', requireAuth, (req, res) => {
    const data = readData();
    const { type } = req.params;
    if (!Array.isArray(data[type])) return res.status(400).json({ error: 'نوع غير صالح' });
    const item = { id: Date.now().toString(), ...req.body, createdAt: new Date().toISOString() };
    data[type].push(item);
    writeData(data);
    res.json({ success: true, item });
});

app.put('/api/content/:type/:id', requireAuth, (req, res) => {
    const data = readData();
    const { type, id } = req.params;
    if (!Array.isArray(data[type])) return res.status(400).json({ error: 'نوع غير صالح' });
    const idx = data[type].findIndex(i => i.id === id);
    if (idx === -1) return res.status(404).json({ error: 'العنصر غير موجود' });
    data[type][idx] = { ...data[type][idx], ...req.body };
    writeData(data);
    res.json({ success: true, item: data[type][idx] });
});

app.delete('/api/content/:type/:id', requireAuth, (req, res) => {
    const data = readData();
    const { type, id } = req.params;
    if (!Array.isArray(data[type])) return res.status(400).json({ error: 'نوع غير صالح' });
    // Delete associated image
    const item = data[type].find(i => i.id === id);
    if (item && item.image) {
        if (useCloudinary) {
            const pid = getFilePublicId(item.image);
            if (pid) cloudinary.uploader.destroy(pid).catch(() => {});
        } else {
            const imgPath = path.join(__dirname, 'uploads', path.basename(item.image));
            if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
        }
    }
    data[type] = data[type].filter(i => i.id !== id);
    writeData(data);
    res.json({ success: true });
});

// =========================================================
//  NEWS WITH IMAGE UPLOAD
// =========================================================
app.post('/api/news-with-image', requireAuth, upload.single('image'), (req, res) => {
    const data = readData();
    const item = {
        id: Date.now().toString(),
        title: { ar: req.body.title_ar || '', fr: req.body.title_fr || '', en: req.body.title_en || '' },
        desc: { ar: req.body.desc_ar || '', fr: req.body.desc_fr || '', en: req.body.desc_en || '' },
        category: req.body.category || 'blog',
        date: req.body.date || new Date().toISOString().split('T')[0],
        image: getFileUrl(req.file),
        createdAt: new Date().toISOString()
    };
    if (!Array.isArray(data.news)) data.news = [];
    data.news.push(item);
    writeData(data);
    res.json({ success: true, item });
});

app.put('/api/news-with-image/:id', requireAuth, upload.single('image'), (req, res) => {
    const data = readData();
    const idx = data.news.findIndex(i => i.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'الخبر غير موجود' });

    if (req.file) {
        // Delete old image
        if (data.news[idx].image) {
            if (useCloudinary) {
                const pid = getFilePublicId(data.news[idx].image);
                if (pid) cloudinary.uploader.destroy(pid).catch(() => {});
            } else {
                const oldPath = path.join(__dirname, 'uploads', path.basename(data.news[idx].image));
                if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
            }
        }
        data.news[idx].image = getFileUrl(req.file);
    }
    if (req.body.title_ar || req.body.title_fr || req.body.title_en) {
        data.news[idx].title = {
            ar: req.body.title_ar || (data.news[idx].title?.ar || ''),
            fr: req.body.title_fr || (data.news[idx].title?.fr || ''),
            en: req.body.title_en || (data.news[idx].title?.en || '')
        };
    }
    if (req.body.desc_ar || req.body.desc_fr || req.body.desc_en) {
        data.news[idx].desc = {
            ar: req.body.desc_ar || (data.news[idx].desc?.ar || ''),
            fr: req.body.desc_fr || (data.news[idx].desc?.fr || ''),
            en: req.body.desc_en || (data.news[idx].desc?.en || '')
        };
    }
    if (req.body.category) data.news[idx].category = req.body.category;
    if (req.body.date) data.news[idx].date = req.body.date;

    writeData(data);
    res.json({ success: true, item: data.news[idx] });
});

// =========================================================
//  GALLERY
// =========================================================
app.post('/api/gallery', requireAuth, upload.single('image'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'يرجى اختيار صورة' });
    const data = readData();
    const item = {
        id: Date.now().toString(),
        title: req.body.title || 'صورة',
        image: getFileUrl(req.file),
        createdAt: new Date().toISOString()
    };
    if (!Array.isArray(data.gallery)) data.gallery = [];
    data.gallery.push(item);
    writeData(data);
    res.json({ success: true, item });
});

app.delete('/api/gallery/:id', requireAuth, (req, res) => {
    const data = readData();
    const idx = data.gallery.findIndex(i => i.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'الصورة غير موجودة' });
    if (data.gallery[idx].image) {
        if (useCloudinary) {
            const pid = getFilePublicId(data.gallery[idx].image);
            if (pid) cloudinary.uploader.destroy(pid).catch(() => {});
        } else {
            const imgPath = path.join(__dirname, 'uploads', path.basename(data.gallery[idx].image));
            if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
        }
    }
    data.gallery.splice(idx, 1);
    writeData(data);
    res.json({ success: true });
});

// =========================================================
//  SITE CONTENT
// =========================================================
app.get('/api/site-content', requireAuth, (req, res) => {
    const data = readData();
    res.json(data.site_content || {});
});

app.put('/api/site-content', requireAuth, (req, res) => {
    const data = readData();
    data.site_content = req.body;
    writeData(data);
    res.json({ success: true, message: 'تم حفظ التغييرات' });
});

// File upload (generic)
app.post('/api/upload', requireAuth, upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'لم يتم رفع الملف' });
    res.json({ success: true, filename: req.file.filename, path: getFileUrl(req.file) });
});

// =========================================================
//  MESSAGES (from contact form)
// =========================================================
app.post('/api/messages', (req, res) => {
    const data = readData();
    const msg = {
        id: Date.now().toString(),
        name: req.body.name || '',
        email: req.body.email || '',
        subject: req.body.subject || '',
        message: req.body.message || '',
        createdAt: new Date().toISOString()
    };
    if (!Array.isArray(data.messages)) data.messages = [];
    data.messages.push(msg);
    writeData(data);
    res.json({ success: true, message: 'تم إرسال رسالتك بنجاح' });
});

// =========================================================
//  STATIC FILES & ADMIN SPA
// =========================================================
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});
app.get('/admin/*', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// =========================================================
//  START
// =========================================================
app.listen(PORT, () => {
    console.log(`
    ╔══════════════════════════════════════════════════════╗
    ║  ●  الجمعية الموريتانية لترقية الأسرة               ║
    ║  ●  نظام إدارة المحتوى CMS                          ║
    ║                                                      ║
    ║  ▼  الموقع:        http://localhost:${PORT}             ║
    ║  ▼  لوحة الإدارة: http://localhost:${PORT}/admin       ║
    ║                                                      ║
    ║  ◆  اسم المستخدم: admin                              ║
    ║  ◆  كلمة المرور:  ampf2026                           ║
    ╚══════════════════════════════════════════════════════╝
    `);
});
