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
  whatsappEnabled: 'false'
};

async function query(text, params = []) {
  return pool.query(text, params);
}

async function getSettings() {
  const { rows } = await query('SELECT key,value FROM settings');
  return Object.fromEntries(rows.map(x => [x.key, x.value]));
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

async function sendWhatsAppOrder(order) {
  if (process.env.WHATSAPP_ENABLED !== 'true') return false;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const recipient = process.env.WHATSAPP_RECIPIENT_PHONE;
  if (!token || !phoneId || !recipient) return false;
  const s = await getSettings();
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

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

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
    if (!customerName || !customerPhone || !Array.isArray(items) || !items.length) return res.status(400).json({ error: 'يرجى إدخال الاسم والهاتف واختيار صنف واحد على الأقل' });
    const ids = items.map(x => Number(x.itemId)).filter(Boolean);
    if (!ids.length) return res.status(400).json({ error: 'الأصناف المختارة غير متاحة حالياً' });
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
    const { rows } = await query(`SELECT * FROM items WHERE id IN (${placeholders}) AND available=true`, ids);
    const map = new Map(rows.map(r => [Number(r.id), r]));
    const normalized = []; let total = 0;
    for (const x of items) {
      const r = map.get(Number(x.itemId));
      const qty = Math.max(1, Math.min(99, Number(x.quantity) || 1));
      if (!r) continue;
      normalized.push({ itemId: Number(r.id), name: r.name, price: Number(r.price), quantity: qty });
      total += Number(r.price) * qty;
    }
    if (!normalized.length) return res.status(400).json({ error: 'الأصناف المختارة غير متاحة حالياً' });
    const result = await query(
      'INSERT INTO orders(customer_name,customer_phone,address,notes,items_json,total) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',
      [customerName, customerPhone, address, notes, JSON.stringify(normalized), total]
    );
    const id = Number(result.rows[0].id);
    let whatsappSent = false;
    try {
      whatsappSent = await sendWhatsAppOrder({ id, customerName, customerPhone, address, notes, items: normalized, total });
      if (whatsappSent) await query('UPDATE orders SET whatsapp_sent=true WHERE id=$1', [id]);
    } catch (e) { console.error('WhatsApp error:', e.message); }
    const s = await getSettings();
    const waLink = s.phone ? `https://wa.me/${String(s.phone).replace(/\D/g, '')}?text=${encodeURIComponent(`مرحباً ${customerName}، تم استلام طلبك رقم #${id} بقيمة ${total} ${s.currency}.`)}` : '';
    res.status(201).json({ id, total, whatsappSent, waLink });
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
  try { const { category_id, name, description = '', price, image = '', available = true, featured = false } = req.body; if (!name || price === undefined) return res.status(400).json({ error: 'الاسم والسعر مطلوبان' }); const r = await query('INSERT INTO items(category_id,name,description,price,image,available,featured) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id', [category_id || null, name, description, Number(price), image, !!available, !!featured]); res.json({ id: Number(r.rows[0].id) }); } catch (e) { next(e); }
});
app.put('/api/admin/items/:id', auth, requirePerm('MANAGE_ITEMS'), async (req, res, next) => {
  try { const { category_id, name, description = '', price, image = '', available = true, featured = false } = req.body; await query('UPDATE items SET category_id=$1,name=$2,description=$3,price=$4,image=$5,available=$6,featured=$7 WHERE id=$8', [category_id || null, name, description, Number(price), image, !!available, !!featured, req.params.id]); res.json({ ok: true }); } catch (e) { next(e); }
});
app.delete('/api/admin/items/:id', auth, requirePerm('MANAGE_ITEMS'), async (req, res, next) => { try { await query('DELETE FROM items WHERE id=$1', [req.params.id]); res.json({ ok: true }); } catch (e) { next(e); } });

app.post('/api/admin/offers', auth, requirePerm('MANAGE_ITEMS'), async (req, res, next) => { try { const { title, description = '', price, image = '', active = true } = req.body; if (!title || price === undefined) return res.status(400).json({ error: 'العنوان والسعر مطلوبان' }); const r = await query('INSERT INTO offers(title,description,price,image,active) VALUES($1,$2,$3,$4,$5) RETURNING id', [title, description, Number(price), image, !!active]); res.json({ id: Number(r.rows[0].id) }); } catch (e) { next(e); } });
app.put('/api/admin/offers/:id', auth, requirePerm('MANAGE_ITEMS'), async (req, res, next) => { try { const { title, description = '', price, image = '', active = true } = req.body; await query('UPDATE offers SET title=$1,description=$2,price=$3,image=$4,active=$5 WHERE id=$6', [title, description, Number(price), image, !!active, req.params.id]); res.json({ ok: true }); } catch (e) { next(e); } });
app.delete('/api/admin/offers/:id', auth, requirePerm('MANAGE_ITEMS'), async (req, res, next) => { try { await query('DELETE FROM offers WHERE id=$1', [req.params.id]); res.json({ ok: true }); } catch (e) { next(e); } });

app.put('/api/admin/settings', auth, requirePerm('MANAGE_SETTINGS'), async (req, res, next) => { try { for (const [k, v] of Object.entries(req.body || {})) await query('INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value', [k, String(v)]); res.json({ settings: await getSettings() }); } catch (e) { next(e); } });
app.put('/api/admin/orders/:id', auth, requirePerm('RECEIVE_ORDERS'), async (req, res, next) => { try { const allowed = ['new','confirmed','preparing','ready','delivered','cancelled']; if (!allowed.includes(req.body.status)) return res.status(400).json({ error: 'حالة غير صالحة' }); await query('UPDATE orders SET status=$1 WHERE id=$2', [req.body.status, req.params.id]); res.json({ ok: true }); } catch (e) { next(e); } });

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

seed().then(() => app.listen(PORT, () => console.log(`Server running on port ${PORT}`))).catch(err => { console.error('Startup failed:', err); process.exit(1); });
