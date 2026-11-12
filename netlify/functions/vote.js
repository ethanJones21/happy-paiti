const { VOTE_GROUPS, getDb, voteCounts } = require('../lib/db');

const json = (status, body) => ({
  statusCode: status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  body: JSON.stringify(body),
});

// "  Sára  " -> "sara"
const norm = (s) =>
  String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');

// Body: { name, picks: { bebidas: 'p1', comida: 'p3' } }  (se puede votar una o las dos)
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'method not allowed' });
  try {
    const { name, email, picks } = JSON.parse(event.body || '{}');
    const d = await getDb();
    const config = await d.collection('config').findOne({ _id: 'main' });
    const open = config && (config.pollOpen !== undefined ? config.pollOpen : !(config.poll && config.poll.open === false));
    if (!open) return json(403, { error: 'closed' });

    // Cada elección debe ser un producto del grupo que corresponde a la pregunta
    const chosen = [];
    for (const g of VOTE_GROUPS) {
      const id = picks && picks[g];
      if (!id) continue;
      const prod = await d.collection('products').findOne({ _id: String(id), group: g });
      if (!prod) return json(400, { error: 'invalid option' });
      chosen.push({ group: g, productId: prod._id });
    }
    if (!chosen.length) return json(400, { error: 'invalid option' });

    const people = await d.collection('people').find({}).toArray();
    // Hay que coincidir en nombre Y correo (la misma respuesta si falla cualquiera de los dos)
    const mail = String(email || '').trim().toLowerCase();
    const matches = people.filter(
      (p) => norm(p.name) && norm(p.name) === norm(name) && p.email && mail && p.email.toLowerCase() === mail
    );
    if (matches.length !== 1) return json(404, { error: 'unknown name' });
    const person = matches[0];

    // El cumpleañero no vota: lo que consume lo elige el admin en el panel
    if (config.bdayId && String(person._id) === String(config.bdayId)) return json(403, { error: 'birthday person' });

    // Un voto por persona y por pregunta; si vota otra vez, cambia su voto
    for (const c of chosen) {
      await d.collection('votes').updateOne(
        { _id: `${person._id}:${c.group}` },
        { $set: { personId: person._id, group: c.group, productId: c.productId, name: person.name, updatedAt: new Date() } },
        { upsert: true }
      );
      // La tabla se actualiza sola: queda marcado sólo el producto elegido de ese grupo
      const groupIds = (await d.collection('products').find({ group: c.group }).toArray()).map((p) => p._id);
      await d.collection('consumptions').deleteMany({ personId: person._id, productId: { $in: groupIds } });
      await d.collection('consumptions').replaceOne(
        { _id: `${person._id}:${c.productId}` },
        { _id: `${person._id}:${c.productId}`, personId: person._id, productId: c.productId },
        { upsert: true }
      );
    }
    return json(200, { ok: true, votes: await voteCounts(d), name: person.name });
  } catch (e) {
    console.error(e);
    return json(500, { error: 'server error' });
  }
};
