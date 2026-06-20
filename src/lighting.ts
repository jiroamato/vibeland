// ---------------------------------------------------------------------------
// Skylight computation. There are no light-emitting blocks in scope, so the
// only light source is the sky. We do a column seed (sunlight straight down,
// attenuated by water/leaves) followed by a BFS flood so cliffs, overhangs and
// cave mouths receive soft, smoothly-falling-off light. Day/night dimming and
// the minimum ambient floor are applied later in the chunk shader.
// ---------------------------------------------------------------------------

import type { World } from './world';
import { Chunk } from './chunk';
import { Blocks, blockDef } from './blocks';
import { CHUNK_SX, CHUNK_SY, CHUNK_SZ, blockIndex } from './constants';

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

  const queue: number[] = [];
  let head = 0;

  // --- column seed: sunlight falling straight down ---
  for (let z = 0; z < CHUNK_SZ; z++) {
    for (let x = 0; x < CHUNK_SX; x++) {
      let level = 15;
      for (let y = CHUNK_SY - 1; y >= 0; y--) {
        const idx = blockIndex(x, y, z);
        const t = transmit(blocks[idx]);
        if (t.wall) level = 0;
        else level = Math.max(0, level - t.op);
        sky[idx] = level;
        if (level > 1) queue.push(idx);
      }
    }
  }

  // --- border seed: pull light in from already-lit neighbour chunks ---
  const baseX = chunk.cx * CHUNK_SX;
  const baseZ = chunk.cz * CHUNK_SZ;
  const seedBorder = (lx: number, lz: number, wx: number, wz: number) => {
    const nLitChunk = world.getChunk(
      Math.floor(wx / CHUNK_SX),
      Math.floor(wz / CHUNK_SZ),
    );
    if (!nLitChunk || !nLitChunk.lit) return;
    for (let y = 0; y < CHUNK_SY; y++) {
      const here = blockIndex(lx, y, lz);
      if (transmit(blocks[here]).wall) continue;
      const target = world.getSkylight(wx, y, wz) - 1;
      if (target > sky[here]) {
        sky[here] = target;
        queue.push(here);
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

  // --- BFS flood within the chunk ---
  while (head < queue.length) {
    const idx = queue[head++];
    const level = sky[idx];
    if (level <= 1) continue;
    // decode idx -> x,y,z   (idx = (y*SZ + z)*SX + x)
    const x = idx % CHUNK_SX;
    const z = ((idx / CHUNK_SX) | 0) % CHUNK_SZ;
    const y = (idx / (CHUNK_SX * CHUNK_SZ)) | 0;
    for (let d = 0; d < 6; d++) {
      const nx = x + DX[d];
      const ny = y + DY[d];
      const nz = z + DZ[d];
      if (ny < 0 || ny >= CHUNK_SY) continue;
      if (nx < 0 || nx >= CHUNK_SX || nz < 0 || nz >= CHUNK_SZ) continue; // borders owned by their chunk
      const nidx = blockIndex(nx, ny, nz);
      const t = transmit(blocks[nidx]);
      if (t.wall) continue;
      const target = level - Math.max(1, t.op);
      if (target > sky[nidx]) {
        sky[nidx] = target;
        queue.push(nidx);
      }
    }
  }

  chunk.lit = true;
}
