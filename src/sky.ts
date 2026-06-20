// ---------------------------------------------------------------------------
// Sky: light-blue daytime sky, distance fog fading into the sky colour, flat
// square white clouds drifting overhead, a 20-minute day/night cycle with a
// square sun and moon. Exposes the current day-light factor for the chunk
// shader so the world dims at night.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { RENDER_DISTANCE, CHUNK_SX } from './constants';

const DAY_LENGTH = 20 * 60; // seconds for a full cycle
const CLOUD_Y = 104;
const CELESTIAL_R = 320;
const NIGHT_FLOOR = 0.18;

const DAY_SKY = new THREE.Color(0.52, 0.67, 0.94);
const NIGHT_SKY = new THREE.Color(0.02, 0.03, 0.09);
const SUNSET = new THREE.Color(0.92, 0.52, 0.26);

function clamp01(v: number) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function smoothstep(a: number, b: number, x: number) {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

function makeSunTexture(): THREE.Texture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 16;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = '#f6e27a';
  ctx.fillRect(0, 0, 16, 16);
  ctx.fillStyle = '#fff3b0';
  ctx.fillRect(3, 3, 10, 10);
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  return t;
}

function makeMoonTexture(): THREE.Texture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 16;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = '#dfe3ea';
  ctx.fillRect(0, 0, 16, 16);
  ctx.fillStyle = '#b9bfca';
  ctx.fillRect(4, 4, 3, 3);
  ctx.fillRect(9, 7, 2, 2);
  ctx.fillRect(6, 10, 2, 2);
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  return t;
}

function makeCloudTexture(): THREE.Texture {
  const N = 32;
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(N, N);
  let seed = 9876;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  // coarse blobby cloud field
  const grid: number[] = [];
  for (let i = 0; i < N * N; i++) grid[i] = rand() < 0.32 ? 1 : 0;
  // dilate a bit to form clumps
  const out: number[] = grid.slice();
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      let c = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = (x + dx + N) % N;
          const ny = (y + dy + N) % N;
          c += grid[ny * N + nx];
        }
      out[y * N + x] = c >= 4 ? 1 : 0;
    }
  for (let i = 0; i < N * N; i++) {
    const on = out[i];
    img.data[i * 4] = 255;
    img.data[i * 4 + 1] = 255;
    img.data[i * 4 + 2] = 255;
    img.data[i * 4 + 3] = on ? 220 : 0;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  const repeats = 6;
  t.repeat.set(repeats, repeats);
  return t;
}

export class Sky {
  time = DAY_LENGTH * 0.3; // start mid-morning
  dayLight = 1;
  sunDir = new THREE.Vector3(0, 1, 0);

  private scene: THREE.Scene;
  private fog: THREE.Fog;
  private sun: THREE.Mesh;
  private moon: THREE.Mesh;
  private clouds: THREE.Mesh;
  private cloudMat: THREE.MeshBasicMaterial;
  private skyColor = new THREE.Color();

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    const far = RENDER_DISTANCE * CHUNK_SX;
    this.fog = new THREE.Fog(DAY_SKY.getHex(), far * 0.55, far * 0.98);
    scene.fog = this.fog;
    scene.background = new THREE.Color(DAY_SKY.getHex());

    const sunMat = new THREE.MeshBasicMaterial({ map: makeSunTexture(), fog: false, depthWrite: false, depthTest: false });
    this.sun = new THREE.Mesh(new THREE.PlaneGeometry(50, 50), sunMat);
    this.sun.renderOrder = -10;
    scene.add(this.sun);

    const moonMat = new THREE.MeshBasicMaterial({ map: makeMoonTexture(), fog: false, depthWrite: false, depthTest: false });
    this.moon = new THREE.Mesh(new THREE.PlaneGeometry(42, 42), moonMat);
    this.moon.renderOrder = -10;
    scene.add(this.moon);

    this.cloudMat = new THREE.MeshBasicMaterial({
      map: makeCloudTexture(),
      transparent: true,
      depthWrite: false,
      fog: true,
      opacity: 0.85,
      side: THREE.DoubleSide, // visible from below (players are under the clouds)
    });
    this.clouds = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), this.cloudMat);
    this.clouds.rotation.x = -Math.PI / 2;
    this.clouds.renderOrder = -5;
    scene.add(this.clouds);
  }

  update(dt: number, camPos: THREE.Vector3): void {
    this.time = (this.time + dt) % DAY_LENGTH;
    const dayFrac = this.time / DAY_LENGTH;

    // sun travels east -> overhead -> west; theta 0 at dawn.
    const theta = (dayFrac - 0.25) * Math.PI * 2;
    this.sunDir.set(Math.cos(theta), Math.sin(theta), 0.15).normalize();

    // day-light factor for the chunk shader
    const dayMix = smoothstep(-0.06, 0.28, this.sunDir.y);
    this.dayLight = NIGHT_FLOOR + (1 - NIGHT_FLOOR) * dayMix;

    // sky colour: night<->day, plus a sunset/sunrise glow near the horizon
    this.skyColor.copy(NIGHT_SKY).lerp(DAY_SKY, dayMix);
    const horizonGlow = clamp01(1 - Math.abs(this.sunDir.y) / 0.22) * smoothstep(-0.25, 0.05, this.sunDir.y);
    this.skyColor.lerp(SUNSET, horizonGlow * 0.55);

    (this.scene.background as THREE.Color).copy(this.skyColor);
    this.fog.color.copy(this.skyColor);

    // position celestial bodies relative to the camera
    this.sun.position.copy(camPos).addScaledVector(this.sunDir, CELESTIAL_R);
    this.sun.lookAt(camPos);
    this.moon.position.copy(camPos).addScaledVector(this.sunDir, -CELESTIAL_R);
    this.moon.lookAt(camPos);
    const sunVisible = this.sunDir.y > -0.2;
    this.sun.visible = sunVisible;
    this.moon.visible = !sunVisible || this.sunDir.y < 0.25;

    // clouds: follow camera, drift with the wind, darken at night
    this.clouds.position.set(camPos.x, CLOUD_Y, camPos.z);
    const tex = this.cloudMat.map!;
    tex.offset.x = (this.time * 0.0009) % 1;
    const cloudShade = 0.35 + 0.65 * this.dayLight;
    this.cloudMat.color.setRGB(cloudShade, cloudShade, cloudShade);
  }
}
