// ---------------------------------------------------------------------------
// Shared swept-AABB voxel collision, extracted from Player so item entities
// (and future mobs) resolve against the world the same way. pos is the AABB's
// bottom-centre; each call moves ONE axis and snaps against the nearest
// blocking face in the direction of travel (see player.ts for the original
// derivation and the corner-catch rationale).
// ---------------------------------------------------------------------------

import * as THREE from 'three';

const EPS = 1e-3;

export type SolidAt = (x: number, y: number, z: number) => boolean;

export interface Box {
  half: number; // x/z half-extent
  height: number; // y extent above pos
}

/** Move pos on one axis and resolve; zeroes vel[axis] and returns true on hit. */
export function collideAxis(
  solidAt: SolidAt,
  pos: THREE.Vector3,
  vel: THREE.Vector3,
  box: Box,
  axis: 'x' | 'y' | 'z',
  amount: number,
): boolean {
  if (amount === 0) return false;
  const before = pos[axis];
  pos[axis] += amount;

  const lowExt = axis === 'y' ? 0 : box.half;
  const highExt = axis === 'y' ? box.height : box.half;
  const lead = amount > 0 ? before + highExt : before - lowExt;

  const x0 = Math.floor(pos.x - box.half),
    x1 = Math.floor(pos.x + box.half - 1e-9);
  const y0 = Math.floor(pos.y),
    y1 = Math.floor(pos.y + box.height - 1e-9);
  const z0 = Math.floor(pos.z - box.half),
    z1 = Math.floor(pos.z + box.half - 1e-9);

  let hit = false;
  let bound = 0;
  for (let bx = x0; bx <= x1; bx++)
    for (let by = y0; by <= y1; by++)
      for (let bz = z0; bz <= z1; bz++) {
        if (!solidAt(bx + 0.5, by + 0.5, bz + 0.5)) continue;
        const coord = axis === 'x' ? bx : axis === 'y' ? by : bz;
        if (amount > 0 ? coord < lead - EPS : coord + 1 > lead + EPS) continue;
        if (!hit) {
          hit = true;
          bound = coord;
        } else {
          bound = amount > 0 ? Math.min(bound, coord) : Math.max(bound, coord);
        }
      }
  if (!hit) return false;

  pos[axis] = amount > 0 ? bound - highExt - EPS : bound + 1 + lowExt + EPS;
  vel[axis] = 0;
  return true;
}
