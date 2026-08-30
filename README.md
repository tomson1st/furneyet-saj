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
