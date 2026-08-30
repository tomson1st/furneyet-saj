require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

const PORT = Number(process.env.PORT || 4000);
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL is required');

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30000
});

const settingDefaults = {
  siteName: 'فرنية صاج',
  tagline: 'مناقيش صاج طازة على كيفك',
  logoUrl: '',
  phone: '',
  currency: 'ل.ل',
  primary: '#9a3412',
  secondary: '#f59e0b',
  background: '#fffaf3',
  theme: 'classic',
  whatsappEnabled: 'false',
  whatsappRecipient: ''
};

async function query(text, params = []) {
  return pool.query(text, params);
}

async function getSettings() {
  const { rows } = await query('SELECT key,value FROM settings');
  return Object.fromEntries(rows.map(x => [x.key, x.value]));
}

async function ensureOrderHistoryTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS order_status_history (
      id BIGSERIAL PRIMARY KEY,
      order_id BIGINT NOT NULL,
      old_status VARCHAR(30),
      new_status VARCHAR(30) NOT NULL,
      changed_by BIGINT,
      changed_by_name VARCHAR(160),
      changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query('CREATE INDEX IF NOT EXISTS idx_order_status_history_order ON order_status_history(order_id, changed_at DESC)');
}

async function seed() {
  for (const [k, v] of Object.entries(settingDefaults)) {
    await query('INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO NOTHING', [k, String(v)]);
  }

  const count = (await query('SELECT COUNT(*)::int AS c FROM categories')).rows[0].c;
  if (count === 0) {
    const cat = await query('INSERT INTO categories(name,sort_order) VALUES ($1,$2),($3,$4),($5,$6) RETURNING id,name', [
      'مناقيش', 1, 'بيتزا صاج', 2, 'مشروبات', 3
    ]);
    const ids = Object.fromEntries(cat.rows.map(r => [r.name, r.id]));
    await query(`
      INSERT INTO items(category_id,name,description,price,featured,sort_order) VALUES
      ($1,'زعتر','زعتر بلدي مع زيت الزيتون',150000,true,1),
      ($1,'جبنة','خلطة جبنة كريمية وموزاريلا',250000,true,2),
      ($1,'لحمة بعجين','لحم متبل، بندورة وبصل',300000,false,3),
      ($2,'بيتزا خضار','خضار موسمية وجبنة',350000,true,1),
      ($3,'عصير برتقال','طازج يومياً',150000,false,1)
    `, [ids['مناقيش'], ids['بيتزا صاج'], ids['مشروبات']]);
    await query(`INSERT INTO offers(title,description,price,sort_order) VALUES ($1,$2,$3,$4)`, ['عرض الفطور','3 مناقيش زعتر + 2 جبنة',650000,1]);
  }

  const users = (await query('SELECT COUNT(*)::int AS c FROM users')).rows[0].c;
  if (users === 0) {
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'ChangeMe123!';
    await query(
      'INSERT INTO users(name,email,password_hash,role,permissions) VALUES($1,$2,$3,$4,$5)',
      ['المدير', adminEmail, bcrypt.hashSync(adminPassword, 12), 'admin', JSON.stringify(['MANAGE_ITEMS','RECEIVE_ORDERS','MANAGE_SETTINGS','MANAGE_USERS'])]
    );
    console.log(`Created initial admin: ${adminEmail}`);
  }
}

function publicSettings(s) { return { ...s, whatsappEnabled: s.whatsappEnabled === 'true' }; }

function auth(req, res, next) {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) return res.status(401).json({ error: 'غير مصرح' });
  try { req.user = jwt.verify(h.slice(7), JWT_SECRET); next(); }
  catch { return res.status(401).json({ error: 'انتهت الجلسة' }); }
}

function requirePerm(p) {
  return (req, res, next) => {
    if (req.user.role === 'admin' || (req.user.permissions || []).includes(p)) return next();
    return res.status(403).json({ error: 'لا تملك الصلاحية المطلوبة' });
  };
}

function tokenFor(u) {
  return jwt.sign({ id: Number(u.id), name: u.name, email: u.email, role: u.role, permissions: JSON.parse(u.permissions || '[]') }, JWT_SECRET, { expiresIn: '7d' });
}

function safeWhatsAppRecipient(s) { return s?.whatsappRecipient || ''; }

