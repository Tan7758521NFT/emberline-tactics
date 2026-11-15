// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the
// display's rate. ?shot=start|play|plant|end with &seed=N sets up a
// deterministic frame for a capture, renders it twice, then freezes it and
// sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { MAP, createMap } from './map.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapons, WEAPONS, GRENADE_PRICE, ARMOR_PRICE, AMMO_PRICE } from './weapons.js';
import { createBots } from './bots.js';
import { createCombat } from './combat.js';
import { createRounds } from './rounds.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 30, 95);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const audio = createAudio();
const map = createMap(scene);
const player = createPlayer(map.colliders);
const weapons = createWeapons(camera, audio);
const bots = createBots(scene, map, audio);
const combat = createCombat(scene, map.shootables, audio, (amount) => hurtPlayer(amount));
const rounds = createRounds({
  onRoundEnd(winner, reason) {
    const good = winner === 'ember';
    hud.bannerShow(good ? 'ROUND WON' : 'ROUND LOST', reason, good);
    hud.hideBuy();
    if (good) audio.roundWin();
    else audio.roundLose();
    if (document.pointerLockElement) document.exitPointerLock();
  },
  onBuyTimeout() {
    startRound();
  },
  onNextRound() {
    hud.bannerHide();
    rounds.nextRound();
    beginBuyPhase();
  },
  onRoundStart() {
    resetPositions();
  },
  onPlant(site) {
    audio.plant();
    hud.feedLine(`Charge planted at site ${site.id}.`);
  },
  onFuseTick(fuseLeft) {
    audio.beep(fuseLeft <= 5);
  },
  onMatchEnd(winner) {
    hud.showOverlay('match', { ember: rounds.state.scoreEmber, ashfall: rounds.state.scoreAshfall });
    if (document.pointerLockElement) document.exitPointerLock();
  },
});
const hud = createHud({
  onBuy(item) {
    buyItem(item);
  },
  onPlay() {},
});
const input = createInput(renderer.domElement, onLockChange);

const raycaster = new THREE.Raycaster();
raycaster.far = 120;
const body = player.state;
const direction = new THREE.Vector3();
const muzzle = new THREE.Vector3();
const aimPoint = new THREE.Vector3();

let started = false;
let frozen = false;
let elapsed = 0;
let accumulator = 0;
let lastTime = performance.now();
let fovTarget = 74;

function hurtPlayer(amount) {
  if (!body.alive) return;
  const alive = player.damage(amount);
  audio.hurt();
  if (!alive) hud.feedLine('You were eliminated.');
}

function damageBot(index, amount, part) {
  const result = bots.damage(index, amount);
  bots.hear(body.position.x, body.position.z, elapsed);
  if (result === 'kill') {
    rounds.awardKill();
    hud.feedLine(`You eliminated an Ashfall operative (+$300).`);
  }
  return result;
}

function resetPositions() {
  player.reset(MAP.playerSpawn.x, MAP.playerSpawn.z, MAP.playerSpawn.yaw);
  bots.reset();
  combat.reset();
  weapons.resetForRound();
}

function beginBuyPhase() {
  if (rounds.state.phase !== 'buy') return;
  hud.showBuy(weapons.owned, rounds.state.money, weapons.state.grenades);
  hud.setHint('Buy phase — keys 1-6 buy, Enter starts the round.');
}

function startRound() {
  if (rounds.state.phase !== 'buy') return;
  rounds.startRound();
  hud.hideBuy();
  hud.setHint('');
  if (!shot) input.requestLock();
}

function buyItem(item) {
  if (rounds.state.phase !== 'buy') return;
  const money = rounds.state.money;
  let cost = 0;
  if (item.kind === 'gun') {
    cost = weapons.buy(item.index, money);
    if (cost > 0) weapons.equip(item.index);
  } else if (item.kind === 'grenade') {
    cost = weapons.buyGrenade(money);
  } else if (item.kind === 'armor') {
    if (money >= ARMOR_PRICE && body.armor < 100) {
      cost = ARMOR_PRICE;
      body.armor = 100;
    }
  } else if (item.kind === 'ammo') {
    cost = weapons.buyAmmo(money);
  }
  if (cost > 0) {
    rounds.state.money -= cost;
    audio.buy();
    hud.setMoney(rounds.state.money);
    hud.showBuy(weapons.owned, rounds.state.money, weapons.state.grenades);
  }
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    audio.unlock();
    hud.hideOverlay();
  } else if (rounds.state.phase === 'live' && body.alive) {
    hud.showOverlay('paused');
  }
}

hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  if (rounds.state.phase === 'match') {
    rounds.resetMatch();
    resetPositions();
    hud.hideOverlay();
    beginBuyPhase();
    return;
  }
  if (!started) {
    started = true;
    resetPositions();
    hud.hideOverlay();
    beginBuyPhase();
    return;
  }
  if (rounds.state.phase === 'live') input.requestLock();
});

function syncCamera() {
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function shoot() {
  const def = weapons.currentDef();
  if (!weapons.fire()) return;
  camera.getWorldDirection(direction);
  const spread = weapons.spread(player.groundSpeed(), body.crouching, input.state.aiming);
  direction.x += (random() * 2 - 1) * spread;
  direction.y += (random() * 2 - 1) * spread;
  direction.z += (random() * 2 - 1) * spread;
  direction.normalize();
  scene.updateMatrixWorld(true);
  const muzzlePos = camera.position;
  for (let p = 0; p < def.pellets; p += 1) {
    const pelletDir = direction.clone();
    if (def.pellets > 1) {
      pelletDir.x += (random() * 2 - 1) * def.spreadStill * 2;
      pelletDir.y += (random() * 2 - 1) * def.spreadStill * 2;
      pelletDir.normalize();
    }
    const hit = combat.fire(muzzlePos, pelletDir, def, bots.hitMeshes, damageBot, random);
    if (hit && hit.bot >= 0) hud.hitMarker(hit.result === 'kill', 120);
  }
  bots.hear(body.position.x, body.position.z, elapsed);
  player.recoil(def.recoil + random() * 0.004, (random() * 2 - 1) * 0.004);
}

function handlePressed(pressed) {
  for (const code of pressed) {
    if (rounds.state.phase === 'buy') {
      if (code === 'Enter') {
        startRound();
      } else if (code === 'KeyB') {
        hud.hideBuy();
      } else if (code.startsWith('Digit')) {
        const n = Number(code.slice(5));
        const items = [
          ...WEAPONS.map((w, i) => ({ kind: 'gun', index: i })),
          { kind: 'grenade', index: -1 },
          { kind: 'armor', index: -1 },
          { kind: 'ammo', index: -1 },
        ];
        if (n >= 1 && n <= items.length) buyItem(items[n - 1]);
      }
    } else if (rounds.state.phase === 'live') {
      if (code === 'KeyR') weapons.reload();
      else if (code === 'KeyG') {
        if (weapons.throwGrenade()) {
          camera.getWorldDirection(direction);
          muzzle.copy(camera.position);
          combat.throwGrenade(muzzle, direction, map.colliders);
        }
      } else if (code.startsWith('Digit')) {
        const n = Number(code.slice(5));
        if (n >= 1 && n <= 3) weapons.equip(n - 1);
      }
    }
  }
}

function step(dt) {
  elapsed += dt;
  const pressed = input.takePressed();
  handlePressed(pressed);
  if (rounds.state.phase === 'live' && body.alive) {
    player.step(dt, input.state.keys);
  }
  weapons.step(dt);
  bots.step(dt, {
    playerPos: aimPoint.set(body.position.x, body.position.y, body.position.z),
    playerAlive: body.alive,
    playerSpeed: player.groundSpeed(),
    playerCrouching: body.crouching,
    shootables: map.shootables,
    colliders: map.colliders,
    plantedSite: rounds.state.bombPlanted ? rounds.state.bombSite : null,
    time: elapsed,
    random,
    onPlayerDamage: hurtPlayer,
    tracer: combat.tracer,
    onDefused: () => rounds.defused(),
  });
  combat.step(dt, bots.bots, body.alive ? body.position : null, damageBot, map.colliders);
  rounds.step(dt, {
    playerAlive: body.alive,
    botsAlive: bots.aliveCount(),
    playerX: body.position.x,
    playerZ: body.position.z,
    planting: input.state.keys.has('KeyE'),
  });
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    if (input.state.locked) player.look(look.x, look.y);
    if (input.state.locked && rounds.state.phase === 'live' && body.alive) {
      if (weapons.trigger(input.state.firing) && weapons.ready()) shoot();
    }
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
    fovTarget = input.state.aiming && rounds.state.phase === 'live' ? 58 : 74;
    if (Math.abs(camera.fov - fovTarget) > 0.1) {
      camera.fov += (fovTarget - camera.fov) * Math.min(1, dt * 10);
      camera.updateProjectionMatrix();
    }
    syncHud();
  }
  renderer.render(scene, camera);
}

