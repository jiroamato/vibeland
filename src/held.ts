// ---------------------------------------------------------------------------
// First-person held block in the bottom-right, rendered as a separate overlay
// scene/camera (cleared depth) so it never clips into the world. Swings on
// click / while breaking.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { BlockId, blockDef } from './blocks';
import { tileUV } from './textures';

const SWING_DUR = 0.28;
const FACE_SHADE = [0.6, 0.6, 1.0, 0.5, 0.8, 0.8]; // +x,-x,+y,-y,+z,-z

export class HeldItem {
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  private mesh: THREE.Mesh;
  private geom: THREE.BoxGeometry;
  private currentBlock = -1;
  private phase = 0; // 0 == idle, (0,1] == mid-swing

  constructor(atlas: THREE.Texture, aspect: number) {
    this.camera = new THREE.PerspectiveCamera(60, aspect, 0.01, 10);
    this.camera.position.set(0, 0, 0);

    const mat = new THREE.MeshBasicMaterial({ map: atlas, vertexColors: true });
    this.geom = new THREE.BoxGeometry(1, 1, 1);
    this.mesh = new THREE.Mesh(this.geom, mat);
    this.mesh.scale.setScalar(0.42);
    this.scene.add(this.mesh);

    // a soft fill light is unnecessary for MeshBasicMaterial
  }

  setBlock(id: BlockId): void {
    if (id === this.currentBlock) return;
    this.currentBlock = id;
    const def = blockDef(id);
    const uv = this.geom.getAttribute('uv') as THREE.BufferAttribute;
    const colors = new Float32Array(24 * 3);
    for (let face = 0; face < 6; face++) {
      const [u0, v0, u1, v1] = tileUV(def.faces[face]);
      for (let v = 0; v < 4; v++) {
        const i = face * 4 + v;
        const ou = uv.getX(i);
        const ov = uv.getY(i);
        uv.setXY(i, u0 + ou * (u1 - u0), v0 + ov * (v1 - v0));
        const s = FACE_SHADE[face];
        colors[i * 3] = s;
        colors[i * 3 + 1] = s;
        colors[i * 3 + 2] = s;
      }
    }
    uv.needsUpdate = true;
    this.geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }

  update(dt: number, swinging: boolean): void {
    if (this.phase > 0) {
      this.phase += dt / SWING_DUR;
      if (this.phase >= 1) this.phase = swinging ? this.phase - 1 : 0;
    } else if (swinging) {
      this.phase = 0.0001;
    }

    // resting pose: lower-right, slightly tilted into view
    const baseX = 0.62;
    const baseY = -0.52;
    const baseZ = -1.0;
    const swing = Math.sin(this.phase * Math.PI); // 0..1..0
    this.mesh.position.set(baseX - swing * 0.12, baseY - swing * 0.22, baseZ + swing * 0.18);
    this.mesh.rotation.set(0.18 + swing * 0.5, -0.5 - swing * 0.6, 0.1);
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
