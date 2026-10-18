import { createGame, stepGame, activateShield, movePlayer, resizeGame, scaleFor, MISSION_SECONDS } from './engine.mjs';

const $ = id => document.getElementById(id);
const canvas = $('game');
const arena = $('arena');
const ctx = canvas.getContext('2d');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let width = 800, height = 520, game = null, mode = 'intro', previousTime = 0, visualTime = 0;
let particles = [], floaters = [], pointer = null, hitFlash = 0, sound = false, audio = null;
const keys = new Set();
let best = 0;
try { best = Math.max(0, Math.floor(Number(localStorage.getItem('orbit-drift-best')) || 0)); } catch { /* Storage is optional. */ }
const padScore = n => String(n).padStart(4, '0');
$('best-score').textContent = padScore(best);

// A fixed visual seed keeps the decorative stars calm across restarts.
const stars = Array.from({ length: 95 }, (_, i) => ({
  x: ((Math.sin(i * 127.1 + 4) * 43758.5453) % 1 + 1) % 1,
  y: ((Math.sin(i * 311.7 + 2) * 19341.3721) % 1 + 1) % 1,
  size: i % 8 === 0 ? 1.5 : 0.7, depth: 0.25 + (i % 5) / 5,
}));

function resize() {
  const bounds = arena.getBoundingClientRect();
  width = bounds.width;
  height = bounds.height;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (game) resizeGame(game, width, height);
  pointer = null;
}
new ResizeObserver(resize).observe(arena);
resize();

function tone(frequency, duration = 0.12, type = 'sine', volume = 0.045, endFrequency = frequency) {
  if (!sound) return;
  try {
    if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') void audio.resume().catch(() => {});
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, audio.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(endFrequency, audio.currentTime + duration);
    gain.gain.setValueAtTime(volume, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + duration);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start();
    oscillator.stop(audio.currentTime + duration);
  } catch { /* Audio is optional; gameplay must continue. */ }
}

function announce(text) { $('announcements').textContent = text; }

function startGame() {
  if (mode === 'paused') { resumeGame(); return; }
  game = createGame(width, height);
  mode = 'playing';
  particles = []; floaters = []; pointer = null; hitFlash = 0; keys.clear();
  $('overlay').hidden = true;
  $('hud').hidden = false;
  $('arena-caption').hidden = true;
  $('pause-button').disabled = false;
  $('pause-button').setAttribute('aria-label', 'Spiel pausieren');
  $('mission-state').textContent = 'MISSION LÄUFT';
  canvas.focus({ preventScroll: true });
  tone(240, 0.3, 'sine', 0.04, 640);
  announce('Mission gestartet. Überlebe 60 Sekunden und sammle Kristalle.');
  updateHud();
}

function pauseGame() {
  if (mode !== 'playing') return;
  mode = 'paused'; keys.clear(); pointer = null;
  $('overlay').className = 'game-overlay is-paused';
  $('overlay').hidden = false;
  $('overlay-tag').textContent = 'EINMAL DURCHATMEN';
  $('overlay-title').textContent = 'Kleine Flugpause.';
  $('overlay-description').textContent = 'Deine Mission wartet auf dich.';
  $('result').hidden = true;
  $('overlay-hint').textContent = 'Weiter mit P, Escape oder einem Fingertipp.';
  $('start-button').innerHTML = 'Weiterfliegen <span class="arrow-icon" aria-hidden="true"></span>';
  $('mission-state').textContent = 'MISSION PAUSIERT';
  $('shield-button').disabled = true;
  $('pause-button').setAttribute('aria-label', 'Spiel fortsetzen');
  $('start-button').focus({ preventScroll: true });
  announce('Spiel pausiert.');
}

function resumeGame() {
  mode = 'playing';
  $('overlay').hidden = true;
  $('mission-state').textContent = 'MISSION LÄUFT';
  $('pause-button').setAttribute('aria-label', 'Spiel pausieren');
  canvas.focus({ preventScroll: true });
  updateHud();
  announce('Mission fortgesetzt.');
}

