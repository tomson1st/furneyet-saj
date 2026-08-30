require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 4000);
const JWT_SECRET = String(process.env.JWT_SECRET || '').trim();
if (!JWT_SECRET || JWT_SECRET.length < 32) throw new Error('JWT_SECRET is required and must be at least 32 characters long');
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

const SETTING_ALIASES = {
  site_name: 'siteName',
  site_title: 'siteName',
  tagline_text: 'tagline',
  logo_url: 'logoUrl',
  logo: 'logoUrl',
  phone_number: 'phone',
  currency_code: 'currency',
  primary_color: 'primary',
  secondary_color: 'secondary',
  background_color: 'background',
  theme_name: 'theme',
  whatsapp_enabled: 'whatsappEnabled',
  whatsapp_recipient: 'whatsappRecipient',
  whatsapp_phone: 'whatsappRecipient'
};

async function getSettings() {
  const { rows } = await query('SELECT key,value FROM settings');
  const raw = Object.fromEntries(rows.map(x => [x.key, x.value]));
  const settings = { ...settingDefaults };

  // Support databases created by older versions that used snake_case keys.
  for (const [key, value] of Object.entries(raw)) {
    const canonical = SETTING_ALIASES[key] || key;
    if (Object.prototype.hasOwnProperty.call(settingDefaults, canonical) || canonical === 'whatsappRecipient') {
      // Canonical keys win when both old and new keys exist.
      if (!Object.prototype.hasOwnProperty.call(raw, canonical) || key === canonical) {
        settings[canonical] = value;
      }
    }
  }

  return settings;
}

