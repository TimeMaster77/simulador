// Recorre el modo examen (tercer <script> de index.html) en Node, sin navegador.
// Correr: node tests/examen.test.js
// Hace tres intentos: todo bien, todo mal y sin tocar nada en el convoy, y revisa el dictamen.
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
if (scripts.length < 3) throw new Error('No encontré los tres <script> en index.html');

const HOOK_FROM = 'xintro(); // arranque del modo examen';
const HOOK_TO = 'xintro(); window.XT={get X(){return X},xintro,xstart,choose,exec,num,alertCap,next,cvTick,GEN,CRIT,MARKS};';
if (!scripts[2].includes(HOOK_FROM)) throw new Error('Cambió la línea final del modo examen; actualiza HOOK_FROM en tests/examen.test.js');

const fakeEl = () => new Proxy({
  style: {}, dataset: {}, hidden: false, innerHTML: '', textContent: '', className: '', value: '',
  setAttribute() {}, addEventListener() {}, querySelectorAll: () => [], scrollIntoView() {},
  classList: { add() {}, remove() {} }
}, { set(t, k, v) { t[k] = v; return true; } });
const els = {};
global.window = global;
global.document = { getElementById: id => els[id] || (els[id] = fakeEl()) };
global.setInterval = () => 0;
window.__mode = 'exam';

eval(scripts[2].replace(HOOK_FROM, HOOK_TO));
const T = window.XT;
let fails = 0;
function check(name, got, want) {
  const ok = got === want; if (!ok) fails++;
  console.log(`${ok ? 'OK ' : 'MAL'} ${name}: ${got}  (esperado ${want})`);
}

// good=true contesta todo bien; convoy: 'bien' mide y ajusta, 'nada' no toca nada
function attempt(good, study, convoy) {
  T.xintro(); T.xstart(study);
  let guard = 0;
  while (T.X.on && guard++ < 500) {
    const X = T.X, s = X.steps[X.i];
    if (X.ph === 'fb') { T.next(); continue; }
    if (X.ph === 'rb') { T.choose(good ? 0 : 1); continue; }
    if (X.ph === 'exec') {
      if (good) T.exec(s.ord.t, s.ord.v); else T.exec(s.ord.t, s.ord.t === 'rud' ? (s.ord.v > 0 ? -10 : 10) : 'FA');
      continue;
    }
    if (X.ph === 'cv') {
      const c = X.cv; let prev = c.d;
      for (let k = 0; k < 400 && X.ph === 'cv' && T.X.on; k++) {
        T.cvTick(.25);
        if (convoy === 'bien' && k % 4 === 3 && X.ph === 'cv') { // mide cada segundo y corrige
          c.meas++;
          const trend = c.d - prev; prev = c.d;
          if (trend < -.004 || c.d < .45) c.ord = Math.max(6, c.ord - .5);
          else if (trend > .004 || c.d > .56) c.ord = Math.min(8.5, c.ord + .5);
          if (c.d < .45) T.alertCap();
        }
      }
      continue;
    }
    if (s.trap) { if (good) T.alertCap(); else T.choose(0); continue; }
    if (s.type === 'num') { T.num(good ? s.ans : s.ans + 1); continue; }
    T.choose(good ? 0 : 1);
  }
  return T.X.result;
}

const n = (() => { T.xintro(); T.xstart(true); const k = T.X.steps.length; return k; })();
console.log(`Pasos del examen: ${n}`);

