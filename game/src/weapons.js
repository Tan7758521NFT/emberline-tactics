// Weapons: three guns and a grenade, each with its own view model, magazine,
// reload and spread. The module owns the numbers; main.js owns the raycast
// and the damage. Spread grows with movement and with sustained fire, and
// shrinks when crouched or aiming down sights, so stopping to aim pays.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = [
  {
    id: 'pistol', name: 'P9 Sidearm', kind: 'pistol', price: 500,
    damage: 26, headMult: 3, pellets: 1, mag: 12, reserve: 48,
    gap: 0.16, auto: false, reloadTime: 1.4,
    spreadStill: 0.004, spreadMove: 0.02, recoil: 0.006, range: 80,
  },
  {
    id: 'rifle', name: 'VK-7 Ember', kind: 'rifle', price: 2200,
    damage: 34, headMult: 4, pellets: 1, mag: 30, reserve: 90,
    gap: 0.096, auto: true, reloadTime: 1.9,
    spreadStill: 0.0022, spreadMove: 0.028, recoil: 0.011, range: 90,
  },
  {
    id: 'shotgun', name: 'KS-12 Scatter', kind: 'shotgun', price: 1400,
    damage: 12, headMult: 2, pellets: 8, mag: 6, reserve: 24,
    gap: 0.8, auto: false, reloadTime: 2.4,
    spreadStill: 0.03, spreadMove: 0.045, recoil: 0.03, range: 40,
  },
];
export const GRENADE_PRICE = 300;
export const ARMOR_PRICE = 650;
export const AMMO_PRICE = 200;

export function createWeapons(camera, audio) {
  const gripMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.steel), roughness: 0.7, metalness: 0.25 });
  const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.45, metalness: 0.35 });
  const emberMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.4, metalness: 0.3 });

  function gunMesh(def) {
    const g = new THREE.Group();
    if (def.kind === 'pistol') {
      const slide = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.24), bodyMat);
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.13, 0.06), gripMat);
      grip.position.set(0, -0.07, 0.08);
      g.add(slide, grip);
    } else if (def.kind === 'shotgun') {
      const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.5), bodyMat);
      barrel.position.set(0, 0.02, -0.3);
      const pump = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.2), gripMat);
      pump.position.set(0, -0.02, -0.22);
      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.24), gripMat);
      stock.position.set(0, -0.01, 0.3);
      g.add(barrel, pump, stock);
    } else {
      const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.42), bodyMat);
      const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.42), gripMat);
      barrel.position.set(0, 0.025, -0.4);
      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.09), gripMat);
      mag.position.set(0, -0.11, -0.05);
      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.22), gripMat);
      stock.position.set(0, -0.02, 0.3);
      g.add(receiver, barrel, mag, stock);
    }
    g.scale.setScalar(0.75);
    g.position.set(0.26, -0.24, -0.5);
    g.visible = false;
    camera.add(g);
    return g;
  }

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.16, 0.16),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.ember), transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.26, -0.21, -0.88);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.ember), 0, 6);
  flashLight.position.set(0.26, -0.2, -0.65);
  camera.add(flashLight);

  const models = WEAPONS.map(gunMesh);
  const owned = [true, false, false];
  const mags = WEAPONS.map((w) => w.mag);
  const reserves = WEAPONS.map((w) => w.reserve);
  const state = {
    current: 0, cooldown: 0, reloadLeft: 0, flash: 0, kick: 0,
    bloom: 0, grenades: 0, prevFiring: false, throwCooldown: 0,
  };
  models[0].visible = true;

  function def() {
    return WEAPONS[state.current];
  }

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.throwCooldown = Math.max(0, state.throwCooldown - dt);
    state.bloom = Math.max(0, state.bloom - dt * 0.03);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    const model = models[state.current];
    model.position.z = -0.5 + state.kick;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      const d = def();
      model.rotation.x = -0.55 * Math.min(1, (d.reloadTime - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const need = d.mag - mags[state.current];
        const take = Math.min(need, reserves[state.current]);
        mags[state.current] += take;
        reserves[state.current] -= take;
      }
    }
  }

  return {
    state,
    defs: WEAPONS,
    owned,
    mags,
    reserves,
    step,
    currentDef: def,
    spread(speed, crouching, aiming) {
      const d = def();
      let s = d.spreadStill + Math.min(1, speed / 5.2) * d.spreadMove + state.bloom;
      if (crouching) s *= 0.65;
      if (aiming) s *= 0.55;
      return s;
    },
    ready() {
      return mags[state.current] > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    // Returns true when a shot should leave the barrel this step. Semi-auto
    // weapons fire only on the rising edge of the trigger.
    trigger(firing) {
      const d = def();
      const edge = firing && !state.prevFiring;
      state.prevFiring = firing;
      return d.auto ? firing : edge;
    },
    fire() {
      const d = def();
      if (mags[state.current] <= 0) {
        audio.dry();
        return false;
      }
      mags[state.current] -= 1;
      state.cooldown = d.gap;
      state.flash = 0.06;
      state.kick = 0.055;
      state.bloom = Math.min(0.02, state.bloom + 0.0035);
      audio.shot(d.kind);
      return true;
    },
    reload() {
      const d = def();
      if (state.reloadLeft > 0 || mags[state.current] === d.mag || reserves[state.current] === 0) return;
      state.reloadLeft = d.reloadTime;
      audio.reload();
    },
    equip(index) {
      if (!owned[index] || index === state.current) return false;
      models[state.current].visible = false;
      state.current = index;
      state.reloadLeft = 0;
      state.cooldown = 0.2;
      models[index].visible = true;
      return true;
    },
    buy(index, money) {
      const d = WEAPONS[index];
      if (owned[index] || money < d.price) return 0;
      owned[index] = true;
      return d.price;
    },
    buyGrenade(money) {
      if (state.grenades >= 2 || money < GRENADE_PRICE) return 0;
      state.grenades += 1;
      return GRENADE_PRICE;
    },
    buyAmmo(money) {
      const d = def();
      if (reserves[state.current] === d.reserve || money < AMMO_PRICE) return 0;
      reserves[state.current] = d.reserve;
      return AMMO_PRICE;
    },
    throwGrenade() {
      if (state.grenades <= 0 || state.throwCooldown > 0) return false;
      state.grenades -= 1;
      state.throwCooldown = 0.5;
      return true;
    },
    refill() {
      for (let i = 0; i < WEAPONS.length; i += 1) {
        mags[i] = WEAPONS[i].mag;
        reserves[i] = WEAPONS[i].reserve;
      }
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
      state.bloom = 0;
    },
    resetForRound() {
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.bloom = 0;
      state.prevFiring = false;
      if (!owned[state.current]) this.equip(0);
    },
  };
}
