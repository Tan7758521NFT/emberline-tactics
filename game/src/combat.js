// Combat: hitscan shooting with body-part damage, pooled tracers and sparks,
// and thrown grenades with a fuse and area damage. All transient effects come
// from fixed pools, so the hot loop allocates nothing per frame.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const TRACERS = 8;
const SPARKS = 8;
const GRENADES = 4;

export function createCombat(scene, shootables, audio, onPlayerDamage) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = 120;
  const origin = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const hitPoint = new THREE.Vector3();

  const tracerMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.ember), transparent: true, opacity: 0.9 });
  const tracerGeo = new THREE.BoxGeometry(0.025, 0.025, 1);
  const tracers = [];
  for (let i = 0; i < TRACERS; i += 1) {
    const mesh = new THREE.Mesh(tracerGeo, tracerMat.clone());
    mesh.visible = false;
    scene.add(mesh);
    tracers.push({ mesh, life: 0 });
  }
  let tracerNext = 0;

  const sparkMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.ember), transparent: true, opacity: 1, side: THREE.DoubleSide });
  const sparkGeo = new THREE.PlaneGeometry(0.22, 0.22);
  const sparks = [];
  for (let i = 0; i < SPARKS; i += 1) {
    const mesh = new THREE.Mesh(sparkGeo, sparkMat.clone());
    mesh.visible = false;
    scene.add(mesh);
    sparks.push({ mesh, life: 0 });
  }
  let sparkNext = 0;

  const boomGeo = new THREE.SphereGeometry(1, 16, 12);
  const boomMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.ember), transparent: true, opacity: 0.7 });
  const boom = new THREE.Mesh(boomGeo, boomMat);
  boom.visible = false;
  scene.add(boom);
  const boomLight = new THREE.PointLight(new THREE.Color(PALETTE.ember), 0, 18);
  scene.add(boomLight);
  let boomLife = 0;

  const grenadeGeo = new THREE.SphereGeometry(0.09, 10, 8);
  const grenadeMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.5, metalness: 0.4 });
  const grenades = [];
  for (let i = 0; i < GRENADES; i += 1) {
    const mesh = new THREE.Mesh(grenadeGeo, grenadeMat);
    mesh.visible = false;
    scene.add(mesh);
    grenades.push({ mesh, active: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), fuse: 0 });
  }

  function showTracer(from, to) {
    const t = tracers[tracerNext];
    tracerNext = (tracerNext + 1) % TRACERS;
    t.life = 0.09;
    t.mesh.visible = true;
    t.mesh.position.copy(from).add(to).multiplyScalar(0.5);
    t.mesh.lookAt(to);
    t.mesh.scale.set(1, 1, from.distanceTo(to));
    t.mesh.material.opacity = 0.9;
  }

  function showSpark(at, normal) {
    const s = sparks[sparkNext];
    sparkNext = (sparkNext + 1) % SPARKS;
    s.life = 0.14;
    s.mesh.visible = true;
    s.mesh.position.copy(at);
    if (normal) s.mesh.lookAt(at.clone().add(normal));
    s.mesh.material.opacity = 1;
  }

  // One hitscan shot. hitMeshes are the bots' body parts; damageBot applies
  // the damage and returns 'hit' | 'kill'. Returns the hit point, or null.
  function fire(from, direction, def, botHitMeshes, damageBot, random) {
    origin.copy(from);
    dir.copy(direction);
    raycaster.set(origin, dir);
    const hits = raycaster.intersectObjects(shootables.concat(botHitMeshes), false);
    const end = hits.length > 0 ? hits[0].point : origin.clone().add(dir.clone().multiplyScalar(def.range));
    showTracer(from, end);
    if (hits.length === 0) return null;
    const hit = hits[0];
    hitPoint.copy(hit.point);
    const target = hit.object.userData.bot;
    if (target !== undefined) {
      const part = hit.object.userData.part;
      const amount = def.damage * (part === 'head' ? def.headMult : 1);
      const result = damageBot(target, amount, part);
      if (result === 'kill') audio.kill();
      else audio.hit();
      return { point: hitPoint, bot: target, part, result };
    }
    showSpark(hitPoint, hit.face ? hit.face.normal : null);
    return { point: hitPoint, bot: -1, part: 'world', result: 'hit' };
  }

  function throwGrenade(from, direction, colliders) {
    const g = grenades.find((item) => !item.active);
    if (!g) return;
    g.active = true;
    g.pos.copy(from);
    g.vel.copy(direction).multiplyScalar(17);
    g.vel.y += 4.5;
    g.fuse = 1.6;
    g.mesh.visible = true;
    g.mesh.position.copy(g.pos);
    g.colliders = colliders;
  }

  function explode(at, bots, playerPos, damageBot) {
    boom.visible = true;
    boom.position.copy(at);
    boom.scale.setScalar(0.5);
    boomLife = 0.4;
    boomLight.position.copy(at);
    boomLight.intensity = 60;
    audio.grenade();
    for (let i = 0; i < bots.length; i += 1) {
      const b = bots[i];
      if (!b.alive) continue;
      const d = b.position.distanceTo(at);
      if (d < 6.5) damageBot(i, Math.round(115 * (1 - d / 7.5)), 'blast');
    }
    if (playerPos) {
      const d = playerPos.distanceTo(at);
      if (d < 6.5) onPlayerDamage(Math.round(90 * (1 - d / 7.5)));
    }
  }

  function step(dt, bots, playerPos, damageBot, colliders) {
    for (const t of tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      t.mesh.material.opacity = Math.max(0, t.life / 0.09) * 0.9;
      if (t.life <= 0) t.mesh.visible = false;
    }
    for (const s of sparks) {
      if (s.life <= 0) continue;
      s.life -= dt;
      s.mesh.material.opacity = Math.max(0, s.life / 0.14);
      if (s.life <= 0) s.mesh.visible = false;
    }
    if (boomLife > 0) {
      boomLife -= dt;
      const k = 1 - boomLife / 0.4;
      boom.scale.setScalar(0.5 + k * 5);
      boomMat.opacity = 0.7 * (1 - k);
      boomLight.intensity = 60 * (1 - k);
      if (boomLife <= 0) {
        boom.visible = false;
        boomLight.intensity = 0;
      }
    }
    for (const g of grenades) {
      if (!g.active) continue;
      g.fuse -= dt;
      g.vel.y -= 14 * dt;
      g.pos.addScaledVector(g.vel, dt);
      // Cheap bounce: if the new point is inside a collider, step back and
      // kill the velocity component that crossed it.
      let inside = false;
      for (const c of colliders) {
        if (c.containsPoint(g.pos)) { inside = true; break; }
      }
      if (inside || g.pos.y < 0.09) {
        g.pos.addScaledVector(g.vel, -dt);
        if (g.pos.y < 0.09) {
          g.pos.y = 0.09;
          g.vel.y = Math.abs(g.vel.y) * 0.35;
          g.vel.x *= 0.6;
          g.vel.z *= 0.6;
        } else {
          g.vel.multiplyScalar(-0.3);
        }
      }
      g.mesh.position.copy(g.pos);
      if (g.fuse <= 0) {
        g.active = false;
        g.mesh.visible = false;
        explode(g.pos, bots, playerPos, damageBot);
      }
    }
  }

  return {
    fire,
    throwGrenade,
    tracer: showTracer,
    step,
    explode,
    reset() {
      for (const t of tracers) { t.life = 0; t.mesh.visible = false; }
      for (const s of sparks) { s.life = 0; s.mesh.visible = false; }
      for (const g of grenades) { g.active = false; g.mesh.visible = false; }
      boomLife = 0;
      boom.visible = false;
      boomLight.intensity = 0;
    },
  };
}
