const ADMIN = document.body.dataset.admin === '1';
const PW_KEY = 'cumple-admin-pw';
const GROUPS = ['bebidas','comida','adicionales'];
const ic = (n,c='') => `<svg class="ico ${c}" aria-hidden="true"><use href="#i-${n}"/></svg>`;

// Datos iniciales tomados del Excel "plantilla-final (1).xlsx"
function defaults(){
  const prods = [
    {id:'p1',name:'jugo',price:5.5,group:'bebidas'},
    {id:'p2',name:'café',price:1.9,group:'bebidas'},
    {id:'p3',name:'tamales',price:2,group:'comida'},
    {id:'p4',name:'empanadas',price:3.4,group:'comida'},
    {id:'p5',name:'jugo tarcizo',price:6.5,group:'adicionales'},
    {id:'p6',name:'lechón',price:8.5,group:'adicionales'},
  ];
  const raw = [
    ['KIARA',['p3']],['ELA',[]],['CARLOS',['p2','p3']],['JEFRY',['p2','p6']],
    ['SOCORRO',[],true],['JOSE',['p1','p3']],['HUGO',['p2','p6']],['JOAN',[]],
    ['JUAN',['p1','p6']],['VICENTE',['p1','p5']],['ALBERTO',['p2']],['JESUS',['p3']],
    ['ANA',['p3']],['ROBERTO',['p2','p6']],['MARCO',['p2','p6']],['MARTIN',['p2','p6']],
    ['FRANK',[]],['ANTONY',[]],['KAROLINE',['p6']],['FRED',['p4','p5']],['SARA',['p3']],
  ];
  const people = raw.map((r,i)=>({id:'u'+(i+1),name:r[0],items:Object.fromEntries(r[1].map(p=>[p,true])),paid:null,excluded:!!r[2]}));
  return {cake:80, bday:'u9', prods, people, seq:100};
}

let S = defaults();
let pw = ''; try{ pw = sessionStorage.getItem(PW_KEY) || ''; }catch(e){}
const hdr = () => pw ? {'x-admin-password': pw} : {};

async function fetchState(){
  const r = await fetch('/api/state', {headers: hdr(), cache:'no-store'});
  if(r.status===401) throw new Error('auth');
  if(!r.ok) throw new Error('http '+r.status);
  return (await r.json()).state;   // null si aún no hay datos
}

let saveTimer;
function setStatus(t, bad){ const el=document.getElementById('status'); if(el){ el.textContent=t; el.style.color = bad?'var(--red)':'var(--muted)'; } }
function save(){
  if(!ADMIN) return;
  setStatus('Guardando…');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async ()=>{
    try{
      const r = await fetch('/api/state', {method:'PUT', headers:{'content-type':'application/json', ...hdr()}, body: JSON.stringify(S)});
      if(r.status===401){ setStatus('Sesión inválida', true); login(true); return; }
      if(!r.ok) throw 0;
      setStatus('Guardado ✓');
    }catch(e){ setStatus('Error al guardar', true); }
  }, 500);
}

async function login(retry){
  const v = prompt(retry ? 'Contraseña incorrecta. Intenta de nuevo:' : 'Contraseña de administrador:');
  if(v===null){ location.href='/'; return; }
  pw = v;
  try{
    const st = await fetchState();
    try{ sessionStorage.setItem(PW_KEY, pw); }catch(e){}
    if(st) S = st; else save();
    renderAll();
if(ADMIN){ login(false); }
else {
  const pull = () => fetchState().then(st=>{ if(st) S = st; renderAll(); }).catch(()=>{ if(!document.querySelector("#tbody tr")) renderAll(); });
  pull();
  setInterval(()=>{ if(!document.hidden) pull(); }, 30000);
}

// Vista pública: sólo lectura
function applyReadOnly(){
  document.querySelectorAll('.wrap input, .wrap select').forEach(el=>{ el.disabled = true; });
  document.querySelectorAll('.payfull, [data-delp], [data-del], .actions, #addPerson, #addProd').forEach(el=>el.style.display='none');
}
  }catch(e){ if(e.message==='auth') login(true); else alert('No se pudo conectar con la base de datos'); }
}
const uid = p => p + (++S.seq);

