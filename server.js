const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const morgan = require('morgan');
const cloudinary = require('cloudinary').v2;
const { Redis } = require('@upstash/redis');

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

// ─── Cloudinary (mandatory) ──────────────────────────────
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || '',
    api_key: process.env.CLOUDINARY_API_KEY || '',
    api_secret: process.env.CLOUDINARY_API_SECRET || ''
});
const useCloudinary = !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
if (useCloudinary) {
    console.log('[AMPF] Cloudinary configured. All uploads go to Cloudinary.');
} else {
    console.warn('[AMPF] WARNING: Cloudinary NOT configured. Image/document uploads will FAIL.');
    console.warn('[AMPF] Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET in Render env vars.');
}

// ─── File Upload ─────────────────────────────────────────
// Files are held in memory and pushed straight to Cloudinary.
// Nothing is ever written to the local uploads/ folder, so images
// survive Render restarts (ephemeral filesystem).
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = /jpeg|jpg|png|gif|webp|svg|pdf|doc|docx|xlsx/;
        const ext = allowed.test(path.extname(file.originalname).toLowerCase());
        const mime = allowed.test(file.mimetype);
        cb(null, ext || mime);
    }
});

function uploadToCloudinary(file) {
    return new Promise((resolve, reject) => {
        if (!useCloudinary) {
            return reject(new Error('Cloudinary not configured on server'));
        }
        const stream = cloudinary.uploader.upload_stream(
            {
                folder: 'ampf',
                resource_type: 'auto',
                public_id: Date.now() + '-' + (file.originalname || 'file').replace(/[^a-zA-Z0-9_-]/g, '_').replace(/\s/g, '_')
            },
            (err, result) => {
                if (err) return reject(err);
                resolve(result.secure_url || result.url || '');
            }
        );
        stream.end(file.buffer);
    });
}

// ─── Data Helpers ────────────────────────────────────────
const dataPath = path.join(__dirname, 'data', 'content.json');
const configPath = path.join(__dirname, 'data', 'config.json');

// ─── Cloud Persistent Store (Upstash Redis) ──────────────
// The whole content.json is stored in Upstash Redis so data survives
// Render restarts (ephemeral filesystem). The local file remains as a
// backup/seed source only. Env vars: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
const redisUrl = process.env.UPSTASH_REDIS_REST_URL || '';
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || '';
const useCloudDB = !!(redisUrl && redisToken);
const redis = useCloudDB ? new Redis({ url: redisUrl, token: redisToken }) : null;
const CONTENT_KEY = 'ampf:content';

if (useCloudDB) {
    console.log('[AMPF] Cloud DB (Upstash Redis) enabled. Data survives restarts.');
} else {
    console.warn('[AMPF] WARNING: Upstash Redis NOT configured. Data may be wiped on Render restarts.');
    console.warn('[AMPF] Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in Render env vars.');
}

// Serialize cloud writes so the last write always wins in order
let persistQueue = Promise.resolve();
function persistToCloud(data) {
    const snapshot = JSON.stringify(data);
    persistQueue = persistQueue
        .then(() => redis.set(CONTENT_KEY, snapshot))
        .catch((e) => console.error('[AMPF] Cloud DB write failed:', e.message));
    return persistQueue;
}

const DATA_DEFAULTS = {
    news: [],
    programs: [],
    documents: [],
    messages: [],
    gallery: [],
    site_content: {},
    slider: [],
    branches: [],
    navbar: []
};

function readLocalFile() {
    try { return JSON.parse(fs.readFileSync(dataPath, 'utf8')); }
    catch { return JSON.parse(JSON.stringify(DATA_DEFAULTS)); }
}

async function readData() {
    if (redis) {
        try {
            const raw = await redis.get(CONTENT_KEY);
            if (raw) {
                const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
                if (parsed && typeof parsed === 'object') return parsed;
            }
            // Key not set yet: seed cloud from the local seed file
            const local = readLocalFile();
            await persistToCloud(local);
            return local;
        } catch (e) {
            console.error('[AMPF] Cloud DB read failed, using local file:', e.message);
        }
    }
    return readLocalFile();
}

