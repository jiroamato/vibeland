// ---------------------------------------------------------------------------
// Chunk mesher: face-culled, with smooth lighting + ambient occlusion baked
// into a per-vertex (shade, skylight) attribute. Produces one BufferGeometry
// per render layer (opaque / cutout / translucent).
//
// Per-face shading matches Minecraft: top 100%, N/S 80%, E/W 60%, bottom 50%.
// AO darkens corners where neighbouring blocks meet (classic 0fps algorithm).
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import type { World } from './world';
import { Chunk } from './chunk';
import { blockDef, RenderLayer } from './blocks';
import { CHUNK_SX, CHUNK_SY, CHUNK_SZ, blockIndex } from './constants';
import { tileUV } from './textures';

type V3 = [number, number, number];

interface FaceVert {
  pos: V3; // unit-cube corner of this vertex
  uv: [number, number]; // 0 -> u0/v0(top), 1 -> u1/v1(bottom)
  ao: [V3, V3, V3]; // side1, side2, corner neighbour offsets
}

interface Face {
  faceIndex: number; // index into blockDef.faces ([+x,-x,+y,-y,+z,-z])
  normal: V3;
  shade: number;
  verts: [FaceVert, FaceVert, FaceVert, FaceVert];
}

// UV pattern shared by all four side faces: c0..c3 => bottom-left, top-left,
// top-right, bottom-right (in tile space; top == v0).
const SIDE_UV: [number, number][] = [
  [0, 1],
  [0, 0],
  [1, 0],
  [1, 1],
];

const FACES: Face[] = [
  // +X (east) — 60%
  {
    faceIndex: 0,
    normal: [1, 0, 0],
    shade: 0.6,
    verts: [
      { pos: [1, 0, 0], uv: SIDE_UV[0], ao: [[1, -1, 0], [1, 0, -1], [1, -1, -1]] },
      { pos: [1, 1, 0], uv: SIDE_UV[1], ao: [[1, 1, 0], [1, 0, -1], [1, 1, -1]] },
      { pos: [1, 1, 1], uv: SIDE_UV[2], ao: [[1, 1, 0], [1, 0, 1], [1, 1, 1]] },
      { pos: [1, 0, 1], uv: SIDE_UV[3], ao: [[1, -1, 0], [1, 0, 1], [1, -1, 1]] },
    ],
  },
  // -X (west) — 60%
  {
    faceIndex: 1,
    normal: [-1, 0, 0],
    shade: 0.6,
    verts: [
      { pos: [0, 0, 1], uv: SIDE_UV[0], ao: [[-1, -1, 0], [-1, 0, 1], [-1, -1, 1]] },
      { pos: [0, 1, 1], uv: SIDE_UV[1], ao: [[-1, 1, 0], [-1, 0, 1], [-1, 1, 1]] },
      { pos: [0, 1, 0], uv: SIDE_UV[2], ao: [[-1, 1, 0], [-1, 0, -1], [-1, 1, -1]] },
      { pos: [0, 0, 0], uv: SIDE_UV[3], ao: [[-1, -1, 0], [-1, 0, -1], [-1, -1, -1]] },
    ],
  },
  // +Y (top) — 100%
  {
    faceIndex: 2,
    normal: [0, 1, 0],
    shade: 1.0,
    verts: [
      { pos: [0, 1, 0], uv: [0, 0], ao: [[-1, 1, 0], [0, 1, -1], [-1, 1, -1]] },
      { pos: [0, 1, 1], uv: [0, 1], ao: [[-1, 1, 0], [0, 1, 1], [-1, 1, 1]] },
      { pos: [1, 1, 1], uv: [1, 1], ao: [[1, 1, 0], [0, 1, 1], [1, 1, 1]] },
      { pos: [1, 1, 0], uv: [1, 0], ao: [[1, 1, 0], [0, 1, -1], [1, 1, -1]] },
    ],
  },
  // -Y (bottom) — 50%
  {
    faceIndex: 3,
    normal: [0, -1, 0],
    shade: 0.5,
    verts: [
      { pos: [0, 0, 0], uv: [0, 0], ao: [[-1, -1, 0], [0, -1, -1], [-1, -1, -1]] },
      { pos: [1, 0, 0], uv: [1, 0], ao: [[1, -1, 0], [0, -1, -1], [1, -1, -1]] },
      { pos: [1, 0, 1], uv: [1, 1], ao: [[1, -1, 0], [0, -1, 1], [1, -1, 1]] },
      { pos: [0, 0, 1], uv: [0, 1], ao: [[-1, -1, 0], [0, -1, 1], [-1, -1, 1]] },
    ],
  },
  // +Z (south) — 80%
  {
    faceIndex: 4,
    normal: [0, 0, 1],
    shade: 0.8,
    verts: [
      { pos: [1, 0, 1], uv: SIDE_UV[0], ao: [[1, 0, 1], [0, -1, 1], [1, -1, 1]] },
      { pos: [1, 1, 1], uv: SIDE_UV[1], ao: [[1, 0, 1], [0, 1, 1], [1, 1, 1]] },
      { pos: [0, 1, 1], uv: SIDE_UV[2], ao: [[-1, 0, 1], [0, 1, 1], [-1, 1, 1]] },
      { pos: [0, 0, 1], uv: SIDE_UV[3], ao: [[-1, 0, 1], [0, -1, 1], [-1, -1, 1]] },
    ],
  },
  // -Z (north) — 80%
  {
    faceIndex: 5,
    normal: [0, 0, -1],
    shade: 0.8,
    verts: [
      { pos: [0, 0, 0], uv: SIDE_UV[0], ao: [[-1, 0, -1], [0, -1, -1], [-1, -1, -1]] },
      { pos: [0, 1, 0], uv: SIDE_UV[1], ao: [[-1, 0, -1], [0, 1, -1], [-1, 1, -1]] },
      { pos: [1, 1, 0], uv: SIDE_UV[2], ao: [[1, 0, -1], [0, 1, -1], [1, 1, -1]] },
      { pos: [1, 0, 0], uv: SIDE_UV[3], ao: [[1, 0, -1], [0, -1, -1], [1, -1, -1]] },
    ],
  },
];