const r2 = x => Math.round((x + Number.EPSILON) * 100) / 100;
const fmt = x => (Math.round(x*100)/100).toFixed(2);
const proper = s => s.trim().toLowerCase().replace(/(^|\s)\S/g, c=>c.toUpperCase());
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');

// ---- Lógica (misma que el Excel) ----
function calc(){
  const price = Object.fromEntries(S.prods.map(p=>[p.id,+p.price||0]));
  const lineOf = u => Object.fromEntries(S.prods.map(p=>[p.id, u.items[p.id] ? price[p.id] : 0]));
  const bd = S.people.find(u=>u.id===S.bday);
  const isPayer = u => !u.excluded && u.id!==S.bday;
  const payers = S.people.filter(isPayer).length;                          // aportantes
  const bdayItems = bd ? S.prods.reduce((a,p)=>a+lineOf(bd)[p.id],0) : 0;  // lo que consumió el cumpleañero
  const torta = payers ? (+S.cake||0)/payers : 0;                          // torta / aportantes
  const desayuno = payers ? bdayItems/payers : 0;                          // desayuno del cumpleañero / aportantes
  const rows = S.people.map(u=>{
    const lines = lineOf(u);
    const pay = isPayer(u);
    const t = pay ? r2(S.prods.reduce((a,p)=>a+lines[p.id],0) + torta + desayuno) : 0;
    const paid = u.paid==null||u.paid==='' ? 0 : +u.paid;
    let st;
    if(u.id===S.bday) st='Cumpleañero';
    else if(u.excluded) st='Excluido';
    else st = r2(paid)===r2(t) ? 'Sí' : 'No';
    return {u, lines, pay, total:t, paid, st, torta: pay?torta:0, desayuno: pay?desayuno:0};
  });
  return {rows, payers, bdayItems, torta, desayuno, bd, price};
}

// ---- Render ----
function renderProds(){
  $('prods').innerHTML = S.prods.map(p=>`
    <div class="prod" data-pid="${p.id}">
      <input type="text" data-k="name" value="${esc(p.name)}" aria-label="Nombre del producto">
      <select data-k="group" aria-label="Grupo">${GROUPS.map(g=>`<option ${g===p.group?'selected':''}>${g}</option>`).join('')}</select>
      <input type="number" data-k="price" min="0" step="0.01" inputmode="decimal" value="${p.price}" aria-label="Precio unitario">
      <button class="iconbtn" data-del="${p.id}" aria-label="Quitar ${esc(p.name)}" title="Quitar producto">${ic('x')}</button>
    </div>`).join('');
}

function renderBdaySelect(){
  $('bday').innerHTML = `<option value="">— ninguno —</option>` +
    S.people.map(u=>`<option value="${u.id}" ${u.id===S.bday?'selected':''}>${esc(u.name.trim()||'(sin nombre)')}</option>`).join('');
}

