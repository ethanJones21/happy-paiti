const { isAdmin } = require('../lib/auth');
const { getDb, loadState, saveState, voteCounts } = require('../lib/db');

const json = (status, body) => ({
  statusCode: status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  body: JSON.stringify(body),
});

exports.handler = async (event) => {
  try {
    const hasAuth = !!(event.headers['authorization'] || event.headers['Authorization']);
    const admin = isAdmin(event);

    // Si mandan un token y no es válido/venció -> 401 (así el panel valida la sesión con un GET)
    if (hasAuth && !admin) return json(401, { error: 'unauthorized' });

    const d = await getDb();

    if (event.httpMethod === 'GET') {
      const [state, votes] = await Promise.all([loadState(d), voteCounts(d)]);
      // Los correos son privados: la vista pública no los recibe
      if (state && !admin) state.people.forEach((p) => { delete p.email; });
      return json(200, { state, votes });
    }

    if (event.httpMethod === 'PUT') {
      if (!admin) return json(401, { error: 'unauthorized' });
      const state = JSON.parse(event.body || 'null');
      if (!state || !Array.isArray(state.people) || !Array.isArray(state.prods)) {
        return json(400, { error: 'invalid state' });
      }
      await saveState(d, state);
      return json(200, { ok: true });
    }

    return json(405, { error: 'method not allowed' });
  } catch (e) {
    console.error(e);
    return json(500, { error: 'server error' });
  }
};