function syncHud() {
  const r = rounds.state;
  hud.setHealth(Math.ceil(body.health), Math.ceil(body.armor));
  const def = weapons.currentDef();
  hud.setAmmo(weapons.mags[weapons.state.current], weapons.reserves[weapons.state.current], def.name);
  hud.setMoney(r.money);
  hud.setTimer(r.timeLeft, r.phase);
  hud.setScore(r.scoreEmber, r.scoreAshfall, r.round);
  if (r.bombPlanted) {
    hud.setBomb({ planted: true, site: r.bombSite.id, fuse: r.fuseLeft });
  } else if (r.plantProgress > 0) {
    hud.setBomb({ planted: false, progress: r.plantProgress });
  } else {
    hud.setBomb(null);
  }
  if (r.phase === 'live') {
    const site = r.plantSite;
    if (!r.bombPlanted && site) hud.setHint('Hold E to plant the charge at site ' + site.id + '.');
    else if (r.bombPlanted) hud.setHint('Charge planted — defend site ' + r.bombSite.id + '.');
    else hud.setHint('');
  }
  const spreadPx = weapons.spread(player.groundSpeed(), body.crouching, input.state.aiming) * 2600 + 4;
  hud.setCrosshair(spreadPx);
}

function settle(steps) {
  for (let i = 0; i < steps; i += 1) step(FIXED_STEP);
}

function placeBot(index, x, z, yaw) {
  const bot = bots.bots[index];
  bot.position.set(x, 0, z);
  bot.yaw = yaw;
  bot.group.rotation.y = yaw;
  bot.state = 'hold';
}

function runShot(name) {
  hud.hideOverlay();
  hud.bannerHide();
  resetPositions();
  rounds.state.money = 4600;
  weapons.owned[1] = true;
  weapons.equip(1);
  weapons.refill();
  if (name === 'start') {
    body.position.set(0, 0, 12.5);
    body.yaw = 0;
    body.pitch = 0;
    settle(20);
    aimAt(new THREE.Vector3(0, 1.8, -10));
    hud.showBuy(weapons.owned, rounds.state.money, weapons.state.grenades);
    hud.setHint('Buy phase — keys 1-6 buy, Enter starts the round.');
  } else if (name === 'play') {
    rounds.startRound();
    body.position.set(2, 0, 6);
    placeBot(0, -3, 0, Math.PI * 0.8);
    placeBot(1, 6, -4, Math.PI * 0.6);
    settle(20);
    aimAt(new THREE.Vector3(-3, 1.2, 0));
    shoot();
    settle(6);
    aimAt(new THREE.Vector3(-3, 1.2, 0));
    shoot();
    hud.hitMarker(false, 60000);
    settle(2);
  } else if (name === 'plant') {
    rounds.startRound();
    body.position.set(-11, 0, -7);
    placeBot(2, -14, -12.5, 0);
    settle(20);
    aimAt(new THREE.Vector3(-14, 1.2, -10));
    rounds.state.plantProgress = 0.62;
    rounds.state.plantSite = MAP.sites[0];
    settle(2);
  } else {
    // end: a round just won, banner and score on screen.
    rounds.state.scoreEmber = 1;
    rounds.state.scoreAshfall = 0;
    rounds.state.phase = 'over';
    rounds.state.winner = 'ember';
    rounds.state.overTimer = 10;
    rounds.state.timeLeft = 72;
    body.position.set(2, 0, 6);
    placeBot(0, -3, 0, Math.PI * 0.8);
    bots.bots[0].alive = false;
    bots.bots[0].state = 'dead';
    bots.bots[0].fall = 1;
    bots.bots[0].group.rotation.x = -1.45;
    settle(20);
    aimAt(new THREE.Vector3(-3, 1.0, 0));
    hud.bannerShow('ROUND WON', 'Ashfall crew eliminated.', true, 0);
  }
  syncHud();
  syncCamera();
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

syncCamera();
syncHud();
if (shot) runShot(shot);
else requestAnimationFrame(frame);
