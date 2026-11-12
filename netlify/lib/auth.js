const crypto = require('crypto');

const TTL_MS = 8 * 60 * 60 * 1000; // la sesión dura 8 horas

const secret = () => process.env.TOKEN_SECRET || process.env.ADMIN_PASSWORD || '';
const sign = (data) => crypto.createHmac('sha256', secret()).update(data).digest('base64url');

// Comparación en tiempo constante (evita adivinar la clave por tiempos de respuesta)
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function checkCredentials(user, password) {
  if (!process.env.ADMIN_PASSWORD) return false;
  const okUser = safeEqual(user || '', process.env.ADMIN_USER || 'admin');
  const okPass = safeEqual(password || '', process.env.ADMIN_PASSWORD);
  return okUser && okPass;
}

function issueToken(user) {
  const payload = Buffer.from(JSON.stringify({ u: user, exp: Date.now() + TTL_MS })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

function verifyToken(token) {
  if (!token || !secret()) return false;
  const [payload, sig] = String(token).split('.');
  if (!payload || !sig || !safeEqual(sig, sign(payload))) return false;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString()).exp > Date.now();
  } catch (_) {
    return false;
  }
}

// Lee "Authorization: Bearer <token>"
function isAdmin(event) {
  const h = event.headers['authorization'] || event.headers['Authorization'] || '';
  return verifyToken(h.replace(/^Bearer\s+/i, ''));
}

module.exports = { checkCredentials, issueToken, verifyToken, isAdmin };
