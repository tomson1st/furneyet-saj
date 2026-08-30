const fs = require('fs');
const path = require('path');

const server = fs.readFileSync(path.join(__dirname, 'server', 'index.js'), 'utf8');
const client = fs.readFileSync(path.join(__dirname, 'client', 'src', 'main.jsx'), 'utf8');

const checks = [
  ['JWT secret has no insecure fallback', !server.includes('dev-secret-change-me')],
  ['Initial admin credentials have no hard-coded fallback', !server.includes('ChangeMe123!') && !server.includes("admin@example.com")],
  ['JWT does not embed role/permissions', /jwt\.sign\(\{ id: Number\(u\.id\) \}/.test(server)],
  ['Session uses cookie authentication', /const token = cookies\.session/.test(server)],
  ['Session cookie is HttpOnly', /setCookie\(res, 'session', tokenFor\(u\), \{[\s\S]*?httpOnly: true/.test(server)],
  ['CSRF middleware exists', /function requireCsrf/.test(server)],
  ['Admin mutation routes use CSRF', (() => {
    const routes = [...server.matchAll(/app\.(post|put|delete)\('\/api\/admin\/[^']+'[^\n]*/g)];
    return routes.length > 0 && routes.every(m => m[0].includes('requireCsrf'));
  })()],
  ['User management is admin-only', /\/api\/admin\/users', auth, requireCsrf, requireAdmin/.test(server)],
  ['Admin data is permission-scoped', /const canOrders =/.test(server) && /const canUsers =/.test(server)],
  ['Public settings are allowlisted', /PUBLIC_SETTING_KEYS/.test(server)],
  ['Legacy snake_case settings are normalized', /site_name: 'siteName'/.test(server) && /migrateLegacySettings/.test(server)],
  ['Login rate limiting exists', /loginLimiter/.test(server)],
  ['Order rate limiting exists', /orderLimiter/.test(server)],
  ['Client no longer stores JWT in localStorage', !client.includes('localStorage') && !client.includes('Authorization')],
  ['Client sends cookies', /credentials:'same-origin'/.test(client)]
];

let failed = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} - ${label}`);
  if (!ok) failed++;
}

if (failed) process.exit(1);
console.log(`Security smoke tests passed: ${checks.length}/${checks.length}`);