const AO_BRIGHT = [0.5, 0.7, 0.85, 1.0]; // ao level 0..3 -> multiplier

// Scratch builders, one per render layer, reused between chunks.
class Builder {
  pos: number[] = [];
  uv: number[] = [];
  light: number[] = [];
  idx: number[] = [];
  count = 0;
  reset() {
    this.pos.length = 0;
    this.uv.length = 0;
    this.light.length = 0;
    this.idx.length = 0;
    this.count = 0;
  }
  build(): THREE.BufferGeometry | null {
    if (this.count === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aLight', new THREE.Float32BufferAttribute(this.light, 2));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

const builders: Builder[] = [new Builder(), new Builder(), new Builder()];

export interface ChunkGeometry {
  geom: (THREE.BufferGeometry | null)[]; // indexed by RenderLayer
}

export function buildChunkGeometry(world: World, chunk: Chunk): ChunkGeometry {
  for (const b of builders) b.reset();

  // cache the 3x3 neighbourhood of chunks for fast border sampling
  const neigh: (Chunk | undefined)[] = [];
  for (let dz = -1; dz <= 1; dz++)
    for (let dx = -1; dx <= 1; dx++) neigh[(dz + 1) * 3 + (dx + 1)] = world.getChunk(chunk.cx + dx, chunk.cz + dz);

  const getBlock = (lx: number, ly: number, lz: number): number => {
    if (ly < 0 || ly >= CHUNK_SY) return 0;
    let cdx = 0,
      cdz = 0,
      bx = lx,
      bz = lz;
    if (lx < 0) {
      cdx = -1;
      bx = lx + CHUNK_SX;
    } else if (lx >= CHUNK_SX) {
      cdx = 1;
      bx = lx - CHUNK_SX;
    }
    if (lz < 0) {
      cdz = -1;
      bz = lz + CHUNK_SZ;
    } else if (lz >= CHUNK_SZ) {
      cdz = 1;
      bz = lz - CHUNK_SZ;
    }
    const ch = neigh[(cdz + 1) * 3 + (cdx + 1)];
    if (!ch) return 0;
    return ch.blocks[blockIndex(bx, ly, bz)];
  };

  const getSky = (lx: number, ly: number, lz: number): number => {
    if (ly < 0) return 0;
    if (ly >= CHUNK_SY) return 15;
    let cdx = 0,
      cdz = 0,
      bx = lx,
      bz = lz;
    if (lx < 0) {
      cdx = -1;
      bx = lx + CHUNK_SX;
    } else if (lx >= CHUNK_SX) {
      cdx = 1;
      bx = lx - CHUNK_SX;
    }
    if (lz < 0) {
      cdz = -1;
      bz = lz + CHUNK_SZ;
    } else if (lz >= CHUNK_SZ) {
      cdz = 1;
      bz = lz - CHUNK_SZ;
    }
    const ch = neigh[(cdz + 1) * 3 + (cdx + 1)];
    if (!ch) return 15;
    return ch.skylight[blockIndex(bx, ly, bz)];
  };

  for (let y = 0; y < CHUNK_SY; y++) {
    for (let z = 0; z < CHUNK_SZ; z++) {
      for (let x = 0; x < CHUNK_SX; x++) {
        const id = chunk.blocks[blockIndex(x, y, z)];
        if (id === 0) continue;
        const def = blockDef(id);
        const builder = builders[def.layer];

        for (let f = 0; f < 6; f++) {
          const face = FACES[f];
          const nx = x + face.normal[0];
          const ny = y + face.normal[1];
          const nz = z + face.normal[2];
          const nb = getBlock(nx, ny, nz);
          const nd = blockDef(nb);
          // cull rule
          if (nd.opaque) continue;
          if (nb === id && def.selfCull) continue;

          const [u0, v0, u1, v1] = tileUV(def.faces[face.faceIndex]);
          const aoLevels: number[] = [];
          const lightVals: number[] = [];

          for (let vi = 0; vi < 4; vi++) {
            const vert = face.verts[vi];
            const s1 = vert.ao[0];
            const s2 = vert.ao[1];
            const co = vert.ao[2];
            const o1 = blockDef(getBlock(x + s1[0], y + s1[1], z + s1[2])).opaque ? 1 : 0;
            const o2 = blockDef(getBlock(x + s2[0], y + s2[1], z + s2[2])).opaque ? 1 : 0;
            const oc = blockDef(getBlock(x + co[0], y + co[1], z + co[2])).opaque ? 1 : 0;
            const aoLevel = o1 && o2 ? 0 : 3 - (o1 + o2 + oc);
            aoLevels.push(aoLevel);

            // smooth skylight: average the face neighbour + the 3 AO cells,
            // skipping fully opaque cells.
            let sum = getSky(nx, ny, nz);
            let cnt = 1;
            if (!o1) {
              sum += getSky(x + s1[0], y + s1[1], z + s1[2]);
              cnt++;
            }
            if (!o2) {
              sum += getSky(x + s2[0], y + s2[1], z + s2[2]);
              cnt++;
            }
            if (!oc) {
              sum += getSky(x + co[0], y + co[1], z + co[2]);
              cnt++;
            }
            lightVals.push(sum / cnt / 15);
          }

          const base = builder.count;
          for (let vi = 0; vi < 4; vi++) {
            const vert = face.verts[vi];
            builder.pos.push(x + vert.pos[0], y + vert.pos[1], z + vert.pos[2]);
            builder.uv.push(vert.uv[0] === 0 ? u0 : u1, vert.uv[1] === 0 ? v0 : v1);
            const shade = face.shade * AO_BRIGHT[aoLevels[vi]];
            builder.light.push(shade, lightVals[vi]);
          }
          // flip triangulation to avoid AO interpolation artifacts
          if (aoLevels[0] + aoLevels[2] > aoLevels[1] + aoLevels[3]) {
            builder.idx.push(base + 1, base + 2, base + 3, base + 1, base + 3, base + 0);
          } else {
            builder.idx.push(base + 0, base + 1, base + 2, base + 0, base + 2, base + 3);
          }
          builder.count += 4;
        }
      }
    }
  }

  return {
    geom: [builders[RenderLayer.Opaque].build(), builders[RenderLayer.Cutout].build(), builders[RenderLayer.Translucent].build()],
  };
}
