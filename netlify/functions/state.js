const { MongoClient } = require('mongodb');

// Se reutiliza la conexión entre invocaciones
let client;
async function col() {
  if (!client) client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  return client.db(process.env.DB_NAME || 'cumple').collection('state');
}

const json = (status, body) => ({
  statusCode: status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  body: JSON.stringify(body),
});

exports.handler = async (event) => {
  try {
    const given = event.headers['x-admin-password'];
    const isAdmin = given && given === process.env.ADMIN_PASSWORD;

    // Si mandan contraseña y es incorrecta -> 401 (así el panel valida el login con un GET)
    if (given && !isAdmin) return json(401, { error: 'unauthorized' });

    const c = await col();

    if (event.httpMethod === 'GET') {
      const doc = await c.findOne({ _id: 'main' });
      return json(200, { state: doc ? doc.state : null });
    }

    if (event.httpMethod === 'PUT') {
      if (!isAdmin) return json(401, { error: 'unauthorized' });
      const state = JSON.parse(event.body || 'null');
      if (!state || !Array.isArray(state.people) || !Array.isArray(state.prods)) {
        return json(400, { error: 'invalid state' });
      }
      await c.updateOne({ _id: 'main' }, { $set: { state, updatedAt: new Date() } }, { upsert: true });
      return json(200, { ok: true });
    }

    return json(405, { error: 'method not allowed' });
  } catch (e) {
    console.error(e);
    return json(500, { error: 'server error' });
  }
};
