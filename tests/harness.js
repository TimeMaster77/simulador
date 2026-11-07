// Carga el módulo de maniobra (segundo <script> de index.html) en Node sin navegador,
// con un DOM falso, y expone las funciones internas en `T` para probar la física.
// Uso: const {T} = require('./harness.js');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
if (scripts.length < 2) throw new Error('No encontré los dos <script> en index.html');

const HOOK_FROM = 'renderMChips(); mload(0); requestAnimationFrame(mloop);';
const HOOK_TO = 'renderMChips(); mload(0); window.T={get M(){return M},mstep,setRud,setN,setBT,mload,canFinish,berthErr,latSpeeds,mend,sog,mobDist};';
if (!scripts[1].includes(HOOK_FROM)) throw new Error('Cambió la línea final del módulo de maniobra; actualiza HOOK_FROM en tests/harness.js');
const code = scripts[1].replace(HOOK_FROM, HOOK_TO);

const fakeEl = () => new Proxy({
  style: {}, dataset: {}, hidden: false, innerHTML: '', textContent: '', width: 1, height: 1,
  getContext: () => new Proxy({}, { get: () => () => ({ addColorStop() {} }) }),
  getBoundingClientRect: () => ({ width: 0, height: 0 }),
  setAttribute() {}, addEventListener() {}, querySelectorAll: () => [], scrollIntoView() {}
}, { set(t, k, v) { t[k] = v; return true; } });
const els = {};
global.window = global;
global.document = { getElementById: id => els[id] || (els[id] = fakeEl()), querySelectorAll: () => [], addEventListener() {}, documentElement: {} };
global.location = { hash: '' };
global.requestAnimationFrame = () => {};
global.getComputedStyle = () => ({ getPropertyValue: () => '' });

eval(code);
module.exports = { T: window.T };
