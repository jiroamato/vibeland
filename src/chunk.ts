// ---------------------------------------------------------------------------
// Chunk: a 16x128x16 column of blocks plus a parallel skylight array and a
// reference to its rendered meshes. Pure data + accessors; terrain generation
// lives in world.ts and meshing in mesher.ts.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { CHUNK_SX, CHUNK_SY, CHUNK_SZ, CHUNK_VOL, blockIndex } from './constants';
import { BlockId } from './blocks';

export class Chunk {
  cx: number;
  cz: number;
  blocks: Uint8Array;
  /** Skylight level 0..15 per block (computed by lighting.ts). */
  skylight: Uint8Array;

  generated = false;
  /** Terrain + features placed; light not necessarily computed yet. */
  populated = false;
  lit = false;
  /** Mesh is current; cleared when the chunk or a neighbour changes. */
  meshDirty = true;

  // Rendered meshes (one per render layer); created/owned by the mesher.
  meshes: (THREE.Mesh | null)[] = [null, null, null];

  // Highest non-air block per column, kept for fast skylight seeding.
  heightMap: Int16Array;

  constructor(cx: number, cz: number) {
    this.cx = cx;
    this.cz = cz;
    this.blocks = new Uint8Array(CHUNK_VOL);
    this.skylight = new Uint8Array(CHUNK_VOL);
    this.heightMap = new Int16Array(CHUNK_SX * CHUNK_SZ);
  }

  get(x: number, y: number, z: number): BlockId {
    if (y < 0 || y >= CHUNK_SY) return 0;
    return this.blocks[blockIndex(x, y, z)];
  }

  set(x: number, y: number, z: number, id: BlockId): void {
    if (y < 0 || y >= CHUNK_SY) return;
    this.blocks[blockIndex(x, y, z)] = id;
  }

  getLight(x: number, y: number, z: number): number {
    if (y < 0) return 0;
    if (y >= CHUNK_SY) return 15;
    return this.skylight[blockIndex(x, y, z)];
  }

  /** Recompute the height map for a single column (after one block edit). */
  updateColumnHeight(x: number, z: number): void {
    let h = 0;
    for (let y = CHUNK_SY - 1; y >= 0; y--) {
      if (this.blocks[blockIndex(x, y, z)] !== 0) {
        h = y + 1;
        break;
      }
    }
    this.heightMap[z * CHUNK_SX + x] = h;
  }

  /** Recompute the per-column height map (index of highest non-air block + 1). */
  recomputeHeightMap(): void {
    for (let z = 0; z < CHUNK_SZ; z++) {
      for (let x = 0; x < CHUNK_SX; x++) {
        let h = 0;
        for (let y = CHUNK_SY - 1; y >= 0; y--) {
          if (this.blocks[blockIndex(x, y, z)] !== 0) {
            h = y + 1;
            break;
          }
        }
        this.heightMap[z * CHUNK_SX + x] = h;
      }
    }
  }
}