function renderTable(){
  const groups = [];
  S.prods.forEach(p=>{
    const last = groups[groups.length-1];
    if(last && last.g===p.group) last.n++; else groups.push({g:p.group,n:1});
  });
  const starts = new Set(); let acc=0; groups.forEach(g=>{ starts.add(acc); acc+=g.n; });
  const gs = i => starts.has(i) ? ' gs' : '';

  $('thead').innerHTML = `
    <tr>
      <th rowspan="2" class="sticky">Colaboradores</th>
      ${groups.map(x=>`<th colspan="${x.n}" class="grp gs">${x.g}</th>`).join('')}
      <th colspan="2" class="grp gs">Reparto</th>
      <th rowspan="2" class="gs">Total</th>
      <th colspan="3" class="grp gs">Pago</th>
      <th rowspan="2" class="gs" title="Excluido: no participa en el reparto">Excl.</th>
      <th rowspan="2"><span class="sr">Quitar</span></th>
    </tr>
    <tr>
      ${S.prods.map((p,i)=>`<th class="${gs(i).trim()}"><div class="pn">${esc(p.name)}</div><div class="pp">${fmt(+p.price||0)}</div></th>`).join('')}
      <th class="gs">torta</th><th id="hDes">desayuno</th>
      <th class="gs">Pagó (monto)</th><th>¿Pagó?</th><th>Saldo</th>
    </tr>`;

  $('tbody').innerHTML = S.people.map((u,idx)=>`
    <tr data-uid="${u.id}">
      <td class="sticky name"><div class="nm"><span class="idx">${idx+1}</span><input type="text" data-k="name" value="${esc(u.name)}" aria-label="Nombre de la persona ${idx+1}" placeholder="Nombre"></div></td>
      ${S.prods.map((p,i)=>`<td class="chkc${gs(i)}"><label class="chk"><input type="checkbox" data-pid="${p.id}" aria-label="${esc(p.name)}" ${u.items[p.id]?'checked':''}></label></td>`).join('')}
      <td class="num gs" data-c="torta"></td>
      <td class="num" data-c="des"></td>
      <td class="tot gs" data-c="total"></td>
      <td class="paid gs"><div class="paidbox"><input type="number" data-k="paid" min="0" step="0.01" inputmode="decimal" value="${u.paid==null?'':u.paid}" aria-label="Monto pagado"><button class="payfull" data-payfull title="Marcar como pagado completo" aria-label="Marcar como pagado completo">${ic('check')}</button></div></td>
      <td data-c="st"></td>
      <td data-c="saldo"></td>
      <td class="exc gs"><input type="checkbox" data-k="excluded" ${u.excluded?'checked':''} aria-label="Excluido del reparto"></td>
      <td><button class="iconbtn" data-delp="${u.id}" aria-label="Quitar persona" title="Quitar persona">${ic('x')}</button></td>
    </tr>`).join('');

  $('tfoot').innerHTML = `<tr><td class="sticky">Total</td>
    ${S.prods.map((p,i)=>`<td class="${gs(i).trim()}" data-tp="${p.id}"></td>`).join('')}
    <td class="gs" data-t="torta"></td><td data-t="des"></td><td class="gs" data-t="total"></td>
    <td class="gs" data-t="paid"></td><td></td><td data-t="saldo"></td><td class="gs"></td><td></td></tr>`;
  $('empty').hidden = S.people.length>0;
  refresh();
}