function finishGame() {
  mode = 'result'; pointer = null; keys.clear();
  const newBest = game.score > best;
  if (newBest) {
    best = game.score;
    try { localStorage.setItem('orbit-drift-best', String(best)); } catch { /* Optional persistence. */ }
  }
  $('best-score').textContent = padScore(best);
  $('overlay').className = 'game-overlay is-result';
  $('overlay').hidden = false;
  $('overlay-tag').textContent = game.status === 'won' ? 'MISSION ERFOLGREICH' : 'DAS ALL HAT GEWONNEN';
  $('overlay-title').textContent = game.status === 'won' ? 'Saubere Landung.' : 'Noch eine Runde?';
  $('overlay-description').textContent = game.status === 'won' ? `60 Sekunden geschafft. +${game.health * 250} Punkte für deine übrigen Leben.` : 'Jeder Flug macht dich ein bisschen besser.';
  $('result').hidden = false;
  $('result-score').textContent = padScore(game.score);
  $('result-best').textContent = newBest ? '✦ NEUER PERSÖNLICHER REKORD' : `BESTLEISTUNG: ${padScore(best)}`;
  $('start-button').innerHTML = 'Nochmal abheben <span class="arrow-icon" aria-hidden="true"></span>';
  $('overlay-hint').textContent = 'Neue Mission. Neue Chance. Dein nächster Highscore.';
  $('pause-button').disabled = true;
  $('shield-button').disabled = true;
  $('mission-state').textContent = game.status === 'won' ? 'MISSION GESCHAFFT' : 'MISSION BEENDET';
  $('start-button').focus({ preventScroll: true });
  tone(game.status === 'won' ? 520 : 180, 0.5, 'sine', 0.05, game.status === 'won' ? 900 : 60);
  announce(`${game.status === 'won' ? 'Mission geschafft.' : 'Mission beendet.'} ${game.score} Punkte.${newBest ? ' Neuer persönlicher Rekord!' : ''}`);
}

function shield() {
  if (mode === 'playing' && activateShield(game)) {
    tone(180, 0.4, 'sine', 0.06, 720);
    burst(game.player.x, game.player.y, '#c2adff', 18);
    announce('Schild aktiviert. Zwei Sekunden Schutz.');
    updateHud();
  }
}