async function migrateLegacySettings() {
  for (const [legacyKey, canonicalKey] of Object.entries(SETTING_ALIASES)) {
    const legacy = await query('SELECT value FROM settings WHERE key=$1 LIMIT 1', [legacyKey]);
    if (!legacy.rows[0]) continue;

    const canonical = await query('SELECT value FROM settings WHERE key=$1 LIMIT 1', [canonicalKey]);
    if (!canonical.rows[0]) {
      await query(
        'INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO NOTHING',
        [canonicalKey, legacy.rows[0].value]
      );
    }
    await query('DELETE FROM settings WHERE key=$1', [legacyKey]);
  }
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

async function ensurePhase2Schema(){
await query(`ALTER TABLE items ADD COLUMN IF NOT EXISTS allergens TEXT NOT NULL DEFAULT ''`);await query(`ALTER TABLE items ADD COLUMN IF NOT EXISTS options_json TEXT NOT NULL DEFAULT '[]'`);await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_user_id BIGINT`);await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC(14,2) NOT NULL DEFAULT 0`);await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_code VARCHAR(60)`);await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS estimated_ready_at TIMESTAMPTZ`);
await query(`CREATE TABLE IF NOT EXISTS customer_users(id BIGSERIAL PRIMARY KEY,name VARCHAR(100) NOT NULL,phone VARCHAR(30) NOT NULL UNIQUE,email VARCHAR(254) UNIQUE,password_hash TEXT NOT NULL,active BOOLEAN NOT NULL DEFAULT TRUE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
await query(`CREATE TABLE IF NOT EXISTS customer_addresses(id BIGSERIAL PRIMARY KEY,customer_user_id BIGINT NOT NULL REFERENCES customer_users(id) ON DELETE CASCADE,label VARCHAR(60) NOT NULL,address VARCHAR(300) NOT NULL,is_default BOOLEAN NOT NULL DEFAULT FALSE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
await query(`CREATE TABLE IF NOT EXISTS favorites(customer_user_id BIGINT NOT NULL REFERENCES customer_users(id) ON DELETE CASCADE,item_id BIGINT NOT NULL REFERENCES items(id) ON DELETE CASCADE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(customer_user_id,item_id))`);
await query(`CREATE TABLE IF NOT EXISTS order_reviews(id BIGSERIAL PRIMARY KEY,order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,customer_user_id BIGINT,rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),comment VARCHAR(500) NOT NULL DEFAULT '',created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(order_id))`);
await query(`CREATE TABLE IF NOT EXISTS delivery_zones(id BIGSERIAL PRIMARY KEY,name VARCHAR(100) NOT NULL,fee NUMERIC(14,2) NOT NULL DEFAULT 0,min_order NUMERIC(14,2) NOT NULL DEFAULT 0,active BOOLEAN NOT NULL DEFAULT TRUE,sort_order INTEGER NOT NULL DEFAULT 0)`);
await query(`CREATE TABLE IF NOT EXISTS coupons(id BIGSERIAL PRIMARY KEY,code VARCHAR(60) NOT NULL UNIQUE,type VARCHAR(20) NOT NULL DEFAULT 'fixed',value NUMERIC(14,2) NOT NULL DEFAULT 0,min_order NUMERIC(14,2) NOT NULL DEFAULT 0,max_uses INTEGER,used_count INTEGER NOT NULL DEFAULT 0,active BOOLEAN NOT NULL DEFAULT TRUE,starts_at TIMESTAMPTZ,ends_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
await query(`CREATE TABLE IF NOT EXISTS coupon_redemptions(coupon_id BIGINT NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,customer_user_id BIGINT,order_id BIGINT REFERENCES orders(id) ON DELETE CASCADE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(coupon_id,order_id))`);
await query(`CREATE TABLE IF NOT EXISTS loyalty_accounts(customer_user_id BIGINT PRIMARY KEY REFERENCES customer_users(id) ON DELETE CASCADE,points INTEGER NOT NULL DEFAULT 0,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
await query(`CREATE TABLE IF NOT EXISTS loyalty_transactions(id BIGSERIAL PRIMARY KEY,customer_user_id BIGINT NOT NULL REFERENCES customer_users(id) ON DELETE CASCADE,points INTEGER NOT NULL,reason VARCHAR(200) NOT NULL,order_id BIGINT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
await query(`CREATE TABLE IF NOT EXISTS notifications(id BIGSERIAL PRIMARY KEY,customer_user_id BIGINT,order_id BIGINT,channel VARCHAR(20) NOT NULL,title VARCHAR(160) NOT NULL,body VARCHAR(1000) NOT NULL,sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),status VARCHAR(20) NOT NULL DEFAULT 'sent')`);
await query(`CREATE TABLE IF NOT EXISTS audit_logs(id BIGSERIAL PRIMARY KEY,user_id BIGINT,action VARCHAR(120) NOT NULL,entity_type VARCHAR(60),entity_id BIGINT,details TEXT NOT NULL DEFAULT '',created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
await query(`CREATE TABLE IF NOT EXISTS employee_schedules(id BIGSERIAL PRIMARY KEY,user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,weekday INTEGER NOT NULL CHECK(weekday BETWEEN 0 AND 6),start_time TIME,end_time TIME,active BOOLEAN NOT NULL DEFAULT TRUE,UNIQUE(user_id,weekday))`);
await query('CREATE INDEX IF NOT EXISTS idx_orders_customer_user ON orders(customer_user_id)');await query('CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at)');
}
function customerAuth(req,res,next){const t=parseCookies(req).customer_session;if(!t)return res.status(401).json({error:'يجب تسجيل الدخول'});try{const p=jwt.verify(t,JWT_SECRET);query('SELECT id,name,phone,email,active FROM customer_users WHERE id=$1',[p.id]).then(({rows})=>{const u=rows[0];if(!u||!u.active)return res.status(401).json({error:'الحساب غير فعال'});req.customer={id:Number(u.id),name:u.name,phone:u.phone,email:u.email};next()}).catch(next)}catch{return res.status(401).json({error:'انتهت الجلسة'})}}
function customerTokenFor(u){return jwt.sign({id:Number(u.id),type:'customer'},JWT_SECRET,{expiresIn:'30d'})}
function requireCustomerCsrf(req,res,next){const cookies=parseCookies(req);const token=cookies.customer_csrf;const header=String(req.get('X-CSRF-Token')||'');if(!token||!header||token.length!==header.length||!crypto.timingSafeEqual(Buffer.from(token),Buffer.from(header)))return res.status(403).json({error:'طلب غير صالح'});next()}
function audit(req,a,t='',id=null,d=''){return query('INSERT INTO audit_logs(user_id,action,entity_type,entity_id,details) VALUES($1,$2,$3,$4,$5)',[req.user?.id||null,a,t,id,d]).catch(()=>{})}
async function seed() {
  await migrateLegacySettings();
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
    const adminEmail = String(process.env.ADMIN_EMAIL || '').trim();
    const adminPassword = String(process.env.ADMIN_PASSWORD || '');
    if (!adminEmail || !adminPassword) throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD are required when creating the initial admin');
    await query(
      'INSERT INTO users(name,email,password_hash,role,permissions) VALUES($1,$2,$3,$4,$5)',
      ['المدير', adminEmail, bcrypt.hashSync(adminPassword, 12), 'admin', JSON.stringify(['MANAGE_ITEMS','RECEIVE_ORDERS','MANAGE_SETTINGS','MANAGE_USERS'])]
    );
    console.log(`Created initial admin: ${adminEmail}`);
  }
}

const PUBLIC_SETTING_KEYS = new Set([
  'siteName','tagline','logoUrl','phone','currency',
  'primary','secondary','background','theme','whatsappEnabled','whatsappRecipient'
]);

function publicSettings(s) {
  const out = {};
  for (const key of PUBLIC_SETTING_KEYS) {
    if (Object.prototype.hasOwnProperty.call(s, key)) out[key] = s[key];
  }
  out.whatsappEnabled = s.whatsappEnabled === 'true';
  return out;
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  return Object.fromEntries(
    header.split(';').map(v => v.trim()).filter(Boolean).map(v => {
      const i = v.indexOf('=');
      return i === -1 ? [v, ''] : [v.slice(0, i), decodeURIComponent(v.slice(i + 1))];
    })
  );
}

function setCookie(res, name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAge != null) parts.push(`Max-Age=${Math.floor(options.maxAge / 1000)}`);
  parts.push(`Path=${options.path || '/'}`);
  if (options.httpOnly) parts.push('HttpOnly');
  if (options.secure) parts.push('Secure');
  parts.push(`SameSite=${options.sameSite || 'Lax'}`);
  res.append('Set-Cookie', parts.join('; '));
}

function clearCookie(res, name) {
  setCookie(res, name, '', {
    maxAge: 0,
    httpOnly: name === 'session',
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax'
  });
}

function auth(req, res, next) {
  const cookies = parseCookies(req);
  const token = cookies.session;
  if (!token) return res.status(401).json({ error: 'غير مصرح' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (!payload?.id) return res.status(401).json({ error: 'جلسة غير صالحة' });

    query('SELECT id,name,email,role,permissions,active FROM users WHERE id=$1', [payload.id])
      .then(({ rows }) => {
        const u = rows[0];
        if (!u || !u.active) return res.status(401).json({ error: 'الحساب غير فعال' });

        let permissions = [];
        try { permissions = JSON.parse(u.permissions || '[]'); } catch {}
        req.user = {
          id: Number(u.id),
          name: u.name,
          email: u.email,
          role: u.role,
          permissions: Array.isArray(permissions) ? permissions : []
        };
        next();
      }).catch(next);
  } catch {
    return res.status(401).json({ error: 'انتهت الجلسة' });
  }
}

function requireCsrf(req, res, next) {
  const cookies = parseCookies(req);
  const header = String(req.get('X-CSRF-Token') || '');
  if (!cookies.csrf || !header || cookies.csrf.length !== header.length ||
      !crypto.timingSafeEqual(Buffer.from(cookies.csrf), Buffer.from(header))) {
    return res.status(403).json({ error: 'طلب غير صالح. أعد تحميل الصفحة وحاول مرة أخرى.' });
  }
  next();
}

function requirePerm(p) {
  return (req, res, next) => {
    if (req.user?.role === 'admin' || (req.user?.permissions || []).includes(p)) return next();
    return res.status(403).json({ error: 'لا تملك الصلاحية المطلوبة' });
  };
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'هذه العملية متاحة للمدير فقط' });
  next();
}

function tokenFor(u) {
  return jwt.sign({ id: Number(u.id) }, JWT_SECRET, { expiresIn: '2h' });
}

function safeWhatsAppRecipient(s) { return s?.whatsappRecipient || ''; }

const ALLOWED_THEMES = new Set(['classic','ramadan','eid','summer','national','custom']);
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

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
app.disable('x-powered-by');
app.set('trust proxy', 1);

const configuredOrigin = String(process.env.FRONTEND_ORIGIN || '').trim();
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});
app.use(cors(configuredOrigin ? { origin: configuredOrigin, credentials: true } : { origin: false }));
app.use(express.json({ limit: '6mb', strict: true }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

function memoryRateLimit({ windowMs, limit, message }) {
  const hits = new Map();
  return (req, res, next) => {
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const current = hits.get(key);
    if (!current || now - current.started >= windowMs) {
      hits.set(key, { started: now, count: 1 });
      return next();
    }
    current.count += 1;
    if (current.count > limit) {
      res.setHeader('Retry-After', Math.ceil((windowMs - (now - current.started)) / 1000));
      return res.status(429).json({ error: message });
    }
    next();
    if (hits.size > 10000) {
      for (const [k, v] of hits) if (now - v.started >= windowMs) hits.delete(k);
    }
  };
}

const apiLimiter = memoryRateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  message: 'طلبات كثيرة. حاول مرة أخرى بعد قليل.'
});
const loginLimiter = memoryRateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: 'محاولات تسجيل دخول كثيرة. حاول لاحقاً.'
});
const orderLimiter = memoryRateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  message: 'تم تجاوز الحد المسموح للطلبات. حاول لاحقاً.'
});
app.use('/api', apiLimiter);