async function sendWhatsAppOrder(order) {
  const settings = await getSettings();
  const enabled = settings.whatsappEnabled === 'true' || process.env.WHATSAPP_ENABLED === 'true';
  if (!enabled) return false;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const recipient = String(safeWhatsAppRecipient(settings) || process.env.WHATSAPP_RECIPIENT_PHONE || '').replace(/\D/g, '');
  if (!token || !phoneId || !recipient) return false;
  const s = settings;
  const lines = order.items.map(i => `• ${i.name} × ${i.quantity} = ${Number(i.price) * i.quantity} ${s.currency}`).join('\n');
  const body = `طلب جديد #${order.id}\nالزبون: ${order.customerName}\nالهاتف: ${order.customerPhone}\nالعنوان: ${order.address || 'استلام من الفرنية'}\n\n${lines}\n\nالمجموع: ${order.total} ${s.currency}\nملاحظات: ${order.notes || '-'}`;
  const r = await fetch(`https://graph.facebook.com/v22.0/${phoneId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: recipient, type: 'text', text: { body } })
  });
  if (!r.ok) throw new Error(await r.text());
  return true;
}


async function sendWhatsAppStatusUpdate(orderId, status) {
  const settings = await getSettings();
  const enabled = settings.whatsappEnabled === 'true' || process.env.WHATSAPP_ENABLED === 'true';
  if (!enabled) return false;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const recipient = String(settings.whatsappRecipient || process.env.WHATSAPP_RECIPIENT_PHONE || '').replace(/\D/g, '');
  if (!token || !phoneId || !recipient) return false;
  const labels = { new: 'جديد', confirmed: 'مؤكد', preparing: 'قيد التحضير', ready: 'جاهز', delivered: 'تم التسليم', cancelled: 'ملغى' };
  const body = `تحديث طلب #${orderId}\nالحالة الجديدة: ${labels[status] || status}`;
  const r = await fetch(`https://graph.facebook.com/v22.0/${phoneId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: recipient, type: 'text', text: { body } })
  });
  if (!r.ok) throw new Error(await r.text());
  return true;
}

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '6mb' }));
app.use(morgan('dev'));


// Upload an item/offer image to Supabase Storage.
// Images are sent as a data URL from the admin UI; the server keeps the
// Supabase service-role key private and returns only the public image URL.
app.post('/api/admin/upload-image', auth, requirePerm('MANAGE_ITEMS'), async (req, res, next) => {
  try {
    const { dataUrl, fileName = 'image' } = req.body || {};
    if (!dataUrl || typeof dataUrl !== 'string') {
      return res.status(400).json({ error: 'الصورة مطلوبة.' });
    }

    const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/);
    if (!match) {
      return res.status(400).json({ error: 'نوع الصورة غير مدعوم. استخدم JPG أو PNG أو WEBP أو GIF.' });
    }

    const supabaseUrl = String(process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
    const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    const bucket = String(process.env.SUPABASE_STORAGE_BUCKET || 'furneyet-saj').trim();

    if (!supabaseUrl || !serviceKey) {
      console.error('[upload-image] Missing Supabase Storage environment variables.');
      return res.status(500).json({
        error: 'إعدادات رفع الصور غير مكتملة في Render. يجب إضافة SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY.'
      });
    }

    if (!/^https?:\/\//i.test(supabaseUrl)) {
      return res.status(500).json({ error: 'قيمة SUPABASE_URL غير صحيحة في Render.' });
    }

    const bytes = Buffer.from(match[2], 'base64');
    if (bytes.length === 0) return res.status(400).json({ error: 'ملف الصورة فارغ أو تالف.' });
    if (bytes.length > 4 * 1024 * 1024) {
      return res.status(400).json({ error: 'حجم الصورة يجب ألا يتجاوز 4MB.' });
    }

    const ext = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif'
    }[match[1]];

    const safeBase = String(fileName)
      .replace(/\.[^/.]+$/, '')
      .replace(/[^a-zA-Z0-9_-]/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 50) || 'image';

    const objectPath = `items/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeBase}.${ext}`;
    const authHeaders = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`
    };

    // 1) Make sure the bucket exists. A 404 means it needs to be created.
    const bucketCheck = await fetch(
      `${supabaseUrl}/storage/v1/bucket/${encodeURIComponent(bucket)}`,
      { headers: authHeaders }
    );

    if (!bucketCheck.ok) {
      const checkText = await bucketCheck.text().catch(() => '');
      console.log(`[upload-image] Bucket check: ${bucketCheck.status} ${checkText}`);

      if (bucketCheck.status !== 404) {
        return res.status(500).json({
          error: `تعذر الوصول إلى Storage Bucket «${bucket}». تأكد من SUPABASE_SERVICE_ROLE_KEY.`,
          details: checkText.slice(0, 300)
        });
      }

      const create = await fetch(`${supabaseUrl}/storage/v1/bucket`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: bucket, name: bucket, public: true })
      });

      if (!create.ok && create.status !== 409) {
        const createText = await create.text().catch(() => '');
        console.error(`[upload-image] Bucket creation failed: ${create.status} ${createText}`);
        return res.status(500).json({
          error: `تعذر إنشاء Storage Bucket «${bucket}». أنشئه يدوياً في Supabase Storage ثم أعد المحاولة.`,
          details: createText.slice(0, 300)
        });
      }
    }

    // 2) Upload the binary image. Service-role credentials stay on the server.
    const upload = await fetch(
      `${supabaseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${objectPath}`,
      {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': match[1],
          'x-upsert': 'false',
          'cache-control': '3600'
        },
        body: bytes
      }
    );

    if (!upload.ok) {
      const uploadText = await upload.text().catch(() => '');
      console.error(`[upload-image] Upload failed: ${upload.status} ${uploadText}`);
      return res.status(500).json({
        error: 'فشل رفع الصورة إلى Supabase Storage.',
        details: uploadText.slice(0, 500)
      });
    }

    const url = `${supabaseUrl}/storage/v1/object/public/${encodeURIComponent(bucket)}/${objectPath}`;
    console.log(`[upload-image] Success: ${objectPath}`);
    return res.json({ url });
  } catch (e) {
    console.error('[upload-image] Unexpected error:', e);
    return res.status(500).json({
      error: 'حدث خطأ غير متوقع أثناء رفع الصورة.',
      details: String(e?.message || e).slice(0, 500)
    });
  }
});


