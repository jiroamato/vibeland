// ---------------------------------------------------------------------------
// World: owns all chunks, generates terrain (plains & hills, water, beaches,
// ores, oak trees) and provides world-space block access across chunk borders.
// ---------------------------------------------------------------------------

import { Chunk } from './chunk';
import { Blocks, BlockId, blockDef } from './blocks';
import { SimplexNoise } from './noise';
import { computeSkylight } from './lighting';
import {
  CHUNK_SX,
  CHUNK_SY,
  CHUNK_SZ,
  SEA_LEVEL,
  blockIndex,
  chunkKey,
  floorDiv,
  mod,
} from './constants';

// Deterministic hash for tree placement (pure function of column + seed).
function hash2(x: number, z: number, seed: number): number {
  let h = (x * 374761393 + z * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

export class World {
  chunks = new Map<string, Chunk>();
  seed: number;
  private terrainNoise: SimplexNoise;
  private detailNoise: SimplexNoise;
  private oreNoise: SimplexNoise;

  constructor(seed = 1337) {
    this.seed = seed;
    this.terrainNoise = new SimplexNoise(seed);
    this.detailNoise = new SimplexNoise(seed ^ 0x9e37);
    this.oreNoise = new SimplexNoise(seed ^ 0x1234);
  }

  getChunk(cx: number, cz: number): Chunk | undefined {
    return this.chunks.get(chunkKey(cx, cz));
  }

  /** Get-or-create a chunk; generates terrain on first access. */
  ensureChunk(cx: number, cz: number): Chunk {
    const key = chunkKey(cx, cz);
    let c = this.chunks.get(key);
    if (!c) {
      c = new Chunk(cx, cz);
      this.chunks.set(key, c);
      this.generateChunk(c);
    }
    return c;
  }

  // --- world-space block access ---------------------------------------------

  getBlock(wx: number, wy: number, wz: number): BlockId {
    if (wy < 0 || wy >= CHUNK_SY) return 0;
    const c = this.getChunk(floorDiv(wx, CHUNK_SX), floorDiv(wz, CHUNK_SZ));
    if (!c) return 0;
    return c.blocks[blockIndex(mod(wx, CHUNK_SX), wy, mod(wz, CHUNK_SZ))];
  }

  getSkylight(wx: number, wy: number, wz: number): number {
    if (wy < 0) return 0;
    if (wy >= CHUNK_SY) return 15;
    const c = this.getChunk(floorDiv(wx, CHUNK_SX), floorDiv(wz, CHUNK_SZ));
    if (!c) return 15;
    return c.skylight[blockIndex(mod(wx, CHUNK_SX), wy, mod(wz, CHUNK_SZ))];
  }

  /** Place/replace a block from gameplay; relights and dirties affected chunks. */
  setBlock(wx: number, wy: number, wz: number, id: BlockId): void {
    if (wy < 0 || wy >= CHUNK_SY) return;
    const cx = floorDiv(wx, CHUNK_SX);
    const cz = floorDiv(wz, CHUNK_SZ);
    const c = this.getChunk(cx, cz);
    if (!c) return;
    const lx = mod(wx, CHUNK_SX);
    const lz = mod(wz, CHUNK_SZ);
    c.blocks[blockIndex(lx, wy, lz)] = id;
    c.recomputeHeightMap();

    // Relight this chunk + horizontal neighbours. Each computeSkylight pass is a
    // single inward flood, so we iterate twice to let light converge across the
    // shared borders (chunk -> neighbour -> chunk) before re-meshing.
    const neighbours = [
      c,
      this.getChunk(cx - 1, cz),
      this.getChunk(cx + 1, cz),
      this.getChunk(cx, cz - 1),
      this.getChunk(cx, cz + 1),
    ].filter((n): n is Chunk => !!n);
    for (let pass = 0; pass < 2; pass++) {
      for (const n of neighbours) computeSkylight(this, n);
    }
    for (const n of neighbours) n.meshDirty = true;
    // Also dirty diagonal neighbours if the edit touched a corner, so AO updates.
    if (lx === 0 || lx === CHUNK_SX - 1 || lz === 0 || lz === CHUNK_SZ - 1) {
      const dx = lx === 0 ? -1 : lx === CHUNK_SX - 1 ? 1 : 0;
      const dz = lz === 0 ? -1 : lz === CHUNK_SZ - 1 ? 1 : 0;
      if (dx && dz) {
        const d = this.getChunk(cx + dx, cz + dz);
        if (d) d.meshDirty = true;
      }
    }
  }

  // --- terrain generation ----------------------------------------------------

  private columnHeight(wx: number, wz: number): number {
    const continent = this.terrainNoise.fbm2D(wx * 0.0035, wz * 0.0035, 4);
    const hills = this.detailNoise.fbm2D(wx * 0.013, wz * 0.013, 4);
    const ridges = this.detailNoise.fbm2D(wx * 0.05, wz * 0.05, 2) * 0.5;
    const h = SEA_LEVEL + 3 + continent * 11 + hills * 7 + ridges * 3;
    return Math.max(1, Math.min(CHUNK_SY - 30, Math.round(h)));
  }

  private generateChunk(c: Chunk): void {
    const baseX = c.cx * CHUNK_SX;
    const baseZ = c.cz * CHUNK_SZ;

    for (let lz = 0; lz < CHUNK_SZ; lz++) {
      for (let lx = 0; lx < CHUNK_SX; lx++) {
        const wx = baseX + lx;
        const wz = baseZ + lz;
        const h = this.columnHeight(wx, wz);
        const underwater = h - 1 < SEA_LEVEL;
        const beach = h - 1 <= SEA_LEVEL + 1;

        for (let y = 0; y <= h - 1; y++) {
          let id: BlockId;
          if (y === 0) {
            id = Blocks.BEDROCK;
          } else if (y <= 2 && hash2(wx * 7 + y, wz * 13, this.seed) < 0.5) {
            id = Blocks.BEDROCK; // ragged bedrock floor
          } else if (y < h - 4) {
            id = Blocks.STONE;
            // ore pockets
            const coal = this.oreNoise.noise3D(wx * 0.12, y * 0.12, wz * 0.12);
            const iron = this.oreNoise.noise3D((wx + 80) * 0.14, (y + 40) * 0.14, (wz - 60) * 0.14);
            if (y < 46 && iron > 0.86) id = Blocks.IRON_ORE;
            else if (coal > 0.84) id = Blocks.COAL_ORE;
          } else if (y < h - 1) {
            id = beach ? Blocks.SAND : Blocks.DIRT;
          } else {
            // top block
            if (underwater) id = Blocks.SAND;
            else if (beach) id = Blocks.SAND;
            else id = Blocks.GRASS;
          }
          c.blocks[blockIndex(lx, y, lz)] = id;
        }

        // water fills from the surface up to sea level
        for (let y = h; y <= SEA_LEVEL; y++) {
          c.blocks[blockIndex(lx, y, lz)] = Blocks.WATER;
        }
      }
    }

    // Trees: deterministic, computed from a 2-block margin so canopies that
    // straddle the border are stamped identically by each chunk (no cross-chunk
    // writes, order-independent).
    this.populateTrees(c);

    c.recomputeHeightMap();
    c.generated = true;
    c.populated = true;
  }

  private populateTrees(c: Chunk): void {
    const baseX = c.cx * CHUNK_SX;
    const baseZ = c.cz * CHUNK_SZ;
    for (let mz = -2; mz < CHUNK_SZ + 2; mz++) {
      for (let mx = -2; mx < CHUNK_SX + 2; mx++) {
        const wx = baseX + mx;
        const wz = baseZ + mz;
        if (hash2(wx, wz, this.seed ^ 0x7ee) >= 0.018) continue;
        const h = this.columnHeight(wx, wz);
        if (h - 1 <= SEA_LEVEL + 1) continue; // no trees in water/beach
        // confirm surface is grass-worthy land
        const trunkH = 4 + Math.floor(hash2(wx, wz, this.seed ^ 0x55) * 3); // 4..6
        this.stampTree(c, wx, wz, h, trunkH);
      }
    }
  }

  // Writes only the parts of the tree that fall inside chunk c.
  private stampTree(c: Chunk, wx: number, wz: number, surfaceY: number, trunkH: number): void {
    const baseX = c.cx * CHUNK_SX;
    const baseZ = c.cz * CHUNK_SZ;
    const setLocal = (gx: number, gy: number, gz: number, id: BlockId, overwrite: boolean) => {
      const lx = gx - baseX;
      const lz = gz - baseZ;
      if (lx < 0 || lx >= CHUNK_SX || lz < 0 || lz >= CHUNK_SZ) return;
      if (gy < 0 || gy >= CHUNK_SY) return;
      const idx = blockIndex(lx, gy, lz);
      if (!overwrite && c.blocks[idx] !== Blocks.AIR) return;
      c.blocks[idx] = id;
    };

    const topLog = surfaceY + trunkH - 1;
    // canopy: two wide layers, then two narrow layers
    for (let ly = topLog - 2; ly <= topLog + 1; ly++) {
      const radius = ly <= topLog - 1 ? 2 : 1;
      for (let dz = -radius; dz <= radius; dz++) {
        for (let dx = -radius; dx <= radius; dx++) {
          // trim the corners of the wide layers for a rounder look
          if (radius === 2 && Math.abs(dx) === 2 && Math.abs(dz) === 2) {
            if (hash2(wx + dx, wz + dz + ly, this.seed) < 0.6) continue;
          }
          setLocal(wx + dx, ly, wz + dz, Blocks.OAK_LEAVES, false);
        }
      }
    }
    // trunk overwrites leaves
    for (let i = 0; i < trunkH; i++) setLocal(wx, surfaceY + i, wz, Blocks.OAK_LOG, true);
  }

  /** Topmost solid (non-air, non-water) block height at a column, for spawning. */
  highestSolid(wx: number, wz: number): number {
    const c = this.ensureChunk(floorDiv(wx, CHUNK_SX), floorDiv(wz, CHUNK_SZ));
    const lx = mod(wx, CHUNK_SX);
    const lz = mod(wz, CHUNK_SZ);
    for (let y = CHUNK_SY - 1; y >= 0; y--) {
      const id = c.blocks[blockIndex(lx, y, lz)];
      if (id !== Blocks.AIR && !blockDef(id).liquid) return y;
    }
    return SEA_LEVEL;
  }
}