app.post('/api/customer/register',orderLimiter,async(req,res,next)=>{try{const name=String(req.body?.name||'').trim(),phone=String(req.body?.phone||'').trim(),email=String(req.body?.email||'').trim().toLowerCase(),password=String(req.body?.password||'');if(!name||!phone||password.length<8)return res.status(400).json({error:'يرجى إدخال الاسم والهاتف وكلمة مرور من 8 أحرف على الأقل'});const r=await query('INSERT INTO customer_users(name,phone,email,password_hash) VALUES($1,$2,$3,$4) RETURNING id,name,phone,email',[name,phone,email||null,bcrypt.hashSync(password,12)]),u=r.rows[0];await query('INSERT INTO loyalty_accounts(customer_user_id) VALUES($1) ON CONFLICT DO NOTHING',[u.id]);setCookie(res,'customer_session',customerTokenFor(u),{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'Lax',maxAge:2592000000});const c=crypto.randomBytes(32).toString('hex');setCookie(res,'customer_csrf',c,{secure:process.env.NODE_ENV==='production',sameSite:'Lax',maxAge:2592000000});res.status(201).json({user:{id:Number(u.id),name:u.name,phone:u.phone,email:u.email}})}catch(e){if(e.code==='23505')return res.status(400).json({error:'رقم الهاتف أو البريد مستخدم مسبقاً'});next(e)}});
app.post('/api/customer/login',loginLimiter,async(req,res,next)=>{try{const id=String(req.body?.identifier||'').trim(),pw=String(req.body?.password||''),q=await query('SELECT * FROM customer_users WHERE (phone=$1 OR LOWER(email)=LOWER($1)) AND active=true',[id]),u=q.rows[0];if(!u||!bcrypt.compareSync(pw,u.password_hash))return res.status(401).json({error:'بيانات الدخول غير صحيحة'});setCookie(res,'customer_session',customerTokenFor(u),{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'Lax',maxAge:2592000000});const c=crypto.randomBytes(32).toString('hex');setCookie(res,'customer_csrf',c,{secure:process.env.NODE_ENV==='production',sameSite:'Lax',maxAge:2592000000});res.json({user:{id:Number(u.id),name:u.name,phone:u.phone,email:u.email}})}catch(e){next(e)}});
app.get('/api/customer/me',customerAuth,async(req,res,next)=>{try{const [a,f,l]=await Promise.all([query('SELECT id,label,address,is_default FROM customer_addresses WHERE customer_user_id=$1 ORDER BY is_default DESC,id',[req.customer.id]),query('SELECT item_id FROM favorites WHERE customer_user_id=$1',[req.customer.id]),query('SELECT points FROM loyalty_accounts WHERE customer_user_id=$1',[req.customer.id])]);res.json({user:req.customer,addresses:a.rows,favorites:f.rows.map(x=>Number(x.item_id)),points:Number(l.rows[0]?.points||0)})}catch(e){next(e)}});
app.post('/api/customer/logout',customerAuth,requireCustomerCsrf,(req,res)=>{clearCookie(res,'customer_session');clearCookie(res,'customer_csrf');res.json({ok:true})});
app.post('/api/customer/addresses',customerAuth,requireCustomerCsrf,async(req,res,next)=>{try{const label=String(req.body?.label||'').trim(),address=String(req.body?.address||'').trim();if(!label||!address||address.length>300)return res.status(400).json({error:'بيانات العنوان غير صالحة'});const r=await query('INSERT INTO customer_addresses(customer_user_id,label,address,is_default) VALUES($1,$2,$3,$4) RETURNING id,label,address,is_default',[req.customer.id,label,address,!!req.body?.is_default]);if(req.body?.is_default)await query('UPDATE customer_addresses SET is_default=false WHERE customer_user_id=$1 AND id<>$2',[req.customer.id,r.rows[0].id]);res.status(201).json(r.rows[0])}catch(e){next(e)}});
app.delete('/api/customer/addresses/:id',customerAuth,requireCustomerCsrf,async(req,res,next)=>{try{await query('DELETE FROM customer_addresses WHERE id=$1 AND customer_user_id=$2',[req.params.id,req.customer.id]);res.json({ok:true})}catch(e){next(e)}});
app.post('/api/customer/favorites/:itemId',customerAuth,requireCustomerCsrf,async(req,res,next)=>{try{const id=Number(req.params.itemId),q=await query('SELECT 1 FROM favorites WHERE customer_user_id=$1 AND item_id=$2',[req.customer.id,id]);if(q.rows[0])await query('DELETE FROM favorites WHERE customer_user_id=$1 AND item_id=$2',[req.customer.id,id]);else await query('INSERT INTO favorites(customer_user_id,item_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[req.customer.id,id]);res.json({favorite:!q.rows[0]})}catch(e){next(e)}});
app.get('/api/customer/orders',customerAuth,async(req,res,next)=>{try{const q=await query('SELECT * FROM orders WHERE customer_user_id=$1 ORDER BY id DESC LIMIT 100',[req.customer.id]);res.json({orders:q.rows.map(o=>({...o,id:Number(o.id),total:Number(o.total),items:JSON.parse(o.items_json)}))})}catch(e){next(e)}});
app.post('/api/customer/reorder/:id',customerAuth,async(req,res,next)=>{try{const q=await query('SELECT items_json FROM orders WHERE id=$1 AND customer_user_id=$2',[req.params.id,req.customer.id]);if(!q.rows[0])return res.status(404).json({error:'الطلب غير موجود'});res.json({items:JSON.parse(q.rows[0].items_json)})}catch(e){next(e)}});
app.post('/api/customer/reviews',customerAuth,requireCustomerCsrf,async(req,res,next)=>{try{const id=Number(req.body?.orderId),rating=Number(req.body?.rating),comment=String(req.body?.comment||'').trim();const q=await query("SELECT id FROM orders WHERE id=$1 AND customer_user_id=$2 AND status='delivered'",[id,req.customer.id]);if(!q.rows[0]||rating<1||rating>5)return res.status(400).json({error:'لا يمكن تقييم هذا الطلب'});await query('INSERT INTO order_reviews(order_id,customer_user_id,rating,comment) VALUES($1,$2,$3,$4) ON CONFLICT(order_id) DO UPDATE SET rating=EXCLUDED.rating,comment=EXCLUDED.comment',[id,req.customer.id,rating,comment]);res.json({ok:true})}catch(e){next(e)}});
app.get('/api/public/delivery-zones',async(req,res,next)=>{try{const q=await query('SELECT id,name,fee,min_order FROM delivery_zones WHERE active=true ORDER BY sort_order,id');res.json({zones:q.rows})}catch(e){next(e)}});
app.post('/api/public/coupon/validate',async(req,res,next)=>{try{const code=String(req.body?.code||'').trim().toUpperCase(),subtotal=Number(req.body?.subtotal||0),q=await query('SELECT * FROM coupons WHERE code=$1 AND active=true',[code]),c=q.rows[0],now=new Date();if(!c||c.starts_at&&new Date(c.starts_at)>now||c.ends_at&&new Date(c.ends_at)<now||c.max_uses!=null&&c.used_count>=c.max_uses)return res.status(400).json({error:'رمز الخصم غير صالح أو منتهي'});if(subtotal<Number(c.min_order))return res.status(400).json({error:'الحد الأدنى للطلب غير متحقق'});const discount=c.type==='percent'?Math.min(subtotal,subtotal*Number(c.value)/100):Math.min(subtotal,Number(c.value));res.json({code,discount,total:subtotal-discount})}catch(e){next(e)}});
// Upload an item/offer image to Supabase Storage.
// Images are sent as a data URL from the admin UI; the server keeps the
// Supabase service-role key private and returns only the public image URL.
app.post('/api/admin/upload-image', auth, requireCsrf, requirePerm('MANAGE_ITEMS'), async (req, res, next) => {
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
app.post('/api/admin/upload-logo', auth, requireCsrf, requirePerm('MANAGE_SETTINGS'), async (req, res) => {
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

app.post('/api/orders', orderLimiter, async (req, res, next) => {
  try {
    const customerName = String(req.body?.customerName || '').trim();
    const customerPhone = String(req.body?.customerPhone || '').trim();
    const address = String(req.body?.address || '').trim();
    const notes = String(req.body?.notes || '').trim();
    const items = req.body?.items;
    if (!customerName || !customerPhone || !Array.isArray(items) || !items.length || items.length > 50) {
      return res.status(400).json({ error: 'يرجى إدخال الاسم والهاتف واختيار صنف واحد على الأقل' });
    }
    if (customerName.length > 100 || customerPhone.length > 30 || address.length > 300 || notes.length > 500) {
      return res.status(400).json({ error: 'بعض بيانات الطلب طويلة جداً' });
    }

    const itemIds = items.map(x => Number(x.itemId)).filter(n => Number.isInteger(n) && n > 0);
    const offerIds = items
      .map(x => Number(x.offerId || (typeof x.itemId === 'string' && x.itemId.startsWith('offer-') ? x.itemId.slice(6) : NaN)))
      .filter(n => Number.isInteger(n) && n > 0);

    const itemRows = itemIds.length
      ? (await query(`SELECT * FROM items WHERE id IN (${itemIds.map((_, i) => `$${i + 1}`).join(',')}) AND available=true`, itemIds)).rows
      : [];
    const offerRows = offerIds.length
      ? (await query(`SELECT * FROM offers WHERE id IN (${offerIds.map((_, i) => `$${i + 1}`).join(',')}) AND active=true`, offerIds)).rows
      : [];

    const itemMap = new Map(itemRows.map(r => [Number(r.id), r]));
    const offerMap = new Map(offerRows.map(r => [Number(r.id), r]));
    const normalized = [];
    let total = 0;

    for (const x of items) {
      const rawQty = Number(x?.quantity);
      if (!Number.isInteger(rawQty) || rawQty < 1 || rawQty > 99) {
        return res.status(400).json({ error: 'كمية غير صالحة في الطلب' });
      }
      const qty = rawQty;
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
        const r = itemMap.get(numericItemId); let options=[]; try{options=Array.isArray(JSON.parse(r.options_json||'[]'))?JSON.parse(r.options_json||'[]'):[]}catch{}
        const selected=Array.isArray(x.options)?x.options.map(String):[]; const allowed=new Map(options.map(o=>[String(o.name),Number(o.price||0)]));
        if(selected.some(name=>!allowed.has(name))) return res.status(400).json({error:`خيارات التخصيص للصنف «${r.name}» غير صالحة`});
        const extra=selected.reduce((sum,name)=>sum+Math.max(0,allowed.get(name)),0); const price=Number(r.price)+extra;
        normalized.push({ itemId:Number(r.id), name:r.name, price, quantity:qty, type:'item', options:selected }); total += price * qty;
      }
    }

    if (!normalized.length || normalized.length !== items.length) {
      return res.status(400).json({ error: 'بعض الأصناف أو العروض المختارة غير متاحة حالياً' });
    }
    if (!Number.isFinite(total) || total < 0 || total > 1e12) {
      return res.status(400).json({ error: 'قيمة الطلب غير صالحة' });
    }

    let customerUserId=null;try{const cp=jwt.verify(parseCookies(req).customer_session||'',JWT_SECRET);const cq=await query('SELECT id FROM customer_users WHERE id=$1 AND active=true',[cp.id]);customerUserId=cq.rows[0]?Number(cq.rows[0].id):null}catch{}
    const couponCode=String(req.body?.couponCode||'').trim().toUpperCase();let discount=0;if(couponCode){const cq=await query('SELECT * FROM coupons WHERE code=$1 AND active=true',[couponCode]),c=cq.rows[0];if(!c)return res.status(400).json({error:'رمز الخصم غير صالح'});if(Number(c.min_order)>total)return res.status(400).json({error:'الحد الأدنى للطلب غير متحقق'});discount=c.type==='percent'?Math.min(total,total*Number(c.value)/100):Math.min(total,Number(c.value))}
    const deliveryFee=Number(req.body?.deliveryFee||0);if(!Number.isFinite(deliveryFee)||deliveryFee<0)return res.status(400).json({error:'رسم التوصيل غير صالح'});const finalTotal=Math.max(0,total-discount)+deliveryFee;const estimated=new Date(Date.now()+45*60000);
    const result = await query('INSERT INTO orders(customer_name,customer_phone,address,notes,items_json,total,customer_user_id,delivery_fee,coupon_code,estimated_ready_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id',[customerName,customerPhone,address,notes,JSON.stringify(normalized),finalTotal,customerUserId,deliveryFee,couponCode||null,estimated]);
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

    res.status(201).json({ id, total:finalTotal, subtotal:total, discount, deliveryFee, whatsappSent, waLink, estimatedReadyAt:estimated });
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
    res.json({ id:Number(order.id),status:order.status||'new',total:Number(order.total),currency:s.currency,estimatedReadyAt:order.estimated_ready_at });
  } catch (e) { next(e); }
});

app.post('/api/auth/login', loginLimiter, async (req, res, next) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!email || !password || email.length > 254 || password.length > 200) {
      return res.status(400).json({ error: 'بيانات تسجيل الدخول غير صالحة' });
    }
    const { rows } = await query('SELECT * FROM users WHERE email=$1 AND active=true', [email]);
    const u = rows[0];
    if (!u || !bcrypt.compareSync(password, u.password_hash)) {
      return res.status(401).json({ error: 'البريد أو كلمة المرور غير صحيحة' });
    }
    const csrf = crypto.randomBytes(32).toString('hex');
    setCookie(res, 'session', tokenFor(u), {
      httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'Lax', maxAge: 2 * 60 * 60 * 1000
    });
    setCookie(res, 'csrf', csrf, {
      httpOnly: false, secure: process.env.NODE_ENV === 'production', sameSite: 'Lax', maxAge: 2 * 60 * 60 * 1000
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});
app.post('/api/auth/logout', auth, requireCsrf, (req, res) => {
  clearCookie(res, 'session');
  clearCookie(res, 'csrf');
  res.json({ ok: true });
});
app.get('/api/auth/me', auth, (req, res) => res.json({ user: req.user }));
app.post('/api/admin/whatsapp/test', auth, requireCsrf, requirePerm('MANAGE_SETTINGS'), async (req, res, next) => {
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
    const isAdmin = req.user.role === 'admin';
    const canOrders = isAdmin || req.user.permissions.includes('RECEIVE_ORDERS');
    const canItems = isAdmin || req.user.permissions.includes('MANAGE_ITEMS');
    const canSettings = isAdmin || req.user.permissions.includes('MANAGE_SETTINGS');
    const canUsers = isAdmin || req.user.permissions.includes('MANAGE_USERS');

    const [categories, items, offers, orders, users, settings, zones, coupons, reviews] = await Promise.all([
      canItems ? query('SELECT * FROM categories ORDER BY sort_order,id') : Promise.resolve({ rows: [] }),
      canItems ? query('SELECT * FROM items ORDER BY sort_order,id') : Promise.resolve({ rows: [] }),
      canItems ? query('SELECT * FROM offers ORDER BY sort_order,id') : Promise.resolve({ rows: [] }),
      canOrders ? query('SELECT * FROM orders ORDER BY id DESC LIMIT 100') : Promise.resolve({ rows: [] }),
      canUsers ? query('SELECT id,name,email,role,permissions,active,created_at FROM users ORDER BY id') : Promise.resolve({ rows: [] }),
      canSettings ? getSettings() : getSettings().then(publicSettings), canItems?query('SELECT * FROM delivery_zones ORDER BY sort_order,id'):Promise.resolve({rows:[]}), canItems?query('SELECT * FROM coupons ORDER BY id DESC'):Promise.resolve({rows:[]}), canOrders?query('SELECT r.*,c.name AS customer_name FROM order_reviews r LEFT JOIN customer_users c ON c.id=r.customer_user_id ORDER BY r.id DESC LIMIT 100'):Promise.resolve({rows:[]})
    ]);

    res.json({
      categories: categories.rows,
      items: items.rows.map(x => ({ ...x, available: !!x.available, featured: !!x.featured })),
      offers: offers.rows.map(x => ({ ...x, active: !!x.active })), zones:zones.rows.map(x=>({...x,id:Number(x.id),fee:Number(x.fee),min_order:Number(x.min_order),active:!!x.active})), coupons:coupons.rows.map(x=>({...x,id:Number(x.id),value:Number(x.value),min_order:Number(x.min_order),active:!!x.active})), reviews:reviews.rows.map(x=>({...x,id:Number(x.id),rating:Number(x.rating)})),
      orders: orders.rows.map(o => ({ ...o, id: Number(o.id), total: Number(o.total), items: JSON.parse(o.items_json), whatsapp_sent: !!o.whatsapp_sent })),
      settings,
      users: users.rows.map(u => ({ ...u, id: Number(u.id), permissions: JSON.parse(u.permissions || '[]'), active: !!u.active }))
    });
  } catch (e) { next(e); }
});
app.post('/api/admin/categories', auth, requireCsrf, requirePerm('MANAGE_ITEMS'), async (req, res, next) => {
  try { const { name } = req.body; if (!name) return res.status(400).json({ error: 'الاسم مطلوب' }); const r = await query('INSERT INTO categories(name) VALUES($1) RETURNING id', [name]); res.json({ id: Number(r.rows[0].id) }); } catch (e) { next(e); }
});
app.put('/api/admin/categories/:id', auth, requireCsrf, requirePerm('MANAGE_ITEMS'), async (req, res, next) => { try { await query('UPDATE categories SET name=$1 WHERE id=$2', [req.body.name, req.params.id]); res.json({ ok: true }); } catch (e) { next(e); } });
app.delete('/api/admin/categories/:id', auth, requireCsrf, requirePerm('MANAGE_ITEMS'), async (req, res, next) => { try { await query('DELETE FROM categories WHERE id=$1', [req.params.id]); res.json({ ok: true }); } catch (e) { next(e); } });

app.post('/api/admin/items', auth, requireCsrf, requirePerm('MANAGE_ITEMS'), async (req, res, next) => {
  try { const { category_id, name, description = '', price, image = '', available = true, featured = false, sort_order = 0 } = req.body; if (!name || price === undefined) return res.status(400).json({ error: 'الاسم والسعر مطلوبان' }); const r = await query('INSERT INTO items(category_id,name,description,price,image,available,featured,sort_order) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id', [category_id || null, name, description, Number(price), image, !!available, !!featured, Number(sort_order) || 0]); res.json({ id: Number(r.rows[0].id) }); } catch (e) { next(e); }
});
app.put('/api/admin/items/:id', auth, requireCsrf, requirePerm('MANAGE_ITEMS'), async (req, res, next) => {
  try { const { category_id, name, description = '', price, image = '', available = true, featured = false, sort_order = 0, allergens = '', options_json = '[]' } = req.body; let opts='[]'; try{JSON.parse(options_json);opts=String(options_json)}catch{} await query('UPDATE items SET category_id=$1,name=$2,description=$3,price=$4,image=$5,available=$6,featured=$7,sort_order=$8,allergens=$9,options_json=$10 WHERE id=$11', [category_id || null, name, description, Number(price), image, !!available, !!featured, Number(sort_order) || 0, String(allergens).slice(0,500), opts, req.params.id]); res.json({ ok: true }); } catch (e) { next(e); }
});
app.delete('/api/admin/items/:id', auth, requireCsrf, requirePerm('MANAGE_ITEMS'), async (req, res, next) => { try { await query('DELETE FROM items WHERE id=$1', [req.params.id]); res.json({ ok: true }); } catch (e) { next(e); } });

app.post('/api/admin/offers', auth, requireCsrf, requirePerm('MANAGE_ITEMS'), async (req, res, next) => { try { const { title, description = '', price, image = '', active = true, sort_order = 0 } = req.body; if (!title || price === undefined) return res.status(400).json({ error: 'العنوان والسعر مطلوبان' }); const r = await query('INSERT INTO offers(title,description,price,image,active,sort_order) VALUES($1,$2,$3,$4,$5,$6) RETURNING id', [title, description, Number(price), image, !!active, Number(sort_order) || 0]); res.json({ id: Number(r.rows[0].id) }); } catch (e) { next(e); } });
app.put('/api/admin/offers/:id', auth, requireCsrf, requirePerm('MANAGE_ITEMS'), async (req, res, next) => { try { const { title, description = '', price, image = '', active = true, sort_order = 0 } = req.body; await query('UPDATE offers SET title=$1,description=$2,price=$3,image=$4,active=$5,sort_order=$6 WHERE id=$7', [title, description, Number(price), image, !!active, Number(sort_order) || 0, req.params.id]); res.json({ ok: true }); } catch (e) { next(e); } });
app.delete('/api/admin/offers/:id', auth, requireCsrf, requirePerm('MANAGE_ITEMS'), async (req, res, next) => { try { await query('DELETE FROM offers WHERE id=$1', [req.params.id]); res.json({ ok: true }); } catch (e) { next(e); } });

app.put('/api/admin/settings', auth, requireCsrf, requirePerm('MANAGE_SETTINGS'), async (req, res, next) => {
  try {
    const body = req.body || {};
    const invalid = Object.keys(body).find(k => !PUBLIC_SETTING_KEYS.has(k));
    if (invalid) return res.status(400).json({ error: `إعداد غير مسموح: ${invalid}` });

    const limits = {
      siteName: 100, tagline: 200, logoUrl: 2000, phone: 40, currency: 20,
      primary: 20, secondary: 20, background: 20, theme: 30, whatsappEnabled: 10, whatsappRecipient: 40
    };
    for (const [k, v] of Object.entries(body)) {
      const value = String(v ?? '').trim();
      if (value.length > limits[k]) return res.status(400).json({ error: `قيمة الإعداد «${k}» طويلة جداً` });
      if (['primary','secondary','background'].includes(k) && !HEX_COLOR.test(value)) {
        return res.status(400).json({ error: `لون غير صالح للإعداد «${k}»` });
      }
      if (k === 'theme' && !ALLOWED_THEMES.has(value)) {
        return res.status(400).json({ error: 'الثيم غير صالح' });
      }
      if (k === 'whatsappEnabled' && !['true','false'].includes(value)) {
        return res.status(400).json({ error: 'قيمة WhatsApp غير صالحة' });
      }
      if (k === 'whatsappRecipient' && value && !/^[0-9+()\-\s]{7,40}$/.test(value)) {
        return res.status(400).json({ error: 'رقم WhatsApp غير صالح' });
      }
      await query(
        'INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value',
        [k, value]
      );
    }
    res.json({ settings: await getSettings() });
  } catch (e) { next(e); }
});
app.put('/api/admin/orders/:id', auth, requireCsrf, requirePerm('RECEIVE_ORDERS'), async (req, res, next) => {
  try {
    const allowed = ['new','confirmed','preparing','ready','delivered','cancelled'];
    const nextStatus = req.body.status;
    if (!allowed.includes(nextStatus)) return res.status(400).json({ error: 'حالة غير صالحة' });
    const found = await query('SELECT id,status,customer_user_id FROM orders WHERE id=$1', [req.params.id]);
    const order = found.rows[0];
    if (!order) return res.status(404).json({ error: 'الطلب غير موجود' });
    const previousStatus = order.status || 'new';
    if (previousStatus === nextStatus) return res.json({ ok: true, unchanged: true });
    await query('UPDATE orders SET status=$1 WHERE id=$2', [nextStatus, req.params.id]);
    await query(
      'INSERT INTO order_status_history(order_id,old_status,new_status,changed_by,changed_by_name) VALUES($1,$2,$3,$4,$5)',
      [req.params.id, previousStatus, nextStatus, req.user.id, req.user.name || req.user.email || 'الإدارة']
    );
    const labels = {new:'جديد',confirmed:'مؤكد',preparing:'قيد التحضير',ready:'جاهز',delivered:'تم التسليم',cancelled:'ملغى'};
    if(order.customer_user_id) await query('INSERT INTO notifications(customer_user_id,order_id,channel,title,body) VALUES($1,$2,$3,$4,$5)',[order.customer_user_id,Number(req.params.id),'in-app',`تحديث الطلب #${req.params.id}`,`حالة طلبك الآن: ${labels[nextStatus]||nextStatus}`]);
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

app.post('/api/admin/users', auth, requireCsrf, requireAdmin, requirePerm('MANAGE_USERS'), async (req, res, next) => {
  try {
    const name = String(req.body?.name || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const role = String(req.body?.role || 'staff');
    const permissions = Array.isArray(req.body?.permissions) ? req.body.permissions : [];
    const allowedPermissions = new Set(['MANAGE_ITEMS','RECEIVE_ORDERS','MANAGE_SETTINGS','MANAGE_USERS','ADD_ADMIN']);

    if (!name || name.length > 100 || !email || email.length > 254 || !password || password.length < 10 || password.length > 200) {
      return res.status(400).json({ error: 'بيانات المستخدم غير صالحة. كلمة المرور يجب أن تكون 10 أحرف على الأقل.' });
    }
    if (!['staff','admin'].includes(role) || permissions.some(p => !allowedPermissions.has(p))) {
      return res.status(400).json({ error: 'الدور أو الصلاحيات غير صالحة' });
    }
    if (req.user?.role !== 'admin' && permissions.includes('ADD_ADMIN') && !(req.user?.permissions || []).includes('ADD_ADMIN')) {
      return res.status(403).json({ error: 'لا تملك صلاحية منح صلاحية إضافة مدير' });
    }
    if (role === 'admin' && req.user?.role !== 'admin' && !(req.user?.permissions || []).includes('ADD_ADMIN')) {
      return res.status(403).json({ error: 'لا تملك صلاحية إضافة مدير' });
    }

    const r = await query(
      'INSERT INTO users(name,email,password_hash,role,permissions) VALUES($1,$2,$3,$4,$5) RETURNING id',
      [name, email, bcrypt.hashSync(password, 12), 'staff', JSON.stringify(permissions)]
    );
    res.json({ id: Number(r.rows[0].id) });
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'البريد مستخدم مسبقاً' });
    next(e);
  }
});

app.put('/api/admin/users/:id', auth, requireCsrf, requireAdmin, requirePerm('MANAGE_USERS'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const found = await query('SELECT * FROM users WHERE id=$1', [id]);
    const u = found.rows[0];
    if (!u) return res.status(404).json({ error: 'المستخدم غير موجود' });

    const name = String(req.body?.name ?? u.name).trim();
    const email = String(req.body?.email ?? u.email).trim().toLowerCase();
    const password = String(req.body?.password || '');
    const role = String(req.body?.role ?? u.role);
    const permissions = Array.isArray(req.body?.permissions) ? req.body.permissions : [];
    const active = req.body?.active !== false;
    const allowedPermissions = new Set(['MANAGE_ITEMS','RECEIVE_ORDERS','MANAGE_SETTINGS','MANAGE_USERS','ADD_ADMIN']);

    if (!name || name.length > 100 || !email || email.length > 254 ||
        !['staff','admin'].includes(role) || permissions.some(p => !allowedPermissions.has(p))) {
      return res.status(400).json({ error: 'بيانات المستخدم غير صالحة' });
    }
    if (id === Number(req.user.id) && (!active || role !== 'admin')) {
      return res.status(400).json({ error: 'لا يمكنك تعطيل حساب المدير الحالي أو خفض صلاحياته' });
    }

    const hash = password ? bcrypt.hashSync(password, 12) : u.password_hash;
    await query(
      'UPDATE users SET name=$1,email=$2,password_hash=$3,role=$4,permissions=$5,active=$6 WHERE id=$7',
      [name, email, hash, role, JSON.stringify(permissions), !!active, id]
    );
    res.json({ ok: true });
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'البريد مستخدم مسبقاً' });
    next(e);
  }
});

app.delete('/api/admin/users/:id', auth, requireCsrf, requireAdmin, requirePerm('MANAGE_USERS'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (id === Number(req.user.id)) return res.status(400).json({ error: 'لا يمكنك حذف حسابك الحالي' });
    await query('DELETE FROM users WHERE id=$1', [id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});
app.post('/api/admin/zones',auth,requireCsrf,requirePerm('MANAGE_ITEMS'),async(req,res,next)=>{try{const name=String(req.body?.name||'').trim(),fee=Number(req.body?.fee||0),minOrder=Number(req.body?.min_order||0),active=req.body?.active!==false,sortOrder=Number(req.body?.sort_order||0);if(!name||name.length>100||!Number.isFinite(fee)||fee<0||!Number.isFinite(minOrder)||minOrder<0)return res.status(400).json({error:'بيانات منطقة التوصيل غير صالحة'});const q=await query('INSERT INTO delivery_zones(name,fee,min_order,active,sort_order) VALUES($1,$2,$3,$4,$5) RETURNING *',[name,fee,minOrder,active,Number.isFinite(sortOrder)?sortOrder:0]);res.status(201).json({...q.rows[0],id:Number(q.rows[0].id),fee:Number(q.rows[0].fee),min_order:Number(q.rows[0].min_order),active:!!q.rows[0].active})}catch(e){next(e)}});
app.put('/api/admin/zones/:id',auth,requireCsrf,requirePerm('MANAGE_ITEMS'),async(req,res,next)=>{try{const id=Number(req.params.id),name=String(req.body?.name||'').trim(),fee=Number(req.body?.fee||0),minOrder=Number(req.body?.min_order||0),active=req.body?.active!==false,sortOrder=Number(req.body?.sort_order||0);if(!Number.isInteger(id)||id<1||!name||name.length>100||!Number.isFinite(fee)||fee<0||!Number.isFinite(minOrder)||minOrder<0)return res.status(400).json({error:'بيانات منطقة التوصيل غير صالحة'});const q=await query('UPDATE delivery_zones SET name=$1,fee=$2,min_order=$3,active=$4,sort_order=$5 WHERE id=$6 RETURNING *',[name,fee,minOrder,active,Number.isFinite(sortOrder)?sortOrder:0,id]);if(!q.rows[0])return res.status(404).json({error:'منطقة التوصيل غير موجودة'});res.json({...q.rows[0],id:Number(q.rows[0].id),fee:Number(q.rows[0].fee),min_order:Number(q.rows[0].min_order),active:!!q.rows[0].active})}catch(e){next(e)}});
app.delete('/api/admin/zones/:id',auth,requireCsrf,requirePerm('MANAGE_ITEMS'),async(req,res,next)=>{try{const id=Number(req.params.id);if(!Number.isInteger(id)||id<1)return res.status(400).json({error:'معرّف المنطقة غير صالح'});const q=await query('DELETE FROM delivery_zones WHERE id=$1 RETURNING id',[id]);if(!q.rows[0])return res.status(404).json({error:'منطقة التوصيل غير موجودة'});res.json({ok:true})}catch(e){next(e)}});
app.post('/api/admin/coupons',auth,requireCsrf,requirePerm('MANAGE_ITEMS'),async(req,res,next)=>{try{const code=String(req.body?.code||'').trim().toUpperCase(),type=String(req.body?.type||'fixed'),value=Number(req.body?.value||0),minOrder=Number(req.body?.min_order||0),maxUses=req.body?.max_uses===''||req.body?.max_uses==null?null:Number(req.body.max_uses),active=req.body?.active!==false,startsAt=req.body?.starts_at||null,endsAt=req.body?.ends_at||null;if(!code||code.length>60||!['fixed','percent'].includes(type)||!Number.isFinite(value)||value<0||type==='percent'&&value>100||!Number.isFinite(minOrder)||minOrder<0||maxUses!==null&&(!Number.isInteger(maxUses)||maxUses<0))return res.status(400).json({error:'بيانات كوبون الخصم غير صالحة'});const q=await query('INSERT INTO coupons(code,type,value,min_order,max_uses,active,starts_at,ends_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',[code,type,value,minOrder,maxUses,active,startsAt,endsAt]);res.status(201).json({...q.rows[0],id:Number(q.rows[0].id),value:Number(q.rows[0].value),min_order:Number(q.rows[0].min_order),active:!!q.rows[0].active})}catch(e){if(e.code==='23505')return res.status(409).json({error:'رمز الخصم موجود مسبقاً'});next(e)}});
app.put('/api/admin/coupons/:id',auth,requireCsrf,requirePerm('MANAGE_ITEMS'),async(req,res,next)=>{try{const id=Number(req.params.id),code=String(req.body?.code||'').trim().toUpperCase(),type=String(req.body?.type||'fixed'),value=Number(req.body?.value||0),minOrder=Number(req.body?.min_order||0),maxUses=req.body?.max_uses===''||req.body?.max_uses==null?null:Number(req.body.max_uses),active=req.body?.active!==false,startsAt=req.body?.starts_at||null,endsAt=req.body?.ends_at||null;if(!Number.isInteger(id)||id<1||!code||code.length>60||!['fixed','percent'].includes(type)||!Number.isFinite(value)||value<0||type==='percent'&&value>100||!Number.isFinite(minOrder)||minOrder<0||maxUses!==null&&(!Number.isInteger(maxUses)||maxUses<0))return res.status(400).json({error:'بيانات كوبون الخصم غير صالحة'});const q=await query('UPDATE coupons SET code=$1,type=$2,value=$3,min_order=$4,max_uses=$5,active=$6,starts_at=$7,ends_at=$8 WHERE id=$9 RETURNING *',[code,type,value,minOrder,maxUses,active,startsAt,endsAt,id]);if(!q.rows[0])return res.status(404).json({error:'الكوبون غير موجود'});res.json({...q.rows[0],id:Number(q.rows[0].id),value:Number(q.rows[0].value),min_order:Number(q.rows[0].min_order),active:!!q.rows[0].active})}catch(e){if(e.code==='23505')return res.status(409).json({error:'رمز الخصم موجود مسبقاً'});next(e)}});
app.delete('/api/admin/coupons/:id',auth,requireCsrf,requirePerm('MANAGE_ITEMS'),async(req,res,next)=>{try{const id=Number(req.params.id);if(!Number.isInteger(id)||id<1)return res.status(400).json({error:'معرّف الكوبون غير صالح'});const q=await query('DELETE FROM coupons WHERE id=$1 RETURNING id',[id]);if(!q.rows[0])return res.status(404).json({error:'الكوبون غير موجود'});res.json({ok:true})}catch(e){next(e)}});
app.get('/api/admin/analytics',auth,requirePerm('RECEIVE_ORDERS'),async(req,res,next)=>{try{const [a,d,b]=await Promise.all([query("SELECT COUNT(*)::int orders,COALESCE(SUM(total),0) revenue,COUNT(*) FILTER(WHERE status='delivered')::int delivered,COUNT(*) FILTER(WHERE status='cancelled')::int cancelled,COALESCE(AVG(total),0) avg_order FROM orders"),query("SELECT TO_CHAR(created_at AT TIME ZONE 'Asia/Beirut','YYYY-MM-DD') day,COUNT(*)::int orders,COALESCE(SUM(total),0) revenue FROM orders WHERE created_at>=NOW()-INTERVAL '30 days' GROUP BY 1 ORDER BY 1"),query(`SELECT x->>'name' name,COALESCE(SUM(CASE WHEN x->>'quantity' ~ '^[0-9]+(\\.[0-9]+)?$' THEN (x->>'quantity')::numeric ELSE 0 END),0)::int quantity FROM orders o CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN o.items_json IS NULL OR btrim(o.items_json)='' OR left(btrim(o.items_json),1)<>'[' THEN '[]'::jsonb ELSE o.items_json::jsonb END) x WHERE o.created_at>=NOW()-INTERVAL '90 days' GROUP BY 1 ORDER BY quantity DESC LIMIT 10`)]);res.json({summary:{...a.rows[0],revenue:Number(a.rows[0].revenue),avg_order:Number(a.rows[0].avg_order)},byDay:d.rows.map(x=>({...x,orders:Number(x.orders),revenue:Number(x.revenue)})),bestsellers:b.rows.map(x=>({...x,quantity:Number(x.quantity)}))})}catch(e){console.error('Analytics error:',e);next(e)}});
app.get('/api/admin/orders/export.csv',auth,requirePerm('RECEIVE_ORDERS'),async(req,res,next)=>{try{const q=await query('SELECT id,customer_name,customer_phone,address,total,status,created_at FROM orders ORDER BY id DESC LIMIT 5000'),esc=v=>`"${String(v??'').replace(/"/g,'""')}"`,csv='\ufeff'+['id,customer_name,customer_phone,address,total,status,created_at',...q.rows.map(r=>[r.id,r.customer_name,r.customer_phone,r.address,r.total,r.status,r.created_at.toISOString()].map(esc).join(','))].join('\n');res.setHeader('Content-Type','text/csv; charset=utf-8');res.setHeader('Content-Disposition','attachment; filename="orders.csv"');res.send(csv)}catch(e){next(e)}});
app.get('/api/admin/audit',auth,requireAdmin,async(req,res,next)=>{try{const q=await query('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 200');res.json({logs:q.rows})}catch(e){next(e)}});
app.get('/api/health', (req, res) => res.json({ ok: true }));

const clientDist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'حدث خطأ في الخادم' }); });

ensureOrderHistoryTable().then(() => ensurePhase2Schema()).then(() => seed()).then(() => app.listen(PORT, () => console.log(`Server running on port ${PORT}`))).catch(err => { console.error('Startup failed:', err); process.exit(1); });