// Upload the site logo. This endpoint is separate from item uploads so a
// settings-only employee can manage the logo without receiving item rights.
app.post('/api/admin/upload-logo', auth, requirePerm('MANAGE_SETTINGS'), async (req, res) => {
  try {
    const { dataUrl, fileName = 'logo' } = req.body || {};
    if (!dataUrl || typeof dataUrl !== 'string') return res.status(400).json({ error: 'صورة الشعار مطلوبة.' });
    const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/);
    if (!match) return res.status(400).json({ error: 'نوع الشعار غير مدعوم. استخدم JPG أو PNG أو WEBP أو GIF.' });

    const supabaseUrl = String(process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
    const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    const bucket = String(process.env.SUPABASE_STORAGE_BUCKET || 'furneyet-saj').trim();
    if (!supabaseUrl || !serviceKey) {
      return res.status(500).json({ error: 'إعدادات رفع الصور غير مكتملة في Render. يجب إضافة SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY.' });
    }
    const bytes = Buffer.from(match[2], 'base64');
    if (!bytes.length) return res.status(400).json({ error: 'ملف الشعار فارغ أو تالف.' });
    if (bytes.length > 4 * 1024 * 1024) return res.status(400).json({ error: 'حجم الشعار يجب ألا يتجاوز 4MB.' });

    const ext = {'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif'}[match[1]];
    const safeBase = String(fileName).replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').slice(0, 50) || 'logo';
    const objectPath = `logos/${Date.now()}-${Math.random().toString(36).slice(2,8)}-${safeBase}.${ext}`;
    const authHeaders = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };

    const bucketCheck = await fetch(`${supabaseUrl}/storage/v1/bucket/${encodeURIComponent(bucket)}`, {headers:authHeaders});
    if (!bucketCheck.ok && bucketCheck.status !== 404) {
      const text = await bucketCheck.text().catch(()=> '');
      return res.status(500).json({error:`تعذر الوصول إلى Storage Bucket «${bucket}».`,details:text.slice(0,300)});
    }
    if (bucketCheck.status === 404) {
      const create = await fetch(`${supabaseUrl}/storage/v1/bucket`, {method:'POST',headers:{...authHeaders,'Content-Type':'application/json'},body:JSON.stringify({id:bucket,name:bucket,public:true})});
      if (!create.ok && create.status !== 409) {
        const text = await create.text().catch(()=> '');
        return res.status(500).json({error:`تعذر إنشاء Storage Bucket «${bucket}».`,details:text.slice(0,300)});
      }
    }

    const upload = await fetch(`${supabaseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${objectPath}`, {
      method:'POST', headers:{...authHeaders,'Content-Type':match[1],'x-upsert':'false','cache-control':'3600'}, body:bytes
    });
    if (!upload.ok) {
      const text = await upload.text().catch(()=> '');
      return res.status(500).json({error:'فشل رفع الشعار إلى Supabase Storage.',details:text.slice(0,500)});
    }
    const url = `${supabaseUrl}/storage/v1/object/public/${encodeURIComponent(bucket)}/${objectPath}`;
    console.log(`[upload-logo] Success: ${objectPath}`);
    return res.json({url});
  } catch (e) {
    console.error('[upload-logo] Unexpected error:', e);
    return res.status(500).json({error:'حدث خطأ غير متوقع أثناء رفع الشعار.',details:String(e?.message||e).slice(0,500)});
  }
});

