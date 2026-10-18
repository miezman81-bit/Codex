export const MISSION_SECONDS = 60;
export const SHIELD_SECONDS = 2;
export const SHIELD_COOLDOWN = 8;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const scaleFor = width => clamp(width / 700, 0.7, 1);

export function createGame(width, height, random = Math.random) {
  return {
    width, height, random, elapsed: 0, score: 0, health: 3, status: 'playing',
    player: { x: width / 2, y: height * 0.8, radius: 15 * scaleFor(width) },
    invulnerable: 0, shield: 0, shieldCooldown: 0,
    asteroids: [], crystals: [], nextAsteroid: 0.7, nextCrystal: 0.45,
    events: [],
  };
}

export function resizeGame(game, width, height) {
  const xScale = width / game.width;
  const yScale = height / game.height;
  for (const entity of [game.player, ...game.asteroids, ...game.crystals]) {
    entity.x *= xScale;
    entity.y *= yScale;
  }
  game.width = width;
  game.height = height;
  game.player.radius = 15 * scaleFor(width);
  movePlayer(game, game.player.x, game.player.y);
}

export function movePlayer(game, x, y) {
  const pad = game.player.radius + 5;
  game.player.x = clamp(x, pad, game.width - pad);
  game.player.y = clamp(y, Math.max(pad, 82), game.height - pad);
}

export function activateShield(game) {
  if (game.status !== 'playing' || game.shieldCooldown > 0) return false;
  game.shield = SHIELD_SECONDS;
  // Cooldown starts after the shield's two active seconds.
  game.shieldCooldown = SHIELD_SECONDS + SHIELD_COOLDOWN;
  return true;
}

function overlapping(a, b, extra = 0) {
  return Math.hypot(a.x - b.x, a.y - b.y) < a.radius + b.radius + extra;
}

export function stepGame(game, dt) {
  game.events = [];
  if (game.status !== 'playing') return;
  dt = clamp(dt, 0, 0.05);
  game.elapsed = Math.min(MISSION_SECONDS, game.elapsed + dt);
  game.invulnerable = Math.max(0, game.invulnerable - dt);
  game.shield = Math.max(0, game.shield - dt);
  game.shieldCooldown = Math.max(0, game.shieldCooldown - dt);
  const difficulty = game.elapsed / MISSION_SECONDS;
  const size = scaleFor(game.width);
  const speed = game.height / 560;
  game.nextAsteroid -= dt;
  game.nextCrystal -= dt;

  if (game.nextAsteroid <= 0) {
    const radius = (17 + game.random() * 16) * size;
    game.asteroids.push({
      x: radius + game.random() * (game.width - radius * 2), y: -radius * 2,
      radius, speed: (95 + game.random() * 70 + difficulty * 110) * speed,
      rotation: game.random() * Math.PI * 2, spin: (game.random() - 0.5) * 1.7,
      seed: game.random() * 100,
    });
    game.nextAsteroid = 0.8 - difficulty * 0.42;
  }
  if (game.nextCrystal <= 0) {
    const radius = 11 * size;
    game.crystals.push({ x: 25 + game.random() * (game.width - 50), y: -30, radius,
      speed: (115 + difficulty * 65) * speed, phase: game.random() * 6.28 });
    game.nextCrystal = 0.85 + game.random() * 0.35;
  }

  for (const asteroid of game.asteroids) {
    asteroid.y += asteroid.speed * dt;
    asteroid.rotation += asteroid.spin * dt;
    if (!overlapping(game.player, asteroid, game.shield > 0 ? 17 * size : -4 * size)) continue;
    if (game.shield > 0) {
      asteroid.removed = true;
      game.score += 25;
      game.events.push({ type: 'blocked', x: asteroid.x, y: asteroid.y });
    } else if (game.invulnerable <= 0) {
      asteroid.removed = true;
      game.health -= 1;
      game.invulnerable = 1.6;
      game.events.push({ type: 'hit', x: game.player.x, y: game.player.y });
      if (game.health <= 0) break;
    }
  }
  if (game.health > 0) {
    for (const crystal of game.crystals) {
      crystal.y += crystal.speed * dt;
      if (overlapping(game.player, crystal, 8 * size)) {
        crystal.removed = true;
        game.score += 100;
        game.events.push({ type: 'crystal', x: crystal.x, y: crystal.y });
      }
    }
  }
  game.asteroids = game.asteroids.filter(a => !a.removed && a.y < game.height + a.radius * 2);
  game.crystals = game.crystals.filter(c => !c.removed && c.y < game.height + 30);
  if (game.health <= 0) {
    game.status = 'lost';
    game.events.push({ type: 'end' });
  } else if (game.elapsed >= MISSION_SECONDS) {
    game.score += game.health * 250;
    game.status = 'won';
    game.events.push({ type: 'end' });
  }
}
