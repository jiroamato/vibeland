// ---------------------------------------------------------------------------
// Chunk streaming: keeps chunks generated / lit / meshed around the player out
// to the render distance, with a per-frame time budget so streaming never
// stalls the frame, and unloads chunks that fall outside the keep radius.
//
// Dependency order (nearest-first spiral):
//   generate (RD+1)  ->  light (RD+1)  ->  mesh (RD, needs 8 lit neighbours)
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { World } from './world';
import { Chunk } from './chunk';
import { computeSkylight } from './lighting';
import { buildChunkGeometry } from './mesher';
import { ChunkMaterials } from './chunkMaterial';
import { CHUNK_SX, CHUNK_SZ, RENDER_DISTANCE } from './constants';

const GEN_RADIUS = RENDER_DISTANCE + 1;
const LIGHT_RADIUS = RENDER_DISTANCE + 1;
const MESH_RADIUS = RENDER_DISTANCE;
const KEEP_RADIUS = RENDER_DISTANCE + 3;

export class ChunkManager {
  private world: World;
  private group = new THREE.Group();
  private mats: ChunkMaterials;
  private spiral: [number, number][];

  meshedCount = 0;

  constructor(world: World, scene: THREE.Scene, mats: ChunkMaterials) {
    this.world = world;
    this.mats = mats;
    scene.add(this.group);

    // precompute offsets within GEN_RADIUS sorted nearest-first
    const offs: [number, number][] = [];
    for (let dz = -GEN_RADIUS; dz <= GEN_RADIUS; dz++)
      for (let dx = -GEN_RADIUS; dx <= GEN_RADIUS; dx++) offs.push([dx, dz]);
    offs.sort((a, b) => a[0] * a[0] + a[1] * a[1] - (b[0] * b[0] + b[1] * b[1]));
    this.spiral = offs;
  }

  private neighborsLit(cx: number, cz: number): boolean {
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const c = this.world.getChunk(cx + dx, cz + dz);
        if (!c || !c.lit) return false;
      }
    return true;
  }

  private rebuildMesh(chunk: Chunk): void {
    // dispose previous
    for (let i = 0; i < 3; i++) {
      const m = chunk.meshes[i];
      if (m) {
        this.group.remove(m);
        (m.geometry as THREE.BufferGeometry).dispose();
        chunk.meshes[i] = null;
      }
    }
    const { geom } = buildChunkGeometry(this.world, chunk);
    const matByLayer = [this.mats.opaque, this.mats.cutout, this.mats.translucent];
    for (let layer = 0; layer < 3; layer++) {
      const g = geom[layer];
      if (!g) continue;
      const mesh = new THREE.Mesh(g, matByLayer[layer]);
      mesh.position.set(chunk.cx * CHUNK_SX, 0, chunk.cz * CHUNK_SZ);
      mesh.frustumCulled = true;
      if (layer === 2) mesh.renderOrder = 1; // water after opaque
      this.group.add(mesh);
      chunk.meshes[layer] = mesh;
    }
    chunk.meshDirty = false;
  }

  /** Stream around the player. budgetMs caps time spent on gen/light/mesh. */
  update(pcx: number, pcz: number, budgetMs = 10): void {
    const start = performance.now();
    const overBudget = () => performance.now() - start > budgetMs;

    // 1) generation (immediate area first)
    for (const [dx, dz] of this.spiral) {
      if (overBudget()) break;
      const cx = pcx + dx;
      const cz = pcz + dz;
      if (!this.world.getChunk(cx, cz)) this.world.ensureChunk(cx, cz);
    }

    // 2) lighting. computeSkylight floods across borders into already-lit
    // neighbours (raising their light + flagging them to re-mesh), so a chunk
    // lit before its neighbour still receives that neighbour's flood once it
    // lights — skylight stays symmetric across the chunk grid.
    for (const [dx, dz] of this.spiral) {
      const d = Math.max(Math.abs(dx), Math.abs(dz));
      if (d > LIGHT_RADIUS) continue;
      if (overBudget()) break;
      const c = this.world.getChunk(pcx + dx, pcz + dz);
      if (c && c.generated && !c.lit) computeSkylight(this.world, c);
    }

    // 3) meshing
    for (const [dx, dz] of this.spiral) {
      const d = Math.max(Math.abs(dx), Math.abs(dz));
      if (d > MESH_RADIUS) continue;
      if (overBudget()) break;
      const cx = pcx + dx;
      const cz = pcz + dz;
      const c = this.world.getChunk(cx, cz);
      if (c && c.lit && c.meshDirty && this.neighborsLit(cx, cz)) this.rebuildMesh(c);
    }

    // 4) unload far chunks (cheap; run fully each frame)
    for (const [key, c] of this.world.chunks) {
      if (Math.abs(c.cx - pcx) > KEEP_RADIUS || Math.abs(c.cz - pcz) > KEEP_RADIUS) {
        for (let i = 0; i < 3; i++) {
          const m = c.meshes[i];
          if (m) {
            this.group.remove(m);
            (m.geometry as THREE.BufferGeometry).dispose();
            c.meshes[i] = null;
          }
        }
        this.world.chunks.delete(key);
      }
    }

    // count meshed chunks for HUD
    let n = 0;
    for (const c of this.world.chunks.values()) if (!c.meshDirty) n++;
    this.meshedCount = n;
  }

  /** Has the immediate 3x3 around the player been meshed yet (for spawn gate)? */
  readyAt(pcx: number, pcz: number): boolean {
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const c = this.world.getChunk(pcx + dx, pcz + dz);
        if (!c || c.meshDirty) return false;
      }
    return true;
  }
}