async function writeData(data) {
    // Local backup file (helps local dev + serves as seed)
    try {
        fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error('[AMPF] Local backup write failed:', e.message);
    }
    // Persist to cloud
    if (redis) {
        try { await persistToCloud(data); }
        catch (e) { console.error('[AMPF] Cloud DB write failed:', e.message); }
    }
}

// ─── Config helpers (credentials persisted to cloud too) ─
const CONFIG_KEY = 'ampf:config';

let configPersistQueue = Promise.resolve();
function persistConfigToCloud(cfg) {
    const snapshot = JSON.stringify(cfg);
    configPersistQueue = configPersistQueue
        .then(() => redis.set(CONFIG_KEY, snapshot))
        .catch((e) => console.error('[AMPF] Cloud config write failed:', e.message));
    return configPersistQueue;
}

function readLocalConfig() {
    try { return JSON.parse(fs.readFileSync(configPath, 'utf8')); }
    catch {
        console.warn('[AMPF] config.json not found, using default credentials');
        const defaults = { credentials: { username: 'admin', password: 'ampf2026' } };
        try { fs.writeFileSync(configPath, JSON.stringify(defaults, null, 2), 'utf8'); } catch {}
        return defaults;
    }
}

async function readConfig() {
    if (redis) {
        try {
            const raw = await redis.get(CONFIG_KEY);
            if (raw) {
                const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
                if (parsed && typeof parsed === 'object' && parsed.credentials) return parsed;
            }
            // Key not set yet: seed cloud from local config
            const local = readLocalConfig();
            await persistConfigToCloud(local);
            return local;
        } catch (e) {
            console.error('[AMPF] Cloud config read failed, using local file:', e.message);
        }
    }
    return readLocalConfig();
}

async function writeConfig(cfg) {
    // Local backup file
    try { fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2), 'utf8'); }
    catch (e) { console.error('[AMPF] Local config write failed:', e.message); }
    // Persist to cloud
    if (redis) {
        try { await persistConfigToCloud(cfg); }
        catch (e) { console.error('[AMPF] Cloud config write failed:', e.message); }
    }
}

// ─── Helpers ─────────────────────────────────────────────
function getFilePublicId(imageUrl) {
    if (!imageUrl || typeof imageUrl !== 'string') return null;
    // Skip local paths (old /uploads/ entries are gone on Render anyway)
    if (imageUrl.startsWith('/uploads/')) return null;
    const parts = imageUrl.split('/');
    const last = parts[parts.length - 1] || '';
    return 'ampf/' + last.split('.')[0];
}

// ─── Auth Middleware ─────────────────────────────────────
function requireAuth(req, res, next) {
    if (req.session.authenticated) return next();
    res.status(401).json({ error: 'غير مصرح به' });
}

// =========================================================
//  PUBLIC API (no auth required - for frontend)
// =========================================================
app.get('/api/public-content', async (req, res) => {
    const data = await readData();
    res.json({
        site_content: data.site_content || {},
        news: (data.news || []).slice(-6).reverse(),
        programs: data.programs || [],
        documents: data.documents || [],
        gallery: data.gallery || [],
        slider: data.slider || [],
        branches: data.branches || [],
        navbar: data.navbar || []
    });
});

// =========================================================
//  AUTH API
// =========================================================
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body || {};
        console.log('[AMPF] Login attempt:', username, 'from IP:', req.ip);
        const config = await readConfig();
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
app.post('/api/change-password', requireAuth, async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const config = await readConfig();
    if (currentPassword !== config.credentials.password) {
        return res.status(400).json({ error: 'كلمة المرور الحالية غير صحيحة' });
    }
    if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ error: 'كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل' });
    }
    config.credentials.password = newPassword;
    await writeConfig(config);
    res.json({ success: true, message: 'تم تغيير كلمة المرور' });
});

