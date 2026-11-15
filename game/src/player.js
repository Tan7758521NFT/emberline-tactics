// The player body: acceleration-based movement, friction, gravity, crouch
// and jump, resolved as a box against the map's colliders one axis at a time,
// so a wall never swallows the player and a crate never traps them.
import * as THREE from 'three';

const RADIUS = 0.34;
const HEIGHT_STAND = 1.72;
const HEIGHT_CROUCH = 1.12;
const EYE_STAND = 1.6;
const EYE_CROUCH = 1.02;
const SPEED_WALK = 5.2;
const SPEED_CROUCH = 2.4;
const ACCEL_GROUND = 42;
const ACCEL_AIR = 9;
const FRICTION = 9;
const GRAVITY = 20;
const JUMP = 6.2;

export function createPlayer(colliders) {
  const body = {
    position: new THREE.Vector3(0, 0, 12.5),
    velocity: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    eye: EYE_STAND,
    height: HEIGHT_STAND,
    onGround: true,
    crouching: false,
    health: 100,
    armor: 0,
    alive: true,
  };
  const probe = new THREE.Box3();
  const wish = new THREE.Vector3();

  // The lift keeps the floor out of the horizontal tests, so standing on the
  // ground is never read as walking into a wall.
  function hits(x, y, z, height, lift) {
    probe.min.set(x - RADIUS, y + lift, z - RADIUS);
    probe.max.set(x + RADIUS, y + height - lift, z + RADIUS);
    for (const c of colliders) if (probe.intersectsBox(c)) return c;
    return null;
  }

  function look(dx, dy, sensitivity = 0.0022) {
    body.yaw -= dx * sensitivity;
    body.pitch = Math.max(-1.45, Math.min(1.45, body.pitch - dy * sensitivity));
  }

  function recoil(pitchKick, yawKick) {
    body.pitch = Math.min(1.45, body.pitch + pitchKick);
    body.yaw += yawKick;
  }

  function step(dt, keys) {
    const wantCrouch = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    if (wantCrouch && !body.crouching) {
      body.crouching = true;
      body.height = HEIGHT_CROUCH;
    } else if (!wantCrouch && body.crouching && !hits(body.position.x, body.position.y, body.position.z, HEIGHT_STAND, 0.02)) {
      body.crouching = false;
      body.height = HEIGHT_STAND;
    }
    const eyeTarget = body.crouching ? EYE_CROUCH : EYE_STAND;
    body.eye += (eyeTarget - body.eye) * Math.min(1, dt * 12);

    const fwd = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const side = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    wish.set(0, 0, 0);
    if (fwd || side) {
      const sin = Math.sin(body.yaw);
      const cos = Math.cos(body.yaw);
      wish.set(-sin * fwd + cos * side, 0, -cos * fwd - sin * side).normalize();
    }

    const speed = body.crouching ? SPEED_CROUCH : SPEED_WALK;
    const blend = Math.min(1, ((body.onGround ? ACCEL_GROUND : ACCEL_AIR) * dt) / speed);
    body.velocity.x += (wish.x * speed - body.velocity.x) * blend;
    body.velocity.z += (wish.z * speed - body.velocity.z) * blend;
    if (body.onGround && !wish.lengthSq()) {
      const damp = Math.max(0, 1 - FRICTION * dt);
      body.velocity.x *= damp;
      body.velocity.z *= damp;
    }

    if (keys.has('Space') && body.onGround) {
      body.velocity.y = JUMP;
      body.onGround = false;
    }
    body.velocity.y -= GRAVITY * dt;

    const nx = body.position.x + body.velocity.x * dt;
    if (!hits(nx, body.position.y, body.position.z, body.height, 0.04)) body.position.x = nx;
    else body.velocity.x = 0;
    const nz = body.position.z + body.velocity.z * dt;
    if (!hits(body.position.x, body.position.y, nz, body.height, 0.04)) body.position.z = nz;
    else body.velocity.z = 0;

    body.position.y += body.velocity.y * dt;
    body.onGround = false;
    const floor = hits(body.position.x, body.position.y, body.position.z, body.height, 0);
    if (floor && body.velocity.y <= 0) {
      body.position.y = floor.max.y;
      body.velocity.y = 0;
      body.onGround = true;
    } else if (floor) {
      body.position.y = floor.min.y - body.height;
      body.velocity.y = 0;
    }
    if (body.position.y < 0) {
      body.position.y = 0;
      body.velocity.y = 0;
      body.onGround = true;
    }
    body.velocity.y = Math.max(-30, body.velocity.y);
  }

  // Damage first eats armor (half of each hit while any is left), then health.
  function damage(amount) {
    let rest = amount;
    if (body.armor > 0) {
      const absorbed = Math.min(body.armor, rest * 0.5);
      body.armor -= absorbed;
      rest -= absorbed;
    }
    body.health -= rest;
    if (body.health <= 0) {
      body.health = 0;
      body.alive = false;
    }
    return body.alive;
  }

  return {
    state: body,
    step,
    look,
    recoil,
    damage,
    groundSpeed() {
      return Math.hypot(body.velocity.x, body.velocity.z);
    },
    reset(x, z, yaw) {
      body.position.set(x, 0, z);
      body.velocity.set(0, 0, 0);
      body.yaw = yaw;
      body.pitch = 0;
      body.eye = EYE_STAND;
      body.height = HEIGHT_STAND;
      body.crouching = false;
      body.health = 100;
      body.armor = 0;
      body.alive = true;
      body.onGround = true;
    },
  };
}