app.get('/api/store', async (req, res, next) => {
  try {
    const settings = publicSettings(await getSettings());
    const [categories, items, offers] = await Promise.all([
      query('SELECT * FROM categories ORDER BY sort_order,id'),
      query('SELECT * FROM items WHERE available=true ORDER BY sort_order,id'),
      query('SELECT * FROM offers WHERE active=true ORDER BY sort_order,id')
    ]);
    res.json({
      settings,
      categories: categories.rows,
      items: items.rows.map(x => ({ ...x, featured: !!x.featured, available: !!x.available })),
      offers: offers.rows
    });
  } catch (e) { next(e); }
});

app.post('/api/orders', async (req, res, next) => {
  try {
    const { customerName, customerPhone, address = '', notes = '', items = [] } = req.body || {};
    if (!customerName || !customerPhone || !Array.isArray(items) || !items.length) {
      return res.status(400).json({ error: 'يرجى إدخال الاسم والهاتف واختيار صنف واحد على الأقل' });
    }

    const itemIds = items.map(x => Number(x.itemId)).filter(n => Number.isInteger(n) && n > 0);
    const offerIds = items
      .map(x => Number(x.offerId || (typeof x.itemId === 'string' && x.itemId.startsWith('offer-') ? x.itemId.slice(6) : NaN)))
      .filter(n => Number.isInteger(n) && n > 0);

    const itemRows = itemIds.length
      ? (await query(`SELECT * FROM items WHERE id IN (${itemIds.map((_, i) => `$${i + 1}`).join(',')}) AND available=true`, itemIds)).rows
      : [];
    const offerRows = offerIds.length
      ? (await query(`SELECT * FROM offers WHERE id IN (${offerIds.map((_, i) => `$${i + 1}`).join(',')})`, offerIds)).rows
      : [];

    const itemMap = new Map(itemRows.map(r => [Number(r.id), r]));
    const offerMap = new Map(offerRows.map(r => [Number(r.id), r]));
    const normalized = [];
    let total = 0;

    for (const x of items) {
      const qty = Math.max(1, Math.min(99, Number(x.quantity) || 1));
      const numericItemId = Number(x.itemId);
      const offerId = Number(x.offerId || (typeof x.itemId === 'string' && x.itemId.startsWith('offer-') ? x.itemId.slice(6) : NaN));

      if (Number.isInteger(offerId) && offerId > 0 && offerMap.has(offerId)) {
        const o = offerMap.get(offerId);
        const price = Number(o.price);
        normalized.push({ itemId: `offer-${offerId}`, offerId, name: o.title, price, quantity: qty, type: 'offer' });
        total += price * qty;
        continue;
      }

      if (Number.isInteger(numericItemId) && numericItemId > 0 && itemMap.has(numericItemId)) {
        const r = itemMap.get(numericItemId);
        const price = Number(r.price);
        normalized.push({ itemId: Number(r.id), name: r.name, price, quantity: qty, type: 'item' });
        total += price * qty;
      }
    }

    if (!normalized.length) {
      return res.status(400).json({ error: 'الأصناف أو العروض المختارة غير متاحة حالياً' });
    }

    const result = await query(
      'INSERT INTO orders(customer_name,customer_phone,address,notes,items_json,total) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',
      [customerName, customerPhone, address, notes, JSON.stringify(normalized), total]
    );
    const id = Number(result.rows[0].id);

    await query(
      'INSERT INTO order_status_history(order_id,old_status,new_status,changed_by,changed_by_name) VALUES($1,$2,$3,$4,$5)',
      [id, null, 'new', null, 'الزبون']
    );

    let whatsappSent = false;
    try {
      whatsappSent = await sendWhatsAppOrder({ id, customerName, customerPhone, address, notes, items: normalized, total });
      if (whatsappSent) await query('UPDATE orders SET whatsapp_sent=true WHERE id=$1', [id]);
    } catch (e) { console.error('WhatsApp error:', e.message); }

    const s = await getSettings();
    const waLink = s.phone
      ? `https://wa.me/${String(s.phone).replace(/\D/g, '')}?text=${encodeURIComponent(`مرحباً ${customerName}، تم استلام طلبك رقم #${id} بقيمة ${total} ${s.currency}.`)}`
      : '';

    res.status(201).json({ id, total, whatsappSent, waLink });
  } catch (e) { next(e); }
});