// =========================================================
//  CONTENT CRUD API (auth required)
// =========================================================
app.get('/api/content', requireAuth, async (req, res) => {
    const data = await readData();
    const type = req.query.type;
    if (type && Array.isArray(data[type])) return res.json({ [type]: data[type] });
    res.json(data);
});

// Generic CRUD for arrays
app.post('/api/content/:type', requireAuth, async (req, res) => {
    const data = await readData();
    const { type } = req.params;
    if (!Array.isArray(data[type])) return res.status(400).json({ error: 'نوع غير صالح' });
    const item = { id: Date.now().toString(), ...req.body, createdAt: new Date().toISOString() };
    data[type].push(item);
    await writeData(data);
    res.json({ success: true, item });
});

app.put('/api/content/:type/:id', requireAuth, async (req, res) => {
    const data = await readData();
    const { type, id } = req.params;
    if (!Array.isArray(data[type])) return res.status(400).json({ error: 'نوع غير صالح' });
    const idx = data[type].findIndex(i => i.id === id);
    if (idx === -1) return res.status(404).json({ error: 'العنصر غير موجود' });
    data[type][idx] = { ...data[type][idx], ...req.body };
    await writeData(data);
    res.json({ success: true, item: data[type][idx] });
});

app.delete('/api/content/:type/:id', requireAuth, async (req, res) => {
    const data = await readData();
    const { type, id } = req.params;
    if (!Array.isArray(data[type])) return res.status(400).json({ error: 'نوع غير صالح' });
    // Delete associated image from Cloudinary
    const item = data[type].find(i => i.id === id);
    if (item && item.image) {
        const pid = getFilePublicId(item.image);
        if (pid) cloudinary.uploader.destroy(pid).catch(() => {});
    }
    data[type] = data[type].filter(i => i.id !== id);
    await writeData(data);
    res.json({ success: true });
});

// =========================================================
//  NEWS WITH IMAGE UPLOAD
// =========================================================
app.post('/api/news-with-image', requireAuth, upload.single('image'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'يرجى اختيار صورة' });
    try {
        const imageUrl = await uploadToCloudinary(req.file);
        const data = await readData();
        const item = {
            id: Date.now().toString(),
            title: { ar: req.body.title_ar || '', fr: req.body.title_fr || '', en: req.body.title_en || '' },
            desc: { ar: req.body.desc_ar || '', fr: req.body.desc_fr || '', en: req.body.desc_en || '' },
            category: req.body.category || 'blog',
            date: req.body.date || new Date().toISOString().split('T')[0],
            image: imageUrl,
            createdAt: new Date().toISOString()
        };
        if (!Array.isArray(data.news)) data.news = [];
        data.news.push(item);
        await writeData(data);
        res.json({ success: true, item });
    } catch (e) {
        console.error('[AMPF] Upload to Cloudinary failed:', e.message);
        res.status(500).json({ error: 'فشل رفع الصورة إلى Cloudinary: ' + e.message });
    }
});

app.put('/api/news-with-image/:id', requireAuth, upload.single('image'), async (req, res) => {
    const data = await readData();
    const idx = data.news.findIndex(i => i.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'الخبر غير موجود' });

    if (req.file) {
        try {
            const imageUrl = await uploadToCloudinary(req.file);
            // Delete old image
            if (data.news[idx].image) {
                const pid = getFilePublicId(data.news[idx].image);
                if (pid) cloudinary.uploader.destroy(pid).catch(() => {});
            }
            data.news[idx].image = imageUrl;
        } catch (e) {
            console.error('[AMPF] Upload to Cloudinary failed:', e.message);
            return res.status(500).json({ error: 'فشل رفع الصورة إلى Cloudinary: ' + e.message });
        }
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

    await writeData(data);
    res.json({ success: true, item: data.news[idx] });
});

