import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame, activateShield, movePlayer, resizeGame } from '../engine.mjs';

const asteroidAt = (game, overrides = {}) => ({
  x: game.player.x, y: game.player.y, radius: 20, speed: 0, rotation: 0, spin: 0, seed: 1, ...overrides,
});

test('crystals award points once and are removed', () => {
  const game = createGame(700, 560);
  game.crystals.push({ x: game.player.x, y: game.player.y, radius: 11, speed: 0 });
  stepGame(game, 0.016);
  assert.equal(game.score, 100);
  assert.equal(game.crystals.length, 0);
  assert.equal(game.events[0].type, 'crystal');
  stepGame(game, 0.016);
  assert.equal(game.score, 100);
});

test('one impact removes a life; invulnerability protects against overlapping impacts', () => {
  const game = createGame(700, 560);
  game.asteroids.push(asteroidAt(game), asteroidAt(game));
  stepGame(game, 0.016);
  assert.equal(game.health, 2);
  assert.equal(game.events.filter(e => e.type === 'hit').length, 1);
  stepGame(game, 0.016);
  assert.equal(game.health, 2);
});

test('shield destroys an asteroid and awards its bonus without losing a life', () => {
  const game = createGame(700, 560);
  assert.equal(activateShield(game), true);
  game.asteroids.push(asteroidAt(game));
  stepGame(game, 0.016);
  assert.equal(game.health, 3);
  assert.equal(game.score, 25);
  assert.equal(game.asteroids.length, 0);
  assert.equal(game.events[0].type, 'blocked');
  assert.equal(activateShield(game), false);
});

test('shield has two seconds of protection followed by eight seconds of recharge', () => {
  const game = createGame(700, 560);
  activateShield(game);
  game.nextAsteroid = game.nextCrystal = 100;
  for (let i = 0; i < 42; i++) stepGame(game, 0.05);
  assert.equal(game.shield, 0);
  assert.ok(game.shieldCooldown > 7.8 && game.shieldCooldown < 8);
  assert.equal(activateShield(game), false);
  for (let i = 0; i < 160; i++) stepGame(game, 0.05);
  assert.equal(game.shieldCooldown, 0);
  assert.equal(activateShield(game), true);
});

test('third unprotected impact ends the game and stopped games do not advance', () => {
  const game = createGame(700, 560);
  game.health = 1;
  game.asteroids.push(asteroidAt(game));
  stepGame(game, 0.016);
  assert.equal(game.health, 0);
  assert.equal(game.status, 'lost');
  const elapsed = game.elapsed;
  stepGame(game, 0.05);
  assert.equal(game.elapsed, elapsed);
  assert.equal(activateShield(game), false);
});

test('60-second victory awards the remaining-life bonus exactly once', () => {
  const game = createGame(700, 560);
  game.elapsed = 59.98;
  game.health = 2;
  game.score = 300;
  stepGame(game, 0.05);
  assert.equal(game.status, 'won');
  assert.equal(game.elapsed, 60);
  assert.equal(game.score, 800);
  stepGame(game, 0.05);
  assert.equal(game.score, 800);
});

test('fatal impact at the finish line takes precedence over victory', () => {
  const game = createGame(700, 560);
  game.elapsed = 59.99;
  game.health = 1;
  game.asteroids.push(asteroidAt(game));
  stepGame(game, 0.05);
  assert.equal(game.status, 'lost');
  assert.equal(game.score, 0);
});

test('player stays inside the arena and below the HUD', () => {
  const game = createGame(350, 440);
  movePlayer(game, -100, -100);
  assert.ok(game.player.x >= game.player.radius);
  assert.ok(game.player.y >= 82);
  movePlayer(game, 1000, 1000);
  assert.ok(game.player.x <= game.width - game.player.radius);
  assert.ok(game.player.y <= game.height - game.player.radius);
});

test('resizing preserves relative positions and recalculates collision size', () => {
  const game = createGame(700, 560);
  game.asteroids.push(asteroidAt(game));
  resizeGame(game, 350, 440);
  assert.equal(game.player.x, 175);
  assert.equal(game.player.y, 352);
  assert.equal(game.asteroids[0].x, 175);
  assert.equal(game.player.radius, 10.5);
});

test('spawned objects move through the arena and offscreen objects are removed', () => {
  const game = createGame(700, 560, () => .5);
  game.nextAsteroid = game.nextCrystal = 0;
  stepGame(game, .05);
  assert.equal(game.asteroids.length, 1);
  assert.equal(game.crystals.length, 1);
  const y = game.asteroids[0].y;
  stepGame(game, .05);
  assert.ok(game.asteroids[0].y > y);
  game.asteroids[0].y = 900;
  game.crystals[0].y = 900;
  stepGame(game, .05);
  assert.equal(game.asteroids.length, 0);
  assert.equal(game.crystals.length, 0);
});

test('a full 60-second simulation spawns hazards and finishes with a survival bonus', () => {
  const game = createGame(700, 560, () => .5);
  movePlayer(game, 30, 440);
  let sawHazards = false;
  for (let i = 0; i < 1202; i++) {
    stepGame(game, .05);
    sawHazards ||= game.asteroids.length > 0 && game.crystals.length > 0;
  }
  assert.equal(sawHazards, true);
  assert.equal(game.status, 'won');
  assert.equal(game.health, 3);
  assert.equal(game.elapsed, 60);
  assert.equal(game.score, 750);
});
