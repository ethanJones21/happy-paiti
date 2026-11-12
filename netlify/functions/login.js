const { checkCredentials, issueToken } = require('../lib/auth');

const json = (status, body) => ({
  statusCode: status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  body: JSON.stringify(body),
});

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'method not allowed' });
  let b = {};
  try { b = JSON.parse(event.body || '{}'); } catch (_) {}
  if (!checkCredentials(b.user, b.password)) {
    await new Promise((r) => setTimeout(r, 600)); // frena la fuerza bruta
    return json(401, { error: 'invalid credentials' });
  }
  return json(200, { token: issueToken(b.user) });
};
