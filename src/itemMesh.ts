// ---------------------------------------------------------------------------
// Shared item mesh builders, used by the held-item overlay (held.ts) and drop
// entities. Blocks are skinned unit cubes (atlas tiles + baked face shading);
// tools/materials are 3D extrusions of their 16x16 sprite (each opaque pixel
// becomes a thin voxel slab, like Minecraft's in-hand items).
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { BlockId, blockDef, RenderLayer } from './blocks';
import { Item } from './items';
import { tileUV, toolPixels, materialPixels } from './textures';

export const FACE_SHADE = [0.6, 0.6, 1.0, 0.5, 0.8, 0.8]; // +x,-x,+y,-y,+z,-z
const SPRITE_DEPTH = 3 / 16; // sprite is 1 unit tall; ~3px of depth reads as a solid slab

// Extrude a 16x16 RGBA sprite into a coloured mesh: front + back faces per
// opaque pixel, side faces only on silhouette edges. Shading is baked into
// vertex colours (top brightest, bottom darkest), so no lighting is needed.
export function buildSpriteGeometry(px: Uint8ClampedArray): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const zf = SPRITE_DEPTH / 2;
  const zb = -SPRITE_DEPTH / 2;
  const opaque = (x: number, y: number) => x >= 0 && x < 16 && y >= 0 && y < 16 && px[(y * 16 + x) * 4 + 3] >= 40;
  const quad = (p1: number[], p2: number[], p3: number[], p4: number[], r: number, g: number, b: number) => {
    pos.push(...p1, ...p2, ...p3, ...p1, ...p3, ...p4);
    for (let i = 0; i < 6; i++) col.push(r, g, b);
  };
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const i = (y * 16 + x) * 4;
      if (px[i + 3] < 40) continue;
      const r = px[i] / 255;
      const g = px[i + 1] / 255;
      const b = px[i + 2] / 255;
      const x0 = x / 16 - 0.5;
      const x1 = (x + 1) / 16 - 0.5;
      const yT = 0.5 - y / 16; // image row 0 is the top of the sprite
      const yB = 0.5 - (y + 1) / 16;
      quad([x0, yB, zf], [x1, yB, zf], [x1, yT, zf], [x0, yT, zf], r * 0.95, g * 0.95, b * 0.95); // front
      quad([x1, yB, zb], [x0, yB, zb], [x0, yT, zb], [x1, yT, zb], r * 0.5, g * 0.5, b * 0.5); // back
      if (!opaque(x - 1, y)) quad([x0, yB, zb], [x0, yB, zf], [x0, yT, zf], [x0, yT, zb], r * 0.55, g * 0.55, b * 0.55);
      if (!opaque(x + 1, y)) quad([x1, yB, zf], [x1, yB, zb], [x1, yT, zb], [x1, yT, zf], r * 0.78, g * 0.78, b * 0.78);
      if (!opaque(x, y - 1)) quad([x0, yT, zf], [x1, yT, zf], [x1, yT, zb], [x0, yT, zb], r, g, b); // top edge brightest
      if (!opaque(x, y + 1)) quad([x0, yB, zb], [x1, yB, zb], [x1, yB, zf], [x0, yB, zf], r * 0.45, g * 0.45, b * 0.45); // bottom darkest
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return geo;
}

/** Skin a unit BoxGeometry with a block's atlas tiles + baked face shading. */
export function applyBlockSkin(geo: THREE.BoxGeometry, baseUV: Float32Array, id: BlockId): void {
  const def = blockDef(id);
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  const colors = new Float32Array(24 * 3);
  for (let face = 0; face < 6; face++) {
    const [u0, v0, u1, v1] = tileUV(def.faces[face]);
    for (let v = 0; v < 4; v++) {
      const i = face * 4 + v;
      const ou = baseUV[i * 2];
      const ov = baseUV[i * 2 + 1];
      uv.setXY(i, u0 + ou * (u1 - u0), v0 + ov * (v1 - v0));
      const s = FACE_SHADE[face];
      colors[i * 3] = s;
      colors[i * 3 + 1] = s;
      colors[i * 3 + 2] = s;
    }
  }
  uv.needsUpdate = true;
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

/** 0.25-scale world mesh for a dropped item. Caller positions/animates it. */
export function buildDropMesh(item: Item, atlas: THREE.Texture): THREE.Mesh {
  if (item.kind === 'block') {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const baseUV = (geo.getAttribute('uv').array as Float32Array).slice();
    applyBlockSkin(geo, baseUV, item.block);
    const seeThrough = blockDef(item.block).layer !== RenderLayer.Opaque;
    const mat = new THREE.MeshBasicMaterial({
      map: atlas,
      vertexColors: true,
      transparent: seeThrough,
      side: seeThrough ? THREE.DoubleSide : THREE.FrontSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.scale.setScalar(0.25);
    return mesh;
  }
  const px = item.kind === 'tool' ? toolPixels(item.tool, item.tier) : materialPixels(item.material);
  const mesh = new THREE.Mesh(
    buildSpriteGeometry(px),
    new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }),
  );
  mesh.scale.setScalar(0.25);
  return mesh;
}
