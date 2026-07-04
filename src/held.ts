// ---------------------------------------------------------------------------
// First-person held item in the bottom-right, rendered as a separate overlay
// scene/camera (cleared depth) so it never clips into the world. Blocks render
// as a skinned cube; tools and materials render as a 3D extrusion of their
// 16x16 sprite (see itemMesh.ts for the shared builders).
// Swings on click / while breaking: a forward chop around a wrist pivot at the
// handle end, with a fast strike and slower recovery.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { BlockId, blockDef, RenderLayer } from './blocks';
import { Item, itemKey } from './items';
import { toolPixels, materialPixels } from './textures';
import { buildSpriteGeometry, applyBlockSkin } from './itemMesh';

const SWING_DUR = 0.28;

export class HeldItem {
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  private cube: THREE.Mesh;
  private cubeGeom: THREE.BoxGeometry;
  private cubeMat: THREE.MeshBasicMaterial;
  private baseUV!: Float32Array; // pristine 0/1 box UVs to remap from
  private toolMesh: THREE.Mesh;
  private toolPivot = new THREE.Group(); // wrist: sits at the handle end so swings arc forward
  private toolGeoCache = new Map<string, THREE.BufferGeometry>();
  private placeholderGeo: THREE.BufferGeometry | null = null; // disposed on first real tool geo
  // 'sprite' covers everything rendered as a 16x16 sprite extrusion: tools AND materials.
  private kind: 'block' | 'sprite' = 'block';
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
    // offset the mesh so the pivot origin lands on the handle end — sprites put
    // the grip at pixel (2,13), i.e. (-0.375, -0.375) in mesh space
    this.toolMesh.position.set(0.23, 0.23, 0);
    this.toolPivot.add(this.toolMesh);
    this.toolPivot.visible = false;
    this.scene.add(this.toolPivot);
  }

  setItem(item: Item | null): void {
    const key = item ? itemKey(item) : 'none';
    if (key === this.currentKey) return;
    this.currentKey = key;
    this.currentItem = item;
    if (!item) {
      this.cube.visible = false;
      this.toolPivot.visible = false;
      return;
    }
    if (item.kind === 'block') {
      this.kind = 'block';
      this.cube.visible = true;
      this.toolPivot.visible = false;
      this.skinBlock(item.block);
    } else {
      this.kind = 'sprite';
      this.cube.visible = false;
      this.toolPivot.visible = true;
      let geo = this.toolGeoCache.get(key);
      if (!geo) {
        const px = item.kind === 'tool' ? toolPixels(item.tool, item.tier) : materialPixels(item.material);
        geo = buildSpriteGeometry(px);
        this.toolGeoCache.set(key, geo);
      }
      this.toolMesh.geometry = geo;
      if (this.placeholderGeo) {
        this.placeholderGeo.dispose();
        this.placeholderGeo = null;
      }
    }
  }

  /**
   * Rebuild cached sprite geometries (tools and materials) — call after the
   * async tool textures finish loading so held meshes pick up the new pixels.
   */
  refreshTools(): void {
    for (const g of this.toolGeoCache.values()) g.dispose();
    this.toolGeoCache.clear();
    if (this.kind === 'sprite' && this.currentItem) {
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
    // remaps from pristine base UVs so re-skinning never shrinks the tile
    applyBlockSkin(this.cubeGeom, this.baseUV, id);
  }

  update(dt: number, swinging: boolean): void {
    if (this.phase > 0) {
      this.phase += dt / SWING_DUR;
      if (this.phase >= 1) this.phase = swinging ? this.phase - 1 : 0;
    } else if (swinging) {
      this.phase = 0.0001;
    }

    // Minecraft-style timing: the sqrt-eased strike snaps out fast and recovers
    // slowly; sweep lags behind it so the arc reads as a whip, not a metronome.
    const strike = Math.sin(Math.sqrt(this.phase) * Math.PI);
    const sweep = Math.sin(this.phase * this.phase * Math.PI);
    if (this.kind === 'block') {
      // forward jab: away from the camera (-z), toward screen centre, top tipping away
      this.cube.position.set(0.62 - strike * 0.25, -0.52 - strike * 0.16, -1.0 - strike * 0.28);
      this.cube.rotation.set(0.18 - strike * 0.5, -0.5 - sweep * 0.5, 0.1);
    } else {
      // idle: yawed ~40° so the extruded depth is visible; swing pitches the
      // pivot forward so the head arcs down-and-away like a real chop
      this.toolPivot.position.set(0.26 - strike * 0.3, -0.64 - strike * 0.08, -1.0 - strike * 0.25);
      this.toolPivot.rotation.set(0.1 - strike * 1.25, -0.7 - sweep * 0.45, -0.15 - sweep * 0.25);
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
