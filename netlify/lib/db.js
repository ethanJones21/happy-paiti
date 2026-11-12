const { MongoClient } = require('mongodb');

// Colecciones:
//   config        1 documento (_id 'main'): torta, cumpleañero, contador de ids, votación abierta/cerrada
//   products      { _id, name, price, group, order }
//   people        { _id, name, email, paid, excluded, voteCount, order }   (email: privado, sólo lo ve el admin; sirve para validar el voto)
//   consumptions  { _id 'personId:productId', personId, productId }   <- qué consumió cada persona
//   votes         { _id 'personId:grupo', personId, group, productId, name }
//                 Votación fija: una pregunta por grupo (bebidas, comida); las opciones son los productos del grupo.
// (`state` y `options` son de la versión vieja; `state` sólo se lee una vez para migrar)

const VOTE_GROUPS = ['bebidas', 'comida'];
const MAX_VOTES = 2; // envíos de voto por persona (se reinicia al cambiar de cumpleañero)

let client;
async function getDb() {
  if (!client) client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  return client.db(process.env.DB_NAME || 'cumple');
}

// Reemplaza el contenido de una colección con `docs` (upsert de los nuevos, borra los que sobran)
async function sync(col, docs) {
  if (docs.length) {
    await col.bulkWrite(docs.map((d) => ({ replaceOne: { filter: { _id: d._id }, replacement: d, upsert: true } })));
  }
  await col.deleteMany({ _id: { $nin: docs.map((d) => d._id) } });
}

async function saveState(d, s) {
  const prods = s.prods.map((p, i) => ({
    _id: String(p.id), name: String(p.name || ''), price: +p.price || 0, group: String(p.group || 'adicionales'), order: i,
  }));
  // El correo se puede haber puesto directo en la base: si el cliente no lo manda, se conserva el que había
  const prevPeople = await d.collection('people').find({}).toArray();
  const prevEmail = Object.fromEntries(prevPeople.map((p) => [p._id, p.email || '']));
  // El contador de votos lo lleva el servidor (el cliente no lo manda); vuelve a cero si cambia el cumpleañero
  const prevCfg = await d.collection('config').findOne({ _id: 'main' });
  const bdayChanged = !!prevCfg && String(prevCfg.bdayId || '') !== String(s.bday || '');
  const prevVotes = Object.fromEntries(prevPeople.map((p) => [p._id, p.voteCount || 0]));
  const people = s.people.map((p, i) => ({
    _id: String(p.id), name: String(p.name || ''),
    email: String(p.email !== undefined ? p.email : prevEmail[String(p.id)] || '').trim().toLowerCase(),
    excluded: !!p.excluded,
    voteCount: bdayChanged ? 0 : prevVotes[String(p.id)] || 0,
    paid: p.paid == null || p.paid === '' ? null : +p.paid, order: i,
  }));
  const prodIds = new Set(prods.map((p) => p._id));
  const consumptions = [];
  s.people.forEach((p) => {
    Object.keys(p.items || {}).forEach((pid) => {
      if (p.items[pid] && prodIds.has(pid)) {
        consumptions.push({ _id: `${p.id}:${pid}`, personId: String(p.id), productId: pid });
      }
    });
  });
  const config = {
    _id: 'main', cake: +s.cake || 0, bdayId: s.bday || '', seq: +s.seq || 100,
    pollOpen: !(s.poll && s.poll.open === false), updatedAt: new Date(),
  };

  await sync(d.collection('products'), prods);
  await sync(d.collection('people'), people);
  await sync(d.collection('consumptions'), consumptions);

  // Votos huérfanos (producto/persona borrados, producto que cambió de grupo, formato viejo) se descartan
  const votes = d.collection('votes');
  await votes.deleteMany({ group: { $nin: VOTE_GROUPS } });
  for (const g of VOTE_GROUPS) {
    await votes.deleteMany({ group: g, productId: { $nin: prods.filter((p) => p.group === g).map((p) => p._id) } });
  }
  await votes.deleteMany({ personId: { $nin: people.map((p) => p._id) } });

  await d.collection('config').replaceOne({ _id: 'main' }, config, { upsert: true });
}

// Devuelve el estado con la misma forma que usa el front, o null si aún no hay datos
async function loadState(d) {
  const config = await d.collection('config').findOne({ _id: 'main' });
  if (!config) {
    const legacy = await d.collection('state').findOne({ _id: 'main' });
    if (!legacy || !legacy.state) return null;
    await saveState(d, legacy.state); // migración única desde el documento viejo
    return loadState(d);
  }
  const [prods, people, cons] = await Promise.all([
    d.collection('products').find({}).sort({ order: 1 }).toArray(),
    d.collection('people').find({}).sort({ order: 1 }).toArray(),
    d.collection('consumptions').find({}).toArray(),
  ]);
  const items = {};
  cons.forEach((c) => { (items[c.personId] = items[c.personId] || {})[c.productId] = true; });
  // Compatibilidad: la versión anterior guardaba config.poll.open
  const open = config.pollOpen !== undefined ? config.pollOpen : !(config.poll && config.poll.open === false);
  return {
    cake: config.cake, bday: config.bdayId, seq: config.seq,
    prods: prods.map((p) => ({ id: p._id, name: p.name, price: p.price, group: p.group })),
    people: people.map((p) => ({ id: p._id, name: p.name, email: p.email || '', voteCount: p.voteCount || 0, items: items[p._id] || {}, paid: p.paid, excluded: p.excluded })),
    poll: { open },
  };
}

// { productId: cantidad de votos }
async function voteCounts(d) {
  const rows = await d.collection('votes').aggregate([
    { $match: { productId: { $exists: true } } },
    { $group: { _id: '$productId', n: { $sum: 1 } } },
  ]).toArray();
  return Object.fromEntries(rows.map((r) => [r._id, r.n]));
}

module.exports = { VOTE_GROUPS, MAX_VOTES, getDb, loadState, saveState, voteCounts };
