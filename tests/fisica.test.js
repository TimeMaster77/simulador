// Pruebas rápidas de la física del modo maniobra.
// Correr: node tests/fisica.test.js
// No son pruebas de "pasa/falla" estrictas: imprimen números para comparar
// después de cambiar coeficientes. Los rangos esperados están en los comentarios.
const { T } = require('./harness.js');
const KN = 0.5144;
const norm = a => ((a % 360) + 360) % 360;
const sd = (a, b) => { let d = norm(a) - norm(b); if (d > 180) d -= 360; if (d <= -180) d += 360; return d; };
function start(i) { T.mload(i); const M = T.M; M.started = true; M.running = true; return M; }
function run(sec, fn) { const M = T.M; for (let t = 0; t < sec && !M.ended; t += .05) { T.mstep(.05); if (fn && fn(M)) break; } }
let fails = 0;
function check(name, val, lo, hi) {
  const ok = val >= lo && val <= hi; if (!ok) fails++;
  console.log(`${ok ? 'OK ' : 'MAL'} ${name}: ${val.toFixed(2)}  (esperado ${lo}–${hi})`);
}

// 1. Velocidad estable por posición del telégrafo (buque de 120 m)
for (const [n, lo, hi] of [[1, 10, 12], [.6, 6, 8], [.35, 3.5, 5], [.2, 2, 3]]) {
  const M = start(4); M.ship.u = 0; M.ship.n = n; M.ship.nOrd = n;
  run(900); check(`velocidad estable con n=${n} (kn)`, M.ship.u / KN, lo, hi);
}

// 2. Caída a la banda a toda avante: rumbo después de 60 s
{ const M = start(4); T.setRud(35); run(60); check('caída con timón a la banda en 60 s (°)', norm(M.ship.h), 45, 90); }

// 3. Parar desde 1.5 kn con media atrás
{ const M = start(4); M.ship.u = 1.5 * KN; M.ship.n = 0; M.ship.nOrd = -.6; let t0 = 0;
  run(400, m => { t0 = m.t; return m.ship.u <= 0; }); check('parar desde 1.5 kn con media atrás (s)', t0, 40, 120); }

// 4. Efecto evolutivo: dando atrás parado, la proa debe caer a estribor (popa a babor)
{ const M = start(4); M.ship.u = 0; M.ship.n = 0; M.ship.nOrd = -.6; run(60);
  check('efecto evolutivo, cambio de rumbo dando atrás 60 s (°, positivo = proa a Er)', sd(M.ship.h, 0), 1, 40); }

// 5. Desatraque sobre el spring: debe abrir la popa sin faltarse el cabo
{ const M = start(2); run(5);
  for (const i of [0, 2, 3]) { M.lines[i].on = false; M.ev.order.push(M.lines[i].name); }
  T.setRud(-35); T.setN(.6);
  run(400, m => Math.abs(sd(m.ship.h, 0)) >= 25);
  check('apertura sobre el spring (°)', Math.abs(sd(M.ship.h, 0)), 20, 40);
  check('spring sin faltarse (1 = ok)', M.lines[1].broken ? 0 : 1, 1, 1);
  check('tiempo para abrir 25° (s)', M.t, 30, 200); }

// 6. Zarpe del examen: debe poder completarse con remolcadores, sin tocar nada y sin pasar de 5 kn
{ const M = start(6), s = M.ship; run(20);
  check('amarrado con viento y corriente: sin golpe contra el muelle (m/s)', M.ev.maxImpact, 0, .03);
  M.ev.vhf.ctl = true; M.ev.vhf.tugs = true; M.ev.authFirst = true; M.ev.tugsFirst = true;
  M.lines.forEach(l => { l.on = false; M.ev.order.push(l.name); });
  // separar con los dos remolcadores, aguantando la arrancada con muy poca atrás
  s.tug1 = -1; s.tug2 = -1;
  run(1200, m => { const n = s.u > .2 ? -.2 : s.u < 0 ? 0 : s.nOrd; if (n !== s.nOrd) T.setN(n); return T.berthErr().gap >= 110; });
  check('tiempo para separar 110 m del muelle (s)', M.t, 200, 900);
  // girar la proa al este con los remolcadores, parando el giro a tiempo
  T.setN(0);
  run(900, m => { const e = sd(100, s.h) - s.r * 25, d = e < -8 ? -1 : e > 8 ? 1 : 0; s.tug1 = d; s.tug2 = -d; return Math.abs(sd(s.h, 100)) < 8 && Math.abs(s.r) < .15; });
  // largar remolcadores y salir con poca avante: al 100 hasta acercarse al eje, luego al 180
  s.tug1 = 0; s.tug2 = 0; M.ev.vhf.libres = true; T.setN(.35);
  const RUDS = [-35, -20, -10, 0, 10, 20, 35];
  run(2400, m => { const e = sd(s.x < -230 ? 100 : 180, s.h) - s.r * 6, want = Math.max(-35, Math.min(35, e * 2)), r = RUDS.reduce((a, b) => Math.abs(b - want) < Math.abs(a - want) ? b : a); if (s.rudOrd !== r) T.setRud(r); });
  check('zarpe del examen completado (1 = aprobado sin fallas)', M.result && !M.result.C.some(c => c.st === 'fail') && !M.ev.fail ? 1 : 0, 1, 1);
  check('velocidad máxima en el zarpe (kn)', M.ev.spdInside, 2, 5); }

// 7. Salida de puerto con los límites de la hoja: 5 kn en puerto y práctico a 3 kn máximo
{ const M = start(3), s = M.ship; M.ev.vhf.salida = true; M.ev.vhfY.salida = s.y; M.ev.vhf.entrante = true;
  const RUDS = [-35, -20, -10, 0, 10, 20, 35];
  let pilot = false;
  run(4000, m => {
    // por el lado de estribor del canal (x = -50 con proa al sur), muy poca avante antes de la zona de práctico
    const e = sd(180 + Math.max(-20, Math.min(20, (s.x + 50) * .4)), s.h) - s.r * 6, want = Math.max(-35, Math.min(35, e * 2)), r = RUDS.reduce((a, b) => Math.abs(b - want) < Math.abs(a - want) ? b : a);
    if (s.rudOrd !== r) T.setRud(r);
    const n = s.y < -1900 ? .2 : .35; if (s.nOrd !== n) T.setN(n);
    if (!pilot && s.y < -2650 && T.sog() / KN <= 3) { pilot = true; M.ev.pilot = { side: 'babor', lee: true, spd: T.sog() / KN, inZone: Math.hypot(s.x, s.y + 2800) <= 300 }; }
  });
  check('salida: velocidad máxima en puerto (kn)', M.ev.spdInside, 3, 5.2);
  check('salida: velocidad al desembarcar al práctico (kn)', M.ev.pilot ? M.ev.pilot.spd : 99, 1.5, 3);
  check('salida: práctico dentro de la zona (1 = sí)', M.ev.pilot && M.ev.pilot.inZone ? 1 : 0, 1, 1);
  check('salida completada sin fallas (1 = sí)', M.result && !M.result.C.some(c => c.st === 'fail') ? 1 : 0, 1, 1); }

console.log(fails ? `\n${fails} prueba(s) fuera de rango` : '\nTodo dentro de rango');
process.exit(fails ? 1 : 0);