// =========================================================
//  SLIDER WITH IMAGE UPLOAD
// =========================================================
app.post('/api/slider-with-image', requireAuth, upload.single('image'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'يرجى اختيار صورة' });
    try {
        const imageUrl = await uploadToCloudinary(req.file);
        const data = await readData();
        const item = {
            id: Date.now().toString(),
            image: imageUrl,
            title: { ar: req.body.title_ar || '', fr: req.body.title_fr || '', en: req.body.title_en || '' },
            desc: { ar: req.body.desc_ar || '', fr: req.body.desc_fr || '', en: req.body.desc_en || '' },
            createdAt: new Date().toISOString()
        };
        if (!Array.isArray(data.slider)) data.slider = [];
        data.slider.push(item);
        await writeData(data);
        res.json({ success: true, item });
    } catch (e) {
        console.error('[AMPF] Upload to Cloudinary failed:', e.message);
        res.status(500).json({ error: 'فشل رفع الصورة إلى Cloudinary: ' + e.message });
    }
});

app.put('/api/slider-with-image/:id', requireAuth, upload.single('image'), async (req, res) => {
    const data = await readData();
    const idx = (data.slider || []).findIndex(i => i.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'العنصر غير موجود' });

    if (req.file) {
        try {
            const imageUrl = await uploadToCloudinary(req.file);
            // Delete old image
            if (data.slider[idx].image) {
                const pid = getFilePublicId(data.slider[idx].image);
                if (pid) cloudinary.uploader.destroy(pid).catch(() => {});
            }
            data.slider[idx].image = imageUrl;
        } catch (e) {
            console.error('[AMPF] Upload to Cloudinary failed:', e.message);
            return res.status(500).json({ error: 'فشل رفع الصورة إلى Cloudinary: ' + e.message });
        }
    }
    if (req.body.title_ar !== undefined) {
        data.slider[idx].title = {
            ar: req.body.title_ar || (data.slider[idx].title?.ar || ''),
            fr: req.body.title_fr || (data.slider[idx].title?.fr || ''),
            en: req.body.title_en || (data.slider[idx].title?.en || '')
        };
    }
    if (req.body.desc_ar !== undefined) {
        data.slider[idx].desc = {
            ar: req.body.desc_ar || (data.slider[idx].desc?.ar || ''),
            fr: req.body.desc_fr || (data.slider[idx].desc?.fr || ''),
            en: req.body.desc_en || (data.slider[idx].desc?.en || '')
        };
    }
    await writeData(data);
    res.json({ success: true, item: data.slider[idx] });
});

// =========================================================
//  BRANCHES WITH IMAGE UPLOAD
// =========================================================
app.post('/api/branches-with-image', requireAuth, upload.single('image'), async (req, res) => {
    try {
        const imageUrl = req.file ? await uploadToCloudinary(req.file) : '';
        const data = await readData();
        const item = {
            id: Date.now().toString(),
            name: { ar: req.body.name_ar || '', fr: req.body.name_fr || '', en: req.body.name_en || '' },
            founded: req.body.founded || '',
            location: { ar: req.body.location_ar || '', fr: req.body.location_fr || '', en: req.body.location_en || '' },
            gps: req.body.gps || '',
            midwife: { ar: req.body.midwife_ar || '', fr: req.body.midwife_fr || '', en: req.body.midwife_en || '' },
            phones: req.body.phones ? req.body.phones.split(',').map(p => p.trim()).filter(Boolean) : [],
            image: imageUrl,
            createdAt: new Date().toISOString()
        };
        if (!Array.isArray(data.branches)) data.branches = [];
        data.branches.push(item);
        await writeData(data);
        res.json({ success: true, item });
    } catch (e) {
        console.error('[AMPF] Upload to Cloudinary failed:', e.message);
        res.status(500).json({ error: 'فشل رفع الصورة إلى Cloudinary: ' + e.message });
    }
});