for (let i = 0; i < 5; i++) {
  const r = attempt(true, i % 2 === 0, 'bien');
  check(`intento ${i + 1} todo bien: críticas`, r.c, 3);
  check(`intento ${i + 1} todo bien: generales`, r.g, 28);
  check(`intento ${i + 1} todo bien: ponderación`, r.p, 100);
  check(`intento ${i + 1} todo bien: dictamen`, r.ok, true);
}
{
  const r = attempt(false, false, 'nada');
  check('todo mal: críticas', r.c, 0);
  check('todo mal: generales', r.g, 0);
  check('todo mal: dictamen', r.ok, false);
}
{
  const r = attempt(true, true, 'nada');
  check('bien pero sin atender el convoy: críticas', r.c, 3);
  check('bien pero sin atender el convoy: generales', r.g, 25);
  check('bien pero sin atender el convoy: dictamen', r.ok, true);
}
// Todo criterio de la hoja debe evaluarse en algún paso
{
  attempt(true, false, 'bien');
  const seen = new Set(T.X.marks.flatMap(m => m.ids));
  const missing = [...T.CRIT, ...T.GEN].filter(id => !seen.has(id));
  check('criterios de la hoja sin paso que los evalúe', missing.join(',') || 'ninguno', 'ninguno');
  check('total de criterios generales', T.GEN.length, 28);
}
// El botón de alerta siempre debe contestar algo en el panel de vigilancia
{
  const watch = () => els['x-watch'].textContent;
  T.xintro(); T.xstart(false);
  T.alertCap();
  check('alerta sin novedad: contesta', /sin novedad/.test(watch()), true);
  while (!T.X.steps[T.X.i].trap) { // avanza hasta el primer paso con trampa
    const X = T.X, s = X.steps[X.i];
    if (X.ph === 'rb') T.choose(0); else if (X.ph === 'exec') T.exec(s.ord.t, s.ord.v);
    else if (s.type === 'num') T.num(s.ans); else T.choose(0);
  }
  const i = T.X.i; T.alertCap();
  check('alerta en trampa (modo examen): avanza', T.X.i, i + 1);
  check('alerta en trampa (modo examen): deja aviso visible', /Alerta dada/.test(watch()), true);
  while (T.X.ph !== 'cv') {
    const X = T.X, s = X.steps[X.i];
    if (X.ph === 'rb') T.choose(0); else if (X.ph === 'exec') T.exec(s.ord.t, s.ord.v);
    else if (s.type === 'num') T.num(s.ans); else T.choose(0);
  }
  T.alertCap();
  check('alerta en convoy con distancia segura: contesta', /arriba del límite/.test(watch()), true);
  T.X.cv.d = .38; T.alertCap();
  check('alerta en convoy bajo el límite: se registra', T.X.cv.alertT != null, true);
  T.alertCap();
  check('segunda alerta en convoy: contesta', /ya está enterado/.test(watch()), true);
}
// La respuesta correcta no debe delatarse por ser la más larga
{
  const val = v => typeof v === 'function' ? v() : v;
  T.xintro(); T.xstart(true); T.X.pt = { emb: 500, card: 505, first: 520 };
  const qs = T.X.steps.filter(s => !s.type && !s.trap).map(s => [s.t, val(s.a), 0])
    .concat(T.MARKS.map(m => [m.q, m.a, 0]));
  for (const k of [0, 1]) for (const m of scripts[k].matchAll(/q:\s*(["'])(.*?)\1,\s*opts:\s*(\[[^\]]*\])\s*,\s*ok:\s*(\d)/g))
    qs.push([m[2], eval(m[3]), +m[4]]);
  let longest = 0, uneven = [];
  for (const [t, a, ok] of qs) {
    const L = a.map(x => x.length), mx = Math.max(...L), mn = Math.min(...L);
    if (L[ok] === mx && L.filter(x => x === mx).length === 1) longest++;
    if (mx > 40 && mx / mn > 1.4) uneven.push(t);
  }
  console.log(`Preguntas de opción múltiple: ${qs.length} · la correcta es la más larga en ${longest}`);
  check('la correcta es la más larga en menos de 45 % de las preguntas', longest / qs.length < .45, true);
  check('preguntas con opciones de largo muy disparejo', uneven.join(' | ') || 'ninguna', 'ninguna');
}

console.log(fails ? `\n${fails} prueba(s) fallaron` : '\nTodo bien');
process.exit(fails ? 1 : 0);
