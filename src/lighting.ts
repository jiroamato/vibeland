// ---------------------------------------------------------------------------
// Skylight computation. There are no light-emitting blocks in scope, so the
// only light source is the sky. We do a column seed (sunlight straight down,
// attenuated by water/leaves) followed by a BFS flood so cliffs, overhangs and
// cave mouths receive soft, smoothly-falling-off light.
//
// The flood runs in world space: it propagates within this chunk AND across
// borders INTO already-lit neighbours (raising their border light and flagging
// them for re-mesh). That keeps skylight symmetric across the chunk grid — a
// chunk lit before its neighbour still gets that neighbour's flood once the
// neighbour lights — without ever re-lighting a whole chunk (which previously
// starved the mesh gate). Day/night dimming + the ambient floor are applied in
// the chunk shader.
// ---------------------------------------------------------------------------

import type { World } from './world';
import { Chunk } from './chunk';
import { Blocks, blockDef } from './blocks';
import { CHUNK_SX, CHUNK_SY, CHUNK_SZ, blockIndex, floorDiv, mod } from './constants';

interface Transmit {
  wall: boolean;
  op: number;
}

function transmit(id: number): Transmit {
  if (id === Blocks.AIR || id === Blocks.GLASS) return { wall: false, op: 0 };
  if (id === Blocks.WATER || id === Blocks.OAK_LEAVES) return { wall: false, op: 1 };
  if (blockDef(id).opaque) return { wall: true, op: 15 };
  return { wall: false, op: 0 };
}

const DX = [1, -1, 0, 0, 0, 0];
const DY = [0, 0, 1, -1, 0, 0];
const DZ = [0, 0, 0, 0, 1, -1];

export function computeSkylight(world: World, chunk: Chunk): void {
  const sky = chunk.skylight;
  const blocks = chunk.blocks;
  sky.fill(0);

  const baseX = chunk.cx * CHUNK_SX;
  const baseZ = chunk.cz * CHUNK_SZ;

  // Cache the 3x3 neighbourhood: the flood only spills one chunk deep (light is
  // capped at 15 < chunk width 16), so this fully covers cross-border writes.
  const neigh: (Chunk | undefined)[] = [];
  for (let dz = -1; dz <= 1; dz++)
    for (let dx = -1; dx <= 1; dx++) neigh[(dz + 1) * 3 + (dx + 1)] = world.getChunk(chunk.cx + dx, chunk.cz + dz);
  const chunkAt = (cx: number, cz: number): Chunk | undefined => {
    const ddx = cx - chunk.cx;
    const ddz = cz - chunk.cz;
    if (ddx < -1 || ddx > 1 || ddz < -1 || ddz > 1) return undefined;
    return neigh[(ddz + 1) * 3 + (ddx + 1)];
  };

  // world-coordinate BFS queue
  const qx: number[] = [];
  const qy: number[] = [];
  const qz: number[] = [];
  let head = 0;
  const push = (wx: number, wy: number, wz: number) => {
    qx.push(wx);
    qy.push(wy);
    qz.push(wz);
  };

  // --- column seed: sunlight falling straight down (this chunk) ---
  for (let z = 0; z < CHUNK_SZ; z++) {
    for (let x = 0; x < CHUNK_SX; x++) {
      let level = 15;
      for (let y = CHUNK_SY - 1; y >= 0; y--) {
        const idx = blockIndex(x, y, z);
        const t = transmit(blocks[idx]);
        if (t.wall) level = 0;
        else level = Math.max(0, level - t.op);
        sky[idx] = level;
        if (level > 1) push(baseX + x, y, baseZ + z);
      }
    }
  }

  // --- border seed: pull light in from already-lit neighbours ---
  const seedBorder = (lx: number, lz: number, wx: number, wz: number) => {
    const nc = world.getChunk(floorDiv(wx, CHUNK_SX), floorDiv(wz, CHUNK_SZ));
    if (!nc || !nc.lit) return;
    for (let y = 0; y < CHUNK_SY; y++) {
      const here = blockIndex(lx, y, lz);
      if (transmit(blocks[here]).wall) continue;
      const target = world.getSkylight(wx, y, wz) - 1;
      if (target > sky[here]) {
        sky[here] = target;
        if (target > 1) push(baseX + lx, y, baseZ + lz); // level<=1 can't propagate
      }
    }
  };
  for (let z = 0; z < CHUNK_SZ; z++) {
    seedBorder(0, z, baseX - 1, baseZ + z);
    seedBorder(CHUNK_SX - 1, z, baseX + CHUNK_SX, baseZ + z);
  }
  for (let x = 0; x < CHUNK_SX; x++) {
    seedBorder(x, 0, baseX + x, baseZ - 1);
    seedBorder(x, CHUNK_SZ - 1, baseX + x, baseZ + CHUNK_SZ);
  }

  // --- BFS flood (world space; spills into already-lit neighbours) ---
  while (head < qx.length) {
    // reclaim consumed slots so peak memory doesn't scale with total enqueues
    if (head >= 1 << 14 && head * 2 >= qx.length) {
      qx.splice(0, head);
      qy.splice(0, head);
      qz.splice(0, head);
      head = 0;
    }
    const wx = qx[head];
    const wy = qy[head];
    const wz = qz[head];
    head++;
    const own = chunkAt(floorDiv(wx, CHUNK_SX), floorDiv(wz, CHUNK_SZ));
    if (!own) continue;
    const level = own.skylight[blockIndex(mod(wx, CHUNK_SX), wy, mod(wz, CHUNK_SZ))];
    if (level <= 1) continue;
    for (let d = 0; d < 6; d++) {
      const nwx = wx + DX[d];
      const nwy = wy + DY[d];
      const nwz = wz + DZ[d];
      if (nwy < 0 || nwy >= CHUNK_SY) continue;
      const nc = chunkAt(floorDiv(nwx, CHUNK_SX), floorDiv(nwz, CHUNK_SZ));
      if (!nc || !nc.generated) continue;
      // propagate within this chunk, or into an already-lit neighbour (pending
      // neighbours compute their own light and pull from us via the border seed)
      const isSelf = nc === chunk;
      if (!isSelf && !nc.lit) continue;
      const nidx = blockIndex(mod(nwx, CHUNK_SX), nwy, mod(nwz, CHUNK_SZ));
      const t = transmit(nc.blocks[nidx]);
      if (t.wall) continue;
      const target = level - Math.max(1, t.op);
      if (target > nc.skylight[nidx]) {
        nc.skylight[nidx] = target;
        if (!isSelf) nc.meshDirty = true; // neighbour's light improved -> re-mesh
        if (target > 1) push(nwx, nwy, nwz); // level<=1 can't propagate
      }
    }
  }

  chunk.lit = true;
}