// Actualiza sólo valores calculados (no reconstruye inputs, así no se pierde el foco)
function refresh(){
  const C = calc();
  const bname = C.bd ? proper(C.bd.name) : '';
  $('title').textContent = bname ? 'Cumpleaños de '+bname : 'Colaboración de cumpleaños';
  const hDes = $('hDes'); if(hDes) hDes.title = bname ? 'Lo que consumió '+bname+', repartido entre los aportantes' : 'Lo que consumió el cumpleañero, repartido entre los aportantes';
  const trs = $('tbody').children;
  const tot = {torta:0,des:0,total:0,paid:0,saldo:0}, tp = {};
  C.rows.forEach((r,i)=>{
    const tr = trs[i]; if(!tr) return;
    tr.className = r.u.id===S.bday ? 'bday' : (r.u.excluded ? 'excl' : '');
    S.prods.forEach(p=>{ const el = tr.querySelector(`[data-amt="${p.id}"]`); if(el) el.textContent = fmt(r.lines[p.id]); tp[p.id]=(tp[p.id]||0)+r.lines[p.id]; });
    tr.querySelector('[data-c=torta]').textContent = fmt(r.torta);
    tr.querySelector('[data-c=des]').textContent = fmt(r.desayuno);
    tr.querySelector('[data-c=total]').textContent = fmt(r.total);
    const st = tr.querySelector('[data-c=st]');
    st.innerHTML = r.st==='Sí' ? `<span class="pill p-si">${ic('check')}Sí</span>`
      : r.st==='No' ? `<span class="pill p-no">${ic('dot')}No</span>`
      : r.st==='Cumpleañero' ? `<span class="pill p-bd">Cumpleañero</span>`
      : `<span class="pill p-ex">Excluido</span>`;
    const saldo = r.pay ? r2(r.total - r.paid) : 0;
    const sd = tr.querySelector('[data-c=saldo]');
    sd.className = 'saldo ' + (saldo>0?'falta':saldo<0?'sobra':'');
    sd.textContent = !r.pay || saldo===0 ? '' : (saldo>0 ? 'falta ' : 'sobra ') + fmt(Math.abs(saldo));
    tr.querySelector('[data-payfull]').hidden = !r.pay || r.st==='Sí';
    tot.torta+=r.torta; tot.des+=r.desayuno; tot.total+=r.total; tot.paid+=r.pay?r.paid:0; tot.saldo+=r.pay?saldo:0;
  });
  S.prods.forEach(p=>{ const el=document.querySelector(`[data-tp="${p.id}"]`); if(el) el.textContent=fmt(tp[p.id]||0); });
  const set=(k,v)=>{const el=document.querySelector(`[data-t="${k}"]`); if(el) el.textContent=fmt(v)};
  set('torta',tot.torta); set('des',tot.des); set('total',tot.total); set('paid',tot.paid);
  const tsd = document.querySelector('[data-t=saldo]'); if(tsd) tsd.textContent = tot.saldo>0 ? 'falta '+fmt(tot.saldo) : '';

  const pagaron = C.rows.filter(r=>r.st==='Sí').length;
  const pend = Math.max(0, tot.total - tot.paid);
  const pct = tot.total>0 ? Math.min(100, tot.paid/tot.total*100) : 0;
  $('sumLine').innerHTML = `<b>${pagaron} de ${C.payers}</b> ya pagaron. Recaudado <b class="g">${fmt(tot.paid)}</b> de <b>${fmt(tot.total)}</b>` +
    (pend>0 ? `; faltan <b class="r">${fmt(pend)}</b>.` : (tot.total>0 ? '. <b class="g">Todo recaudado.</b>' : '.'));
  const bar = $('bar'); bar.firstElementChild.style.width = pct+'%';
  bar.setAttribute('aria-valuenow', Math.round(pct)); bar.setAttribute('aria-valuemin',0); bar.setAttribute('aria-valuemax',100);
  $('facts').innerHTML = `<b>${C.payers}</b> aportantes de ${S.people.length} · torta <b>${fmt(C.torta)}</b> c/u` +
    (bname ? ` · desayuno de ${esc(bname)} <b>${fmt(C.desayuno)}</b> c/u` : '');

  $('rules').textContent = `Aportantes = personas − excluidos − cumpleañero. La torta y lo que consumió el cumpleañero se dividen entre los aportantes. Total = productos marcados + torta + desayuno, redondeado a 2 decimales. "Sí" cuando el monto pagado es igual al total.`;
}

function renderAll(){ renderProds(); renderBdaySelect(); $('cake').value = S.cake; renderTable(); if(!ADMIN) applyReadOnly(); }

// ---- Eventos ----
$('bday').addEventListener('change',e=>{ S.bday = e.target.value; save(); refresh(); });
$('cake').addEventListener('input',e=>{ S.cake = e.target.value===''?0:+e.target.value; save(); refresh(); });

