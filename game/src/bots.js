// Ashfall bots: four opponents with a small state machine. They patrol their
// routes, hold their site, walk to the last noise they heard, and when they
// see the player they stop, aim and fire in bursts. When the charge is
// planted they converge on its site, and the first one there starts defusing.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { MAP } from './map.js';

const BOT_COUNT = 4;
const BOT_SPEED = 3.4;
const BOT_HEALTH = 100;
const RADIUS = 0.34;

export function createBots(scene, map, audio) {
  const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.enemy), roughness: 0.6, metalness: 0.05 });
  const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#241d18'), roughness: 0.7, metalness: 0.1 });
  const gunMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.steel), roughness: 0.55, metalness: 0.4 });
  const torsoGeo = new THREE.BoxGeometry(0.52, 0.78, 0.3);
  const headGeo = new THREE.SphereGeometry(0.155, 12, 10);
  const legGeo = new THREE.BoxGeometry(0.44, 0.5, 0.26);
  const gunGeo = new THREE.BoxGeometry(0.07, 0.09, 0.5);

  const bots = [];
  const hitMeshes = [];
  const raycaster = new THREE.Raycaster();
  raycaster.far = 60;
  const eye = new THREE.Vector3();
  const toPlayer = new THREE.Vector3();
  const probe = new THREE.Box3();

  function buildBot(index, spawn, route) {
    const group = new THREE.Group();
    group.position.set(spawn.x, 0, spawn.z);
    const legs = new THREE.Mesh(legGeo, darkMat);
    legs.position.y = 0.25;
    const torso = new THREE.Mesh(torsoGeo, bodyMat);
    torso.position.y = 1.0;
    torso.userData.bot = index;
    torso.userData.part = 'torso';
    const head = new THREE.Mesh(headGeo, darkMat);
    head.position.y = 1.53;
    head.userData.bot = index;
    head.userData.part = 'head';
    const gun = new THREE.Mesh(gunGeo, gunMat);
    gun.position.set(0.2, 1.05, -0.3);
    group.add(legs, torso, head, gun);
    group.traverse((mesh) => {
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    scene.add(group);
    hitMeshes.push(torso, head);
    return {
      index, group, torso, head, gun,
      position: group.position,
      yaw: Math.PI,
      health: BOT_HEALTH,
      alive: true,
      state: index >= 2 ? 'hold' : 'patrol',
      route, routeIndex: 0, routeDir: 1,
      waitLeft: 0, scanDir: 1,
      reactionLeft: 0, burstLeft: 0, shotTimer: 0, burstPause: 0,
      heard: new THREE.Vector3(), heardAt: -100,
      defuseLeft: 0, fall: 0,
      holdSite: index === 2 ? 0 : index === 3 ? 1 : -1,
    };
  }

  for (let i = 0; i < BOT_COUNT; i += 1) {
    bots.push(buildBot(i, MAP.botSpawns[i], MAP.routes[i % MAP.routes.length]));
  }

  function collides(x, z, colliders) {
    probe.min.set(x - RADIUS, 0.05, z - RADIUS);
    probe.max.set(x + RADIUS, 1.7, z + RADIUS);
    for (const c of colliders) if (probe.intersectsBox(c)) return true;
    return false;
  }

  function moveToward(bot, tx, tz, dt, colliders, speed) {
    const dx = tx - bot.position.x;
    const dz = tz - bot.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.25) return true;
    const vx = (dx / dist) * speed;
    const vz = (dz / dist) * speed;
    const nx = bot.position.x + vx * dt;
    if (!collides(nx, bot.position.z, colliders)) bot.position.x = nx;
    const nz = bot.position.z + vz * dt;
    if (!collides(bot.position.x, nz, colliders)) bot.position.z = nz;
    bot.yaw = Math.atan2(-dx, -dz);
    return dist < 0.5;
  }

  function canSee(bot, playerPos, shootables) {
    eye.set(bot.position.x, 1.5, bot.position.z);
    toPlayer.copy(playerPos).sub(eye);
    const dist = toPlayer.length();
    if (dist > 42) return 0;
    toPlayer.normalize();
    raycaster.set(eye, toPlayer);
    const hits = raycaster.intersectObjects(shootables, false);
    if (hits.length > 0 && hits[0].distance < dist - 0.5) return 0;
    return dist;
  }

  function damage(index, amount) {
    const bot = bots[index];
    if (!bot.alive) return 'hit';
    bot.health -= amount;
    if (bot.health > 0) {
      // Shot bots turn toward the fight; main.js tells them where it came
      // from by calling hear() with the shooter's position.
      if (bot.state === 'patrol' || bot.state === 'hold') bot.state = 'investigate';
      return 'hit';
    }
    bot.health = 0;
    bot.alive = false;
    bot.state = 'dead';
    bot.fall = 0;
    return 'kill';
  }

  function hear(x, z, time) {
    for (const bot of bots) {
      if (!bot.alive) continue;
      const d = Math.hypot(bot.position.x - x, bot.position.z - z);
      if (d < 26 && bot.state !== 'engage') {
        bot.heard.set(x, 0, z);
        bot.heardAt = time;
        if (bot.state === 'patrol' || bot.state === 'hold') bot.state = 'investigate';
      }
    }
  }

  function step(dt, ctx) {
    const { playerPos, playerAlive, playerSpeed, playerCrouching, shootables, colliders, plantedSite, time, random, onPlayerDamage, tracer } = ctx;
    for (const bot of bots) {
      if (!bot.alive) {
        bot.fall = Math.min(1, bot.fall + dt / 0.4);
        bot.group.rotation.x = -bot.fall * 1.45;
        continue;
      }
      const seen = playerAlive ? canSee(bot, playerPos, shootables) : 0;
      if (seen > 0 && bot.state !== 'engage') {
        bot.state = 'engage';
        bot.reactionLeft = 0.35 + random() * 0.35;
        bot.burstLeft = 0;
        bot.burstPause = 0;
      }
      if (bot.state === 'engage' && seen === 0) {
        bot.state = 'investigate';
        bot.heard.copy(playerPos);
        bot.heardAt = time;
      }
      if (plantedSite && bot.state !== 'engage' && bot.state !== 'defuse') {
        bot.state = 'investigate';
        bot.heard.set(plantedSite.x, 0, plantedSite.z);
        bot.heardAt = time;
      }

      if (bot.state === 'engage') {
        const dx = playerPos.x - bot.position.x;
        const dz = playerPos.z - bot.position.z;
        bot.yaw = Math.atan2(-dx, -dz);
        if (bot.reactionLeft > 0) {
          bot.reactionLeft -= dt;
        } else if (bot.burstLeft <= 0) {
          bot.burstPause -= dt;
          if (bot.burstPause <= 0) {
            bot.burstLeft = 3 + Math.floor(random() * 3);
            bot.shotTimer = 0;
          }
        } else {
          bot.shotTimer -= dt;
          if (bot.shotTimer <= 0) {
            bot.shotTimer = 0.14;
            bot.burstLeft -= 1;
            if (bot.burstLeft === 0) bot.burstPause = 0.45 + random() * 0.4;
            const dist = Math.hypot(dx, dz);
            const chance = Math.max(0.05, Math.min(0.55, 0.5 - dist * 0.008 - playerSpeed * 0.03 - (playerCrouching ? 0.12 : 0)));
            const muzzle = new THREE.Vector3(bot.position.x, 1.35, bot.position.z);
            const aim = new THREE.Vector3(playerPos.x, playerPos.y + 1.2, playerPos.z);
            if (random() < chance) {
              onPlayerDamage(11 + Math.floor(random() * 8));
              tracer(muzzle, aim);
            } else {
              aim.x += (random() * 2 - 1) * 1.6;
              aim.y += (random() * 2 - 1) * 1.2;
              aim.z += (random() * 2 - 1) * 1.6;
              tracer(muzzle, aim);
            }
            audio.enemyShot();
          }
        }
        continue;
      }

      if (bot.state === 'defuse') {
        bot.defuseLeft -= dt;
        if (bot.defuseLeft <= 0) ctx.onDefused();
        continue;
      }

      if (bot.state === 'hold') {
        bot.yaw += dt * 0.35 * bot.scanDir;
        if (bot.yaw > Math.PI) bot.scanDir = -1;
        if (bot.yaw < -Math.PI) bot.scanDir = 1;
        bot.group.rotation.y = bot.yaw;
        continue;
      }

      if (bot.state === 'investigate') {
        if (plantedSite && Math.hypot(bot.position.x - plantedSite.x, bot.position.z - plantedSite.z) < 1.6) {
          bot.state = 'defuse';
          bot.defuseLeft = 4;
          continue;
        }
        const arrived = moveToward(bot, bot.heard.x, bot.heard.z, dt, colliders, BOT_SPEED);
        if (arrived) {
          bot.waitLeft -= dt;
          if (bot.waitLeft <= -2) {
            bot.state = bot.holdSite >= 0 ? 'hold' : 'patrol';
          }
        } else {
          bot.waitLeft = 0;
        }
        bot.group.rotation.y = bot.yaw;
        continue;
      }

      // Patrol: walk the route ping-pong, pausing at each waypoint.
      const target = bot.route[bot.routeIndex];
      const arrived = moveToward(bot, target[0], target[1], dt, colliders, BOT_SPEED);
      if (arrived) {
        bot.waitLeft += dt;
        if (bot.waitLeft > 1.2) {
          bot.waitLeft = 0;
          bot.routeIndex += bot.routeDir;
          if (bot.routeIndex >= bot.route.length) {
            bot.routeIndex = bot.route.length - 2;
            bot.routeDir = -1;
          } else if (bot.routeIndex < 0) {
            bot.routeIndex = 1;
            bot.routeDir = 1;
          }
        }
      }
      bot.group.rotation.y = bot.yaw;
    }
  }

  function reset() {
    for (let i = 0; i < bots.length; i += 1) {
      const bot = bots[i];
      const spawn = MAP.botSpawns[i];
      bot.group.position.set(spawn.x, 0, spawn.z);
      bot.group.rotation.set(0, 0, 0);
      bot.yaw = Math.PI;
      bot.health = BOT_HEALTH;
      bot.alive = true;
      bot.state = i >= 2 ? 'hold' : 'patrol';
      bot.routeIndex = 0;
      bot.routeDir = 1;
      bot.waitLeft = 0;
      bot.defuseLeft = 0;
      bot.fall = 0;
      bot.burstLeft = 0;
      bot.reactionLeft = 0;
    }
  }

  return {
    bots,
    hitMeshes,
    damage,
    hear,
    step,
    reset,
    aliveCount() {
      return bots.filter((b) => b.alive).length;
    },
  };
}
