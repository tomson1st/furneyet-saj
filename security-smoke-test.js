const fs = require('fs');
const server = fs.readFileSync('./server/index.js', 'utf8');
const client = fs.readFileSync('./client/src/main.jsx', 'utf8');
const forbidden = [
  "process.env.JWT_SECRET ||",
  "localStorage.getItem('fs_token')",
  "localStorage.setItem('fs_token'",
  "origin: true",
  "ChangeMe123!",
  "dev-secret-change-me"
];
for (const x of forbidden) {
  if (server.includes(x) || client.includes(x)) throw new Error(`Security regression detected: ${x}`);
}
const required = [
  "requireCsrf",
  "requireAdmin",
  "app.use('/api/admin', adminLimiter)",
  "HttpOnly",
  "active FROM users",
  "PUBLIC_SETTINGS",
  "offerId"
];
for (const x of required) {
  if (!server.includes(x) && !client.includes(x)) throw new Error(`Expected hardening missing: ${x}`);
}
console.log('Security smoke test passed.');
