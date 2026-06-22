// ---------------------------------------------------------------------------
// First-person held item in the bottom-right, rendered as a separate overlay
// scene/camera (cleared depth) so it never clips into the world. Blocks render
// as a skinned cube; tools render as a 3D extrusion of their 16x16 sprite (each
// opaque pixel becomes a thin voxel slab, like Minecraft's in-hand items).
// Swings on click / while breaking.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { BlockId, blockDef, RenderLayer } from './blocks';
import { Item, itemKey } from './items';
import { tileUV, toolPixels } from './textures';

const SWING_DUR = 0.28;
const FACE_SHADE = [0.6, 0.6, 1.0, 0.5, 0.8, 0.8]; // +x,-x,+y,-y,+z,-z
const TOOL_DEPTH = 2 / 16; // sprite is 1 unit tall; ~2px of depth reads as solid

// Extrude a 16x16 RGBA sprite into a coloured mesh: front + back faces per
// opaque pixel, side faces only on silhouette edges. Shading is baked into
// vertex colours (top brightest, bottom darkest), so no lighting is needed.
function buildToolGeometry(px: Uint8ClampedArray): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const zf = TOOL_DEPTH / 2;
  const zb = -TOOL_DEPTH / 2;
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
      if (!opaque(x - 1, y)) quad([x0, yB, zb], [x0, yB, zf], [x0, yT, zf], [x0, yT, zb], r * 0.65, g * 0.65, b * 0.65);
      if (!opaque(x + 1, y)) quad([x1, yB, zf], [x1, yB, zb], [x1, yT, zb], [x1, yT, zf], r * 0.65, g * 0.65, b * 0.65);
      if (!opaque(x, y - 1)) quad([x0, yT, zf], [x1, yT, zf], [x1, yT, zb], [x0, yT, zb], r, g, b); // top edge brightest
      if (!opaque(x, y + 1)) quad([x0, yB, zb], [x1, yB, zb], [x1, yB, zf], [x0, yB, zf], r * 0.45, g * 0.45, b * 0.45); // bottom darkest
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return geo;
}

export class HeldItem {
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  private cube: THREE.Mesh;
  private cubeGeom: THREE.BoxGeometry;
  private cubeMat: THREE.MeshBasicMaterial;
  private baseUV!: Float32Array; // pristine 0/1 box UVs to remap from
  private toolMesh: THREE.Mesh;
  private toolGeoCache = new Map<string, THREE.BufferGeometry>();
  private placeholderGeo: THREE.BufferGeometry | null = null; // disposed on first real tool geo
  private kind: 'block' | 'tool' = 'block';
  private currentItem: Item | null = null;
  private currentKey = ''; // itemKey of the current item; skip redundant rebuilds
  private phase = 0; // 0 == idle, (0,1] == mid-swing

  constructor(atlas: THREE.Texture, aspect: number) {
    this.camera = new THREE.PerspectiveCamera(60, aspect, 0.01, 10);
    this.camera.position.set(0, 0, 0);

    // Block cube. Opaque by default; skinBlock() switches to transparent +
    // DoubleSide only for see-through blocks (glass).
    this.cubeMat = new THREE.MeshBasicMaterial({ map: atlas, vertexColors: true });
    this.cubeGeom = new THREE.BoxGeometry(1, 1, 1);
    this.baseUV = (this.cubeGeom.getAttribute('uv').array as Float32Array).slice();
    this.cube = new THREE.Mesh(this.cubeGeom, this.cubeMat);
    this.cube.scale.setScalar(0.42);
    this.scene.add(this.cube);

    // Tool extrusion. Vertex-coloured, DoubleSide so winding never matters. The
    // empty placeholder is disposed the first time a real tool geometry replaces it.
    this.placeholderGeo = new THREE.BufferGeometry();
    this.toolMesh = new THREE.Mesh(
      this.placeholderGeo,
      new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }),
    );
    this.toolMesh.scale.setScalar(0.62);
    this.toolMesh.visible = false;
    this.scene.add(this.toolMesh);
  }

  setItem(item: Item): void {
    const key = itemKey(item);
    if (key === this.currentKey) return;
    this.currentKey = key;
    this.currentItem = item;
    if (item.kind === 'block') {
      this.kind = 'block';
      this.cube.visible = true;
      this.toolMesh.visible = false;
      this.skinBlock(item.block);
    } else {
      this.kind = 'tool';
      this.cube.visible = false;
      this.toolMesh.visible = true;
      let geo = this.toolGeoCache.get(key);
      if (!geo) {
        geo = buildToolGeometry(toolPixels(item.tool, item.tier));
        this.toolGeoCache.set(key, geo);
      }
      this.toolMesh.geometry = geo;
      if (this.placeholderGeo) {
        this.placeholderGeo.dispose();
        this.placeholderGeo = null;
      }
    }
  }

  /** Rebuild cached tool meshes — call after async tool textures finish loading. */
  refreshTools(): void {
    for (const g of this.toolGeoCache.values()) g.dispose();
    this.toolGeoCache.clear();
    if (this.kind === 'tool' && this.currentItem) {
      this.currentKey = ''; // force setItem to rebuild from the new pixels
      this.setItem(this.currentItem);
    }
  }

  private skinBlock(id: BlockId): void {
    const def = blockDef(id);
    const seeThrough = def.layer !== RenderLayer.Opaque;
    this.cubeMat.transparent = seeThrough;
    this.cubeMat.side = seeThrough ? THREE.DoubleSide : THREE.FrontSide;
    this.cubeMat.needsUpdate = true;
    const uv = this.cubeGeom.getAttribute('uv') as THREE.BufferAttribute;
    const colors = new Float32Array(24 * 3);
    for (let face = 0; face < 6; face++) {
      const [u0, v0, u1, v1] = tileUV(def.faces[face]);
      for (let v = 0; v < 4; v++) {
        const i = face * 4 + v;
        // remap from pristine base UVs so re-skinning never shrinks the tile
        const ou = this.baseUV[i * 2];
        const ov = this.baseUV[i * 2 + 1];
        uv.setXY(i, u0 + ou * (u1 - u0), v0 + ov * (v1 - v0));
        const s = FACE_SHADE[face];
        colors[i * 3] = s;
        colors[i * 3 + 1] = s;
        colors[i * 3 + 2] = s;
      }
    }
    uv.needsUpdate = true;
    this.cubeGeom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }

  update(dt: number, swinging: boolean): void {
    if (this.phase > 0) {
      this.phase += dt / SWING_DUR;
      if (this.phase >= 1) this.phase = swinging ? this.phase - 1 : 0;
    } else if (swinging) {
      this.phase = 0.0001;
    }

    const swing = Math.sin(this.phase * Math.PI); // 0..1..0
    if (this.kind === 'block') {
      const baseX = 0.62;
      const baseY = -0.52;
      const baseZ = -1.0;
      this.cube.position.set(baseX - swing * 0.12, baseY - swing * 0.22, baseZ + swing * 0.18);
      this.cube.rotation.set(0.18 + swing * 0.5, -0.5 - swing * 0.6, 0.1);
    } else {
      // angled so the extruded depth is visible; swing rotates it up
      const baseX = 0.34;
      const baseY = -0.34;
      const baseZ = -0.92;
      this.toolMesh.position.set(baseX - swing * 0.08, baseY - swing * 0.24, baseZ + swing * 0.1);
      this.toolMesh.rotation.set(0.1 + swing * 0.35, -0.42, -0.12 - swing * 0.5);
    }
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  render(renderer: THREE.WebGLRenderer): void {
    const prev = renderer.autoClear;
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
    renderer.autoClear = prev;
  }
}