// Producto: el nombre/precio/grupo cambian los encabezados, por eso se reconstruye la tabla (la lista de productos conserva el foco)
$('prods').addEventListener('input',e=>{
  const row = e.target.closest('[data-pid]'); if(!row) return;
  const p = S.prods.find(x=>x.id===row.dataset.pid); const k = e.target.dataset.k;
  p[k] = k==='price' ? (e.target.value===''?0:+e.target.value) : e.target.value;
  save(); renderTable();
});
$('prods').addEventListener('click',e=>{
  const b = e.target.closest('[data-del]'); if(!b) return;
  const id = b.dataset.del;
  S.prods = S.prods.filter(p=>p.id!==id); S.people.forEach(u=>delete u.items[id]);
  save(); renderProds(); renderTable();
});
$('addProd').addEventListener('click',()=>{
  S.prods.push({id:uid('p'),name:'nuevo',price:0,group:'adicionales'}); save(); renderProds(); renderTable();
  const ins = $('prods').querySelectorAll('input[data-k=name]'); const l = ins[ins.length-1]; l.focus(); l.select();
});

$('tbody').addEventListener('input',e=>{
  const tr = e.target.closest('tr'); if(!tr) return;
  const u = S.people.find(x=>x.id===tr.dataset.uid); const t = e.target;
  if(t.dataset.pid){ if(t.checked) u.items[t.dataset.pid]=true; else delete u.items[t.dataset.pid]; }
  else if(t.dataset.k==='name'){ u.name = t.value; const sel=$('bday').value; renderBdaySelect(); $('bday').value = sel; }
  else if(t.dataset.k==='paid'){ u.paid = t.value===''?null:+t.value; }
  else if(t.dataset.k==='excluded'){ u.excluded = t.checked; }
  save(); refresh();
});
$('tbody').addEventListener('keydown',e=>{
  if(e.key!=='Enter' || e.target.dataset.k!=='paid') return;
  e.preventDefault();
  const all = [...$('tbody').querySelectorAll('input[data-k=paid]')];
  const nxt = all[all.indexOf(e.target)+1]; if(nxt){ nxt.focus(); nxt.select(); }
});
$('tbody').addEventListener('click',e=>{
  const pf = e.target.closest('[data-payfull]');
  if(pf){
    const tr = pf.closest('tr'); const u = S.people.find(x=>x.id===tr.dataset.uid);
    const row = calc().rows.find(r=>r.u.id===u.id);
    u.paid = row.total; tr.querySelector('input[data-k=paid]').value = row.total;
    save(); refresh(); return;
  }
  const id = e.target.closest('[data-delp]')?.dataset.delp; if(!id) return;
  const u = S.people.find(x=>x.id===id);
  if(!confirm('¿Quitar a '+(u.name.trim()||'esta persona')+'?')) return;
  S.people = S.people.filter(x=>x.id!==id); if(S.bday===id) S.bday='';
  save(); renderBdaySelect(); renderTable();
});
$('addPerson').addEventListener('click',()=>{
  S.people.push({id:uid('u'),name:'',items:{},paid:null,excluded:false}); save(); renderBdaySelect(); renderTable();
  const ins = $('tbody').querySelectorAll('input[data-k=name]'); const l = ins[ins.length-1]; l.focus();
  $('tw').scrollTop = $('tw').scrollHeight;
});

$('btnReset').addEventListener('click',()=>{
  if(!confirm('Se reemplazarán los datos guardados por los del Excel. ¿Continuar?')) return;
  S = defaults(); save(); renderAll();
});
$('btnExport').addEventListener('click',()=>{
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(S,null,2)],{type:'application/json'}));
  a.download = 'cumple-'+(proper(S.people.find(u=>u.id===S.bday)?.name||'datos'))+'.json'; a.click();
});
$('btnImport').addEventListener('click',()=>$('file').click());
$('file').addEventListener('change',e=>{
  const f = e.target.files[0]; if(!f) return;
  f.text().then(t=>{
    try{ const j = JSON.parse(t); if(!j.people||!j.prods) throw 0; S=j; S.seq=S.seq||1000; save(); renderAll(); }
    catch(_){ alert('Archivo no válido'); }
  });
  e.target.value='';
});

renderAll();
