// Emberline Yard: an original dusk industrial yard, 40 x 30 m.
// Two bomb sites (A Furnace north-west, B Depot north-east), a central furnace
// block splitting mid into two lanes, and steel containers making the long
// sightlines. Everything is axis-aligned boxes, so collision is one AABB test.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const MAP = {
  bounds: { minX: -19.6, maxX: 19.6, minZ: -14.6, maxZ: 14.6 },
  sites: [
    { id: 'A', name: 'Furnace', x: -14, z: -10, r: 2.6 },
    { id: 'B', name: 'Depot', x: 14, z: -10, r: 2.6 },
  ],
  playerSpawn: { x: 0, z: 12.5, yaw: 0 },
  botSpawns: [
    { x: -2, z: -12.5 },
    { x: 2, z: -12.5 },
    { x: -14, z: -10 },
    { x: 14, z: -10 },
  ],
  // Patrol routes, walked ping-pong. Each route stays clear of the boxes below.
  routes: [
    [[0, -12.5], [0, -6], [-6, -4], [-10, -6], [-14, -10]],
    [[0, -12.5], [0, -6], [6, -4], [10, -6], [14, -10]],
    [[0, -12.5], [0, -6], [-4, 0], [0, 6], [4, 0], [0, -6]],
    [[-12, 6], [-12, -4], [-10, -6], [-14, -10], [-10, -6], [-6, -4], [0, -6], [6, -4], [10, -6], [14, -10]],
  ],
};

export function createMap(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ember' || name === 'site' ? 0.5 : 0.92,
      metalness: name === 'steel' ? 0.45 : 0.04,
      emissive: new THREE.Color(PALETTE[name]),
      emissiveIntensity: name === 'site' || name === 'ember' ? 0.55 : 0,
    });
  }
  const colliders = [];
  const shootables = [];

  function box(w, h, d, x, y, z, mat, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials[mat]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      shootables.push(mesh);
    }
    return mesh;
  }

  // Floor and outer walls.
  box(40.4, 0.4, 30.4, 0, -0.2, 0, 'ground');
  box(0.4, 5, 30.4, -20.2, 2.5, 0, 'wall');
  box(0.4, 5, 30.4, 20.2, 2.5, 0, 'wall');
  box(40.4, 5, 0.4, 0, 2.5, -15.2, 'wall');
  box(40.4, 5, 0.4, 0, 2.5, 15.2, 'wall');

  // Central furnace: the landmark that splits mid, with a glowing chimney.
  box(4, 3.4, 3, 0, 1.7, -2, 'wall');
  box(1.4, 5, 1.4, 0, 5.2, -2, 'crate');
  const glow = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 0.25, 1.5),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.ember) }),
  );
  glow.position.set(0, 7.8, -2);
  group.add(glow);

  // Steel containers guarding the north approaches; the gap between them is mid.
  box(6, 2.6, 2.4, -8, 1.3, -7, 'steel');
  box(6, 2.6, 2.4, 8, 1.3, -7, 'steel');

  // Crates: low cover to crouch behind, tall blocks to break sightlines.
  const crates = [
    [1.6, 1.1, 1.6, -12, 0.55, 4], [1.6, 1.1, 1.6, 12, 0.55, 4],
    [2.4, 1.1, 1.2, -6, 0.55, 8], [2.4, 1.1, 1.2, 6, 0.55, 8],
    [1.2, 1.6, 1.2, -14, 0.8, -4], [1.2, 1.6, 1.2, 14, 0.8, -4],
    [1.6, 1.1, 1.6, -10, 0.55, -11], [1.6, 1.1, 1.6, 10, 0.55, -11],
    [3, 1.1, 1.2, 0, 0.55, 10],
    [1.2, 2.2, 1.2, -3, 1.1, -9], [1.2, 2.2, 1.2, 3, 1.1, -9],
    [1.2, 1.1, 3.6, -17, 0.55, -7], [1.2, 1.1, 3.6, 17, 0.55, -7],
  ];
  for (const c of crates) box(c[0], c[1], c[2], c[3], c[4], c[5], 'crate');

  // A low steel platform mid-south: jump up for a sightline over the crates.
  box(4, 0.5, 2.5, 0, 0.25, 6, 'steel');

  // Barrels, approximated by their bounding box for collision.
  const barrels = [[-16, 2], [16, 2], [-4, -12], [4, -12], [-17, 10], [17, 10]];
  const barrelGeo = new THREE.CylinderGeometry(0.45, 0.45, 1.1, 12);
  for (const [x, z] of barrels) {
    const mesh = new THREE.Mesh(barrelGeo, materials.steel);
    mesh.position.set(x, 0.55, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3(new THREE.Vector3(x - 0.45, 0, z - 0.45), new THREE.Vector3(x + 0.45, 1.1, z + 0.45)));
    shootables.push(mesh);
  }

  // Bomb-site markers: a painted boundary outline on the floor, plus a
  // signpost with a glowing lamp, so the site reads without flooding the view.
  const markerMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PALETTE.site),
    roughness: 0.6,
    metalness: 0.05,
    emissive: new THREE.Color(PALETTE.site),
    emissiveIntensity: 0.35,
  });
  for (const site of MAP.sites) {
    const strips = [
      [5, 0.3, site.x, site.z - 2.35],
      [5, 0.3, site.x, site.z + 2.35],
      [0.3, 4.4, site.x - 2.35, site.z],
      [0.3, 4.4, site.x + 2.35, site.z],
    ];
    for (const [w, d, x, z] of strips) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, d), markerMat);
      strip.position.set(x, 0.02, z);
      strip.receiveShadow = true;
      group.add(strip);
    }
    // The signpost stands on the site's far corner, out of the approach lane.
    box(0.3, 3.2, 0.3, site.x - 2.2, 1.6, site.z - 2.2, 'steel');
    const lamp = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.5, 0.7),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.site) }),
    );
    lamp.position.set(site.x - 2.2, 3.4, site.z - 2.2);
    group.add(lamp);
  }

  // Light: a low ember sun from the south-east, a cool fill from the north,
  // and a warm sky gradient, so the yard reads as dusk.
  scene.add(new THREE.HemisphereLight(new THREE.Color('#ff9a5c'), new THREE.Color(PALETTE.ground), 2.6));
  scene.add(new THREE.AmbientLight(new THREE.Color('#ffb37a'), 0.35));
  const key = new THREE.DirectionalLight(new THREE.Color('#ffb37a'), 4.0);
  key.position.set(14, 18, 12);
  key.target.position.set(0, 0, -4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -26;
  key.shadow.camera.right = 26;
  key.shadow.camera.top = 26;
  key.shadow.camera.bottom = -26;
  key.shadow.camera.far = 60;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(new THREE.Color('#7a86a8'), 1.6);
  fill.position.set(-10, 12, -14);
  scene.add(fill);
  for (const site of MAP.sites) {
    const lamp = new THREE.PointLight(new THREE.Color(PALETTE.site), 14, 14, 1.6);
    lamp.position.set(site.x, 3.6, site.z);
    scene.add(lamp);
  }

  return { colliders, shootables, group, sites: MAP.sites };
}
