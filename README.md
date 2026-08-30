# فرنية صاج — Production deployment

Full-stack Arabic RTL ordering website.

## Stack
- React + Vite frontend
- Node.js + Express API
- Supabase PostgreSQL
- JWT + bcrypt authentication
- Optional WhatsApp Cloud API notifications

## Local setup
1. Copy `.env.example` to `.env`.
2. Set `DATABASE_URL` to a PostgreSQL/Supabase connection string.
3. Set a strong `JWT_SECRET`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD`.
4. Run `npm install`.
5. Run `npm run dev` for development.
6. Run `npm run build && npm start` for production.

The server seeds the initial settings, sample menu, offer, and first admin account when their tables are empty.


## Home UI update
- Redesigned Arabic RTL home page to match the supplied reference layout.
- Reduced vertical whitespace and top gap.
- Added logo/title/tagline grouping beside the hero image.
- Added category cards and popular items section.
- Uses Droid Arabic Kufi across the site.

## Security hardening in this version
- JWT is stored in an HttpOnly, SameSite cookie instead of localStorage.
- JWT contains only the user id; each authenticated request reloads active role/permissions from PostgreSQL.
- Disabled users lose API access immediately.
- Admin-only user/role management prevents staff privilege escalation.
- `/api/admin/data` only returns datasets allowed by the current user's permissions.
- CSRF protection is applied to state-changing requests.
- Login, order creation, and admin APIs have rate limits.
- Request body size is limited to 64KB.
- Security response headers are enabled.
- Public settings use an allowlist.
- Offers can be added to the cart and are validated server-side at checkout.
- Production startup requires an explicit `JWT_SECRET`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` when seeding an empty users table.

## Important
Do not commit `.env`. In production, use HTTPS and set `NODE_ENV=production`.