app.put('/api/branches-with-image/:id', requireAuth, upload.single('image'), async (req, res) => {
    const data = await readData();
    const idx = (data.branches || []).findIndex(i => i.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'الفرع غير موجود' });

    if (req.file) {
        try {
            const imageUrl = await uploadToCloudinary(req.file);
            if (data.branches[idx].image) {
                const pid = getFilePublicId(data.branches[idx].image);
                if (pid) cloudinary.uploader.destroy(pid).catch(() => {});
            }
            data.branches[idx].image = imageUrl;
        } catch (e) {
            console.error('[AMPF] Upload to Cloudinary failed:', e.message);
            return res.status(500).json({ error: 'فشل رفع الصورة إلى Cloudinary: ' + e.message });
        }
    }
    if (req.body.name_ar !== undefined) {
        data.branches[idx].name = {
            ar: req.body.name_ar || (data.branches[idx].name?.ar || ''),
            fr: req.body.name_fr || (data.branches[idx].name?.fr || ''),
            en: req.body.name_en || (data.branches[idx].name?.en || '')
        };
    }
    if (req.body.location_ar !== undefined) {
        data.branches[idx].location = {
            ar: req.body.location_ar || (data.branches[idx].location?.ar || ''),
            fr: req.body.location_fr || (data.branches[idx].location?.fr || ''),
            en: req.body.location_en || (data.branches[idx].location?.en || '')
        };
    }
    if (req.body.midwife_ar !== undefined) {
        data.branches[idx].midwife = {
            ar: req.body.midwife_ar || (data.branches[idx].midwife?.ar || ''),
            fr: req.body.midwife_fr || (data.branches[idx].midwife?.fr || ''),
            en: req.body.midwife_en || (data.branches[idx].midwife?.en || '')
        };
    }
    if (req.body.founded !== undefined) data.branches[idx].founded = req.body.founded;
    if (req.body.gps !== undefined) data.branches[idx].gps = req.body.gps;
    if (req.body.phones !== undefined) {
        data.branches[idx].phones = req.body.phones.split(',').map(p => p.trim()).filter(Boolean);
    }
    await writeData(data);
    res.json({ success: true, item: data.branches[idx] });
});

// =========================================================
//  GALLERY
// =========================================================
app.post('/api/gallery', requireAuth, upload.single('image'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'يرجى اختيار صورة' });
    try {
        const imageUrl = await uploadToCloudinary(req.file);
        const data = await readData();
        const item = {
            id: Date.now().toString(),
            title: req.body.title || 'صورة',
            image: imageUrl,
            createdAt: new Date().toISOString()
        };
        if (!Array.isArray(data.gallery)) data.gallery = [];
        data.gallery.push(item);
        await writeData(data);
        res.json({ success: true, item });
    } catch (e) {
        console.error('[AMPF] Upload to Cloudinary failed:', e.message);
        res.status(500).json({ error: 'فشل رفع الصورة إلى Cloudinary: ' + e.message });
    }
});

app.delete('/api/gallery/:id', requireAuth, async (req, res) => {
    const data = await readData();
    const idx = data.gallery.findIndex(i => i.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'الصورة غير موجودة' });
    if (data.gallery[idx].image) {
        const pid = getFilePublicId(data.gallery[idx].image);
        if (pid) cloudinary.uploader.destroy(pid).catch(() => {});
    }
    data.gallery.splice(idx, 1);
    await writeData(data);
    res.json({ success: true });
});

// =========================================================
//  SITE CONTENT
// =========================================================
app.get('/api/site-content', requireAuth, async (req, res) => {
    const data = await readData();
    res.json(data.site_content || {});
});

app.put('/api/site-content', requireAuth, async (req, res) => {
    const data = await readData();
    data.site_content = req.body;
    await writeData(data);
    res.json({ success: true, message: 'تم حفظ التغييرات' });
});

// File upload (generic) — uploaded straight to Cloudinary
app.post('/api/upload', requireAuth, upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'لم يتم رفع الملف' });
    try {
        const imageUrl = await uploadToCloudinary(req.file);
        res.json({ success: true, filename: req.file.originalname, path: imageUrl });
    } catch (e) {
        console.error('[AMPF] Upload to Cloudinary failed:', e.message);
        res.status(500).json({ error: 'فشل رفع الملف إلى Cloudinary: ' + e.message });
    }
});

// =========================================================
//  MESSAGES (from contact form)
// =========================================================
app.post('/api/messages', async (req, res) => {
    const data = await readData();
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
    await writeData(data);
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