app.get('/api/orders/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const phone = String(req.query.phone || '').replace(/\D/g, '');
    if (!Number.isInteger(id) || id <= 0 || !phone) return res.status(400).json({ error: 'رقم الطلب ورقم الهاتف مطلوبان' });
    const { rows } = await query('SELECT id, customer_phone, status, total FROM orders WHERE id=$1', [id]);
    const order = rows[0];
    if (!order || String(order.customer_phone).replace(/\D/g, '') !== phone) return res.status(404).json({ error: 'لم يتم العثور على طلب مطابق' });
    const s = await getSettings();
    res.json({ id: Number(order.id), status: order.status || 'new', total: Number(order.total), currency: s.currency });
  } catch (e) { next(e); }
});

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    const { rows } = await query('SELECT * FROM users WHERE email=$1 AND active=true', [email]);
    const u = rows[0];
    if (!u || !bcrypt.compareSync(password, u.password_hash)) return res.status(401).json({ error: 'البريد أو كلمة المرور غير صحيحة' });
    res.json({ token: tokenFor(u) });
  } catch (e) { next(e); }
});
app.get('/api/auth/me', auth, (req, res) => res.json({ user: req.user }));

app.post('/api/admin/whatsapp/test', auth, requirePerm('MANAGE_SETTINGS'), async (req, res, next) => {
  try {
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const settings = await getSettings();
    const recipient = String(settings.whatsappRecipient || process.env.WHATSAPP_RECIPIENT_PHONE || '').replace(/\D/g, '');
    const enabled = settings.whatsappEnabled === 'true' || process.env.WHATSAPP_ENABLED === 'true';
    if (!enabled) return res.status(400).json({ error: 'إرسال WhatsApp غير مفعّل. فعّله من إدارة الموقع أولاً.' });
    if (!token || !phoneId || !recipient) {
      return res.status(400).json({ error: 'إعدادات WhatsApp غير مكتملة. تأكد من WHATSAPP_ACCESS_TOKEN وWHATSAPP_PHONE_NUMBER_ID ورقم الاستقبال.' });
    }
    const r = await fetch(`https://graph.facebook.com/v22.0/${phoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: recipient, type: 'text', text: { body: 'اختبار WhatsApp من موقع فرنية صاج ✓' } })
    });
    if (!r.ok) return res.status(502).json({ error: `فشل إرسال اختبار WhatsApp: ${await r.text()}` });
    res.json({ ok: true, message: 'تم إرسال رسالة الاختبار بنجاح.' });
  } catch (e) { next(e); }
});

app.get('/api/admin/data', auth, async (req, res, next) => {
  try {
    const [categories, items, offers, orders, users, settings] = await Promise.all([
      query('SELECT * FROM categories ORDER BY sort_order,id'),
      query('SELECT * FROM items ORDER BY sort_order,id'),
      query('SELECT * FROM offers ORDER BY sort_order,id'),
      query('SELECT * FROM orders ORDER BY id DESC LIMIT 100'),
      query('SELECT id,name,email,role,permissions,active,created_at FROM users ORDER BY id'),
      getSettings()
    ]);
    res.json({
      categories: categories.rows,
      items: items.rows.map(x => ({ ...x, available: !!x.available, featured: !!x.featured })),
      offers: offers.rows.map(x => ({ ...x, active: !!x.active })),
      orders: orders.rows.map(o => ({ ...o, id: Number(o.id), total: Number(o.total), items: JSON.parse(o.items_json), whatsapp_sent: !!o.whatsapp_sent })),
      settings,
      users: users.rows.map(u => ({ ...u, id: Number(u.id), permissions: JSON.parse(u.permissions || '[]'), active: !!u.active }))
    });
  } catch (e) { next(e); }
});

app.post('/api/admin/categories', auth, requirePerm('MANAGE_ITEMS'), async (req, res, next) => {
  try { const { name } = req.body; if (!name) return res.status(400).json({ error: 'الاسم مطلوب' }); const r = await query('INSERT INTO categories(name) VALUES($1) RETURNING id', [name]); res.json({ id: Number(r.rows[0].id) }); } catch (e) { next(e); }
});
app.put('/api/admin/categories/:id', auth, requirePerm('MANAGE_ITEMS'), async (req, res, next) => { try { await query('UPDATE categories SET name=$1 WHERE id=$2', [req.body.name, req.params.id]); res.json({ ok: true }); } catch (e) { next(e); } });
app.delete('/api/admin/categories/:id', auth, requirePerm('MANAGE_ITEMS'), async (req, res, next) => { try { await query('DELETE FROM categories WHERE id=$1', [req.params.id]); res.json({ ok: true }); } catch (e) { next(e); } });

app.post('/api/admin/items', auth, requirePerm('MANAGE_ITEMS'), async (req, res, next) => {
  try { const { category_id, name, description = '', price, image = '', available = true, featured = false, sort_order = 0 } = req.body; if (!name || price === undefined) return res.status(400).json({ error: 'الاسم والسعر مطلوبان' }); const r = await query('INSERT INTO items(category_id,name,description,price,image,available,featured,sort_order) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id', [category_id || null, name, description, Number(price), image, !!available, !!featured, Number(sort_order) || 0]); res.json({ id: Number(r.rows[0].id) }); } catch (e) { next(e); }
});
app.put('/api/admin/items/:id', auth, requirePerm('MANAGE_ITEMS'), async (req, res, next) => {
  try { const { category_id, name, description = '', price, image = '', available = true, featured = false, sort_order = 0 } = req.body; await query('UPDATE items SET category_id=$1,name=$2,description=$3,price=$4,image=$5,available=$6,featured=$7,sort_order=$8 WHERE id=$9', [category_id || null, name, description, Number(price), image, !!available, !!featured, Number(sort_order) || 0, req.params.id]); res.json({ ok: true }); } catch (e) { next(e); }
});
app.delete('/api/admin/items/:id', auth, requirePerm('MANAGE_ITEMS'), async (req, res, next) => { try { await query('DELETE FROM items WHERE id=$1', [req.params.id]); res.json({ ok: true }); } catch (e) { next(e); } });

app.post('/api/admin/offers', auth, requirePerm('MANAGE_ITEMS'), async (req, res, next) => { try { const { title, description = '', price, image = '', active = true, sort_order = 0 } = req.body; if (!title || price === undefined) return res.status(400).json({ error: 'العنوان والسعر مطلوبان' }); const r = await query('INSERT INTO offers(title,description,price,image,active,sort_order) VALUES($1,$2,$3,$4,$5,$6) RETURNING id', [title, description, Number(price), image, !!active, Number(sort_order) || 0]); res.json({ id: Number(r.rows[0].id) }); } catch (e) { next(e); } });
app.put('/api/admin/offers/:id', auth, requirePerm('MANAGE_ITEMS'), async (req, res, next) => { try { const { title, description = '', price, image = '', active = true, sort_order = 0 } = req.body; await query('UPDATE offers SET title=$1,description=$2,price=$3,image=$4,active=$5,sort_order=$6 WHERE id=$7', [title, description, Number(price), image, !!active, Number(sort_order) || 0, req.params.id]); res.json({ ok: true }); } catch (e) { next(e); } });
app.delete('/api/admin/offers/:id', auth, requirePerm('MANAGE_ITEMS'), async (req, res, next) => { try { await query('DELETE FROM offers WHERE id=$1', [req.params.id]); res.json({ ok: true }); } catch (e) { next(e); } });

app.put('/api/admin/settings', auth, requirePerm('MANAGE_SETTINGS'), async (req, res, next) => { try { for (const [k, v] of Object.entries(req.body || {})) await query('INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value', [k, String(v)]); res.json({ settings: await getSettings() }); } catch (e) { next(e); } });
app.put('/api/admin/orders/:id', auth, requirePerm('RECEIVE_ORDERS'), async (req, res, next) => {
  try {
    const allowed = ['new','confirmed','preparing','ready','delivered','cancelled'];
    const nextStatus = req.body.status;
    if (!allowed.includes(nextStatus)) return res.status(400).json({ error: 'حالة غير صالحة' });
    const found = await query('SELECT id,status FROM orders WHERE id=$1', [req.params.id]);
    const order = found.rows[0];
    if (!order) return res.status(404).json({ error: 'الطلب غير موجود' });
    const previousStatus = order.status || 'new';
    if (previousStatus === nextStatus) return res.json({ ok: true, unchanged: true });
    await query('UPDATE orders SET status=$1 WHERE id=$2', [nextStatus, req.params.id]);
    await query(
      'INSERT INTO order_status_history(order_id,old_status,new_status,changed_by,changed_by_name) VALUES($1,$2,$3,$4,$5)',
      [req.params.id, previousStatus, nextStatus, req.user.id, req.user.name || req.user.email || 'الإدارة']
    );
    let whatsappStatusSent = false;
    try { whatsappStatusSent = await sendWhatsAppStatusUpdate(Number(req.params.id), nextStatus); }
    catch (e) { console.error('WhatsApp status error:', e.message); }
    res.json({ ok: true, previousStatus, status: nextStatus, whatsappStatusSent });
  } catch (e) { next(e); }
});

app.get('/api/admin/orders/:id/history', auth, requirePerm('RECEIVE_ORDERS'), async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT id,old_status,new_status,changed_by,changed_by_name,changed_at FROM order_status_history WHERE order_id=$1 ORDER BY changed_at DESC,id DESC',
      [req.params.id]
    );
    res.json({ history: rows.map(x => ({ ...x, id: Number(x.id), order_id: Number(req.params.id), changed_by: x.changed_by == null ? null : Number(x.changed_by) })) });
  } catch (e) { next(e); }
});

app.post('/api/admin/users', auth, requirePerm('MANAGE_USERS'), async (req, res, next) => {
  try { const { name, email, password, role = 'staff', permissions = [] } = req.body; if (!name || !email || !password) return res.status(400).json({ error: 'الاسم والبريد وكلمة المرور مطلوبة' }); const r = await query('INSERT INTO users(name,email,password_hash,role,permissions) VALUES($1,$2,$3,$4,$5) RETURNING id', [name, email, bcrypt.hashSync(password, 12), role, JSON.stringify(permissions)]); res.json({ id: Number(r.rows[0].id) }); }
  catch (e) { if (e.code === '23505') return res.status(400).json({ error: 'البريد مستخدم مسبقاً' }); next(e); }
});
app.put('/api/admin/users/:id', auth, requirePerm('MANAGE_USERS'), async (req, res, next) => {
  try { const { name, email, password, role, permissions, active } = req.body; const found = await query('SELECT * FROM users WHERE id=$1', [req.params.id]); const u = found.rows[0]; if (!u) return res.status(404).json({ error: 'المستخدم غير موجود' }); const hash = password ? bcrypt.hashSync(password, 12) : u.password_hash; await query('UPDATE users SET name=$1,email=$2,password_hash=$3,role=$4,permissions=$5,active=$6 WHERE id=$7', [name, email, hash, role, JSON.stringify(permissions || []), !!active, req.params.id]); res.json({ ok: true }); }
  catch (e) { if (e.code === '23505') return res.status(400).json({ error: 'البريد مستخدم مسبقاً' }); next(e); }
});
app.delete('/api/admin/users/:id', auth, requirePerm('MANAGE_USERS'), async (req, res, next) => { try { if (Number(req.params.id) === Number(req.user.id)) return res.status(400).json({ error: 'لا يمكنك حذف حسابك الحالي' }); await query('DELETE FROM users WHERE id=$1', [req.params.id]); res.json({ ok: true }); } catch (e) { next(e); } });

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

const clientDist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'حدث خطأ في الخادم' }); });

ensureOrderHistoryTable().then(() => seed()).then(() => app.listen(PORT, () => console.log(`Server running on port ${PORT}`))).catch(err => { console.error('Startup failed:', err); process.exit(1); });