function updateHud() {
  $('score').textContent = padScore(game.score);
  const remaining = Math.ceil(Math.max(0, MISSION_SECONDS - game.elapsed));
  $('timer').textContent = `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
  $('health').textContent = Array.from({ length: 3 }, (_, i) => i < game.health ? '◆' : '◇').join(' ');
  $('health').setAttribute('aria-label', `${game.health} von 3 Leben`);
  const active = game.shield > 0;
  $('shield-button').classList.toggle('is-active', active);
  $('shield-button').disabled = mode !== 'playing' || game.shieldCooldown > 0;
  $('shield-label').textContent = active ? 'Schild aktiv' : game.shieldCooldown > 0 ? `Lädt auf · ${Math.ceil(game.shieldCooldown)} s` : 'Schild aktivieren';
}

$('start-button').addEventListener('click', startGame);
$('pause-button').addEventListener('click', () => mode === 'paused' ? resumeGame() : pauseGame());
$('shield-button').addEventListener('click', shield);
$('sound-button').addEventListener('click', () => {
  sound = !sound;
  $('sound-button').setAttribute('aria-pressed', String(sound));
  $('sound-button').setAttribute('aria-label', sound ? 'Sound ausschalten' : 'Sound einschalten');
  $('sound-button').title = sound ? 'Sound ausschalten' : 'Sound einschalten';
  $('sound-mark').setAttribute('d', sound ? 'M15 8c3 2 3 6 0 8m3-11c5 4 5 10 0 14' : 'm16 9 5 6m0-6-5 6');
  if (sound) tone(600, 0.1);
});

const movementKeys = new Set(['arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'a', 'd', 'w', 's']);
window.addEventListener('keydown', event => {
  const key = event.key.toLowerCase();
  if (event.target instanceof HTMLElement && event.target.matches('input, textarea, select, [contenteditable="true"]')) return;
  if (key === 'escape' || key === 'p') {
    if (!event.repeat) { if (mode === 'playing') pauseGame(); else if (mode === 'paused') resumeGame(); }
    return;
  }
  if (mode === 'playing' && (movementKeys.has(key) || key === ' ')) {
    event.preventDefault();
    if (key === ' ') { if (!event.repeat) shield(); }
    else keys.add(key);
  }
});
window.addEventListener('keyup', event => keys.delete(event.key.toLowerCase()));
window.addEventListener('blur', pauseGame);
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });

function pointerPosition(event) {
  const bounds = canvas.getBoundingClientRect();
  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top - (event.pointerType === 'touch' ? 42 : 0), id: event.pointerId };
}
canvas.addEventListener('pointerdown', event => {
  if (mode !== 'playing' || pointer || (event.pointerType === 'mouse' && event.button !== 0)) return;
  event.preventDefault();
  pointer = pointerPosition(event);
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove', event => {
  if (pointer?.id === event.pointerId) pointer = pointerPosition(event);
});
const releasePointer = event => { if (pointer?.id === event.pointerId) pointer = null; };
canvas.addEventListener('pointerup', releasePointer);
canvas.addEventListener('pointercancel', releasePointer);
canvas.addEventListener('lostpointercapture', releasePointer);
canvas.addEventListener('contextmenu', event => event.preventDefault());

function burst(x, y, color, count = 12) {
  if (reducedMotion) count = 4;
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2, velocity = 30 + Math.random() * 145;
    particles.push({ x, y, vx: Math.cos(angle) * velocity, vy: Math.sin(angle) * velocity, life: 0.5 + Math.random() * 0.35, color, radius: 1 + Math.random() * 2 });
  }
}

function processEvents() {
  for (const event of game.events) {
    if (event.type === 'crystal') {
      burst(event.x, event.y, '#d8fb7b');
      floaters.push({ x: event.x, y: event.y, text: '+100', life: 0.8, color: '#d8fb7b' });
      tone(740, 0.12, 'sine', 0.04, 1200);
    } else if (event.type === 'hit') {
      burst(event.x, event.y, '#ff9a8f', 24); hitFlash = 0.24;
      tone(110, 0.25, 'triangle', 0.08, 45);
      announce(`${game.health} von 3 Leben übrig.`);
    } else if (event.type === 'blocked') {
      burst(event.x, event.y, '#c2adff', 20);
      floaters.push({ x: event.x, y: event.y, text: '+25', life: 0.7, color: '#c2adff' });
      tone(220, 0.15, 'triangle', 0.035, 80);
    }
  }
}

function drawBackground(time) {
  ctx.fillStyle = '#131321'; ctx.fillRect(0, 0, width, height);
  const nebula = ctx.createRadialGradient(width * 0.68, height * 0.42, 0, width * 0.6, height * 0.5, width * 0.75);
  nebula.addColorStop(0, '#432b654d'); nebula.addColorStop(0.5, '#27203a3a'); nebula.addColorStop(1, '#13132100');
  ctx.fillStyle = nebula; ctx.fillRect(0, 0, width, height);
  ctx.save();
  ctx.strokeStyle = '#a28acb08'; ctx.lineWidth = 1;
  for (let x = 0; x < width; x += 48) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
  for (let y = 0; y < height; y += 48) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
  ctx.restore();
  const drift = reducedMotion ? 0 : time;
  for (const star of stars) {
    const y = (star.y * height + drift * star.depth * (mode === 'playing' ? 18 : 3)) % height;
    ctx.globalAlpha = 0.2 + star.depth * 0.6;
    ctx.fillStyle = star.size > 1 ? '#d4c2f5' : '#c4b7db';
    ctx.beginPath(); ctx.arc(star.x * width, y, star.size, 0, Math.PI * 2); ctx.fill();
    if (star.size > 1) {
      ctx.globalAlpha *= 0.3; ctx.fillRect(star.x * width - 4, y - .5, 8, 1); ctx.fillRect(star.x * width - .5, y - 4, 1, 8);
    }
  }
  ctx.globalAlpha = 1;
  // Quiet orbital lines and a distant planet give the arena depth.
  ctx.save(); ctx.translate(width * 0.84, height * 0.25); ctx.rotate(-0.45);
  const radius = Math.min(width * 0.13, 78);
  ctx.strokeStyle = '#a68ace14'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(0, 0, radius * 2.15, radius * 0.68, 0, 0, Math.PI * 2); ctx.stroke();
  const planet = ctx.createLinearGradient(-radius, -radius, radius, radius);
  planet.addColorStop(0, '#514369'); planet.addColorStop(0.5, '#30283f'); planet.addColorStop(1, '#191723');
  ctx.fillStyle = planet; ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#c6a8ea22'; ctx.beginPath(); ctx.ellipse(0, 0, radius * 2.15, radius * 0.68, 0, 0, Math.PI); ctx.stroke();
  ctx.restore();
  const horizon = ctx.createRadialGradient(width * 0.1, height * 1.8, height * 0.8, width * 0.1, height * 1.8, height * 1.4);
  horizon.addColorStop(0, '#47365b35'); horizon.addColorStop(1, '#47365b00');
  ctx.fillStyle = horizon; ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = '#a08aba20'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(width * 0.1, height * 1.8, width * 1.2, height * 0.94, -0.1, Math.PI, Math.PI * 2); ctx.stroke();
}

function drawAsteroid(asteroid, alpha = 1) {
  ctx.save(); ctx.translate(asteroid.x, asteroid.y); ctx.rotate(asteroid.rotation); ctx.globalAlpha = alpha;
  ctx.beginPath();
  for (let i = 0; i < 9; i++) {
    const angle = i * Math.PI * 2 / 9;
    const r = asteroid.radius * (0.83 + Math.sin(i * 7.3 + asteroid.seed) * .15);
    if (i === 0) ctx.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
    else ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
  }
  ctx.closePath();
  const gradient = ctx.createLinearGradient(-asteroid.radius, -asteroid.radius, asteroid.radius, asteroid.radius);
  gradient.addColorStop(0, '#8f7286'); gradient.addColorStop(0.45, '#665366'); gradient.addColorStop(1, '#332e43');
  ctx.fillStyle = gradient; ctx.fill(); ctx.strokeStyle = '#b495ac77'; ctx.lineWidth = 1.2; ctx.stroke();
  ctx.fillStyle = '#30283d66'; ctx.strokeStyle = '#d7adc71f';
  for (const [x, y, r] of [[-.28, -.19, .2], [.3, .2, .26], [.12, -.5, .1]]) {
    ctx.beginPath(); ctx.arc(x * asteroid.radius, y * asteroid.radius, r * asteroid.radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

function drawCrystal(crystal, time, alpha = 1) {
  ctx.save(); ctx.translate(crystal.x, crystal.y); ctx.globalAlpha = alpha;
  const pulse = reducedMotion ? 1 : 1 + Math.sin(time * 3 + crystal.phase) * .08;
  ctx.scale(pulse, pulse);
  const r = crystal.radius;
  ctx.shadowColor = '#d8fb7b'; ctx.shadowBlur = 16;
  ctx.fillStyle = '#d8fb7b'; ctx.beginPath(); ctx.moveTo(0, -r * 1.25); ctx.lineTo(r * .75, 0); ctx.lineTo(0, r * 1.25); ctx.lineTo(-r * .75, 0); ctx.closePath(); ctx.fill();
  ctx.shadowBlur = 0; ctx.fillStyle = '#a2c14e'; ctx.beginPath(); ctx.moveTo(0, -r * 1.25); ctx.lineTo(r * .75, 0); ctx.lineTo(0, r * 1.25); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#f1ffca'; ctx.lineWidth = .8; ctx.beginPath(); ctx.moveTo(-r * .75, 0); ctx.lineTo(0, -r * 1.25); ctx.lineTo(0, r * 1.25); ctx.stroke();
  ctx.restore();
}

function drawShip(player, time, shieldActive = false, invulnerable = false, alpha = 1) {
  const size = scaleFor(width);
  ctx.save(); ctx.translate(player.x, player.y);
  if (invulnerable && Math.floor(time * 13) % 2) ctx.globalAlpha = alpha * .35; else ctx.globalAlpha = alpha;
  ctx.scale(size, size);
  if (shieldActive) {
    ctx.save(); ctx.rotate(time * .9);
    ctx.strokeStyle = '#d4baff'; ctx.lineWidth = 1.7; ctx.shadowColor = '#b99af4'; ctx.shadowBlur = 16;
    ctx.fillStyle = '#ba9af21a'; ctx.beginPath();
    for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; const x = Math.cos(a) * 39, y = Math.sin(a) * 39; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  }
  const flame = reducedMotion ? 24 : 19 + Math.sin(time * 37) * 7;
  const exhaust = ctx.createLinearGradient(0, 11, 0, 12 + flame);
  exhaust.addColorStop(0, '#f1d6ff'); exhaust.addColorStop(.3, '#b98bff'); exhaust.addColorStop(1, '#9670ff00');
  ctx.fillStyle = exhaust; ctx.beginPath(); ctx.moveTo(-5, 10); ctx.quadraticCurveTo(-6, 22, 0, 12 + flame); ctx.quadraticCurveTo(6, 22, 5, 10); ctx.fill();
  ctx.shadowColor = '#b7a2fb'; ctx.shadowBlur = 14;
  const body = ctx.createLinearGradient(-20, 0, 20, 15);
  body.addColorStop(0, '#f3edff'); body.addColorStop(.5, '#d5c5f5'); body.addColorStop(1, '#9380b6');
  ctx.fillStyle = body; ctx.strokeStyle = '#f7f1ff'; ctx.lineWidth = .8;
  ctx.beginPath(); ctx.moveTo(0, -24); ctx.lineTo(21, 17); ctx.lineTo(7, 12); ctx.lineTo(0, 16); ctx.lineTo(-7, 12); ctx.lineTo(-21, 17); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#65517f'; ctx.beginPath(); ctx.moveTo(0, -15); ctx.lineTo(7, 5); ctx.lineTo(0, 2); ctx.lineTo(-7, 5); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#d8fb7b'; ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(3.5, .5); ctx.lineTo(-3.5, .5); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#a49be0'; ctx.beginPath(); ctx.moveTo(-14, 12); ctx.lineTo(-7, 6); ctx.moveTo(14, 12); ctx.lineTo(7, 6); ctx.stroke();
  ctx.restore();
}

function draw(time) {
  drawBackground(time);
  if (mode === 'intro') {
    drawAsteroid({ x: width * .14, y: height * .24, radius: 30 * scaleFor(width), rotation: time * .08, seed: 4 }, .7);
    drawAsteroid({ x: width * .83, y: height * .71, radius: 41 * scaleFor(width), rotation: -time * .1, seed: 8 }, .6);
    drawCrystal({ x: width * .18, y: height * .64, radius: 11, phase: 0 }, time, .9);
    drawCrystal({ x: width * .81, y: height * .4, radius: 8, phase: 2 }, time, .65);
    drawShip({ x: width * .54, y: height * .87 }, time, false, false, .8);
  } else if (game) {
    for (const crystal of game.crystals) drawCrystal(crystal, time);
    for (const asteroid of game.asteroids) drawAsteroid(asteroid);
    if (game.health > 0) drawShip(game.player, time, game.shield > 0, game.invulnerable > 0);
  }
  for (const p of particles) {
    ctx.globalAlpha = Math.min(1, p.life * 2); ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2); ctx.fill();
  }
  for (const f of floaters) {
    ctx.globalAlpha = Math.min(1, f.life * 2); ctx.fillStyle = f.color;
    ctx.font = '600 15px -apple-system, BlinkMacSystemFont, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
  if (hitFlash > 0 && !reducedMotion) { ctx.fillStyle = `rgba(255,100,110,${hitFlash * .5})`; ctx.fillRect(0, 0, width, height); }
}

function frame(now) {
  const dt = Math.min(.05, Math.max(0, (now - (previousTime || now)) / 1000));
  previousTime = now;
  if (mode === 'playing' || mode === 'intro') visualTime += dt;
  if (mode === 'playing') {
    let dx = (keys.has('arrowright') || keys.has('d') ? 1 : 0) - (keys.has('arrowleft') || keys.has('a') ? 1 : 0);
    let dy = (keys.has('arrowdown') || keys.has('s') ? 1 : 0) - (keys.has('arrowup') || keys.has('w') ? 1 : 0);
    if (dx || dy) {
      const norm = Math.hypot(dx, dy);
      const speed = Math.min(width, height) * .95;
      movePlayer(game, game.player.x + dx / norm * speed * dt, game.player.y + dy / norm * speed * dt);
    } else if (pointer) {
      const follow = Math.min(1, dt * 15);
      movePlayer(game, game.player.x + (pointer.x - game.player.x) * follow, game.player.y + (pointer.y - game.player.y) * follow);
    }
    stepGame(game, dt);
    processEvents();
    updateHud();
    if (game.status !== 'playing') finishGame();
  }
  if (mode !== 'paused') {
    for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
    for (const f of floaters) { f.y -= 32 * dt; f.life -= dt; }
    particles = particles.filter(p => p.life > 0);
    floaters = floaters.filter(f => f.life > 0);
    hitFlash = Math.max(0, hitFlash - dt);
  }
  draw(visualTime);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
