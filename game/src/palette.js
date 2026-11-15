// Emberline Tactics: the look plan in one place.
// A dusk industrial yard: warm ember orange against cold slate, so the two teams,
// the bomb sites and the HUD all read at a glance. The same names are the CSS
// custom properties in index.html; no other colour appears in the code.
export const PALETTE = {
  canvas: '#4a3423', // sky / fog
  ground: '#453a2c', // yard floor
  wall: '#584a38', // outer walls and big blocks
  crate: '#6a573c', // crates and cover
  steel: '#75695c', // containers and pipes
  ink: '#f2e8d8', // light text and the player's team
  muted: '#8a7f6d', // dim text and distant detail
  accent: '#ff7a1a', // ember orange: player team, tracers, HUD accents
  ember: '#ffb347', // hot metal, muzzle flash, site glow
  enemy: '#c23b2e', // Ashfall crew: red, never used for anything friendly
  site: '#ffd23e', // bomb-site floor markers
  health: '#7ec850', // health bar
};

export function hex(name) {
  return PALETTE[name];
}
