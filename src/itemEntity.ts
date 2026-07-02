// ---------------------------------------------------------------------------
// Item entities (drops): the small spinning items that pop out of broken
// blocks, fall with the shared voxel collision, merge into piles, and vacuum
// into the player's inventory. Mesh creation is injected so the logic stays
// testable without a DOM (tests pass a stub factory).
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { collideAxis, Box } from './collision';
import { Item, itemKey, maxStack } from './items';
import { Inventory, ItemStack } from './inventory';

const GRAVITY = 24;
const BOX: Box = { half: 0.125, height: 0.25 };
const ATTRACT = 1.4; // start flying toward the player
const ABSORB = 0.5; // close enough to collect
const ATTRACT_SPEED = 8;
const MERGE = 0.5;
const DESPAWN = 300; // seconds
const CAP = 256;
const OVERFLOW_COOLDOWN = 1.5; // pause pickup attempts after a full inventory

export interface EntityWorld {
  solidAt(x: number, y: number, z: number): boolean;
  chunkLoaded(wx: number, wz: number): boolean;
}

interface ItemEntity {
  stack: ItemStack;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  age: number;
  cooldown: number;
  mesh: THREE.Object3D;
}

export class DropManager {
  entities: ItemEntity[] = [];

  // Instance-scoped LCG so every manager gets its own deterministic stream:
  // trajectories no longer depend on how many other instances/tests have
  // advanced a shared module-level sequence.
  private seed = 9241;

  private rand(): number {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  constructor(
    private world: EntityWorld,
    private meshFactory: (item: Item) => THREE.Object3D,
    private scene: THREE.Scene | null,
  ) {}

  // Bound once so the three per-axis collision calls each frame don't allocate
  // a fresh closure per entity (mirrors Player.solidCb).
  private solidCb = (x: number, y: number, z: number) => this.world.solidAt(x, y, z);

  get count(): number {
    return this.entities.length;
  }

  spawn(item: Item, count: number, x: number, y: number, z: number): void {
    const mesh = this.meshFactory(item);
    const e: ItemEntity = {
      stack: { item, count },
      pos: new THREE.Vector3(x, y, z),
      vel: new THREE.Vector3((this.rand() - 0.5) * 3, 5.5, (this.rand() - 0.5) * 3),
      age: 0,
      cooldown: 0,
      mesh,
    };
    this.entities.push(e);
    this.scene?.add(mesh);
    if (this.entities.length > CAP) this.remove(this.entities[0]);
  }

  private remove(e: ItemEntity): void {
    const i = this.entities.indexOf(e);
    if (i >= 0) this.entities.splice(i, 1);
    this.scene?.remove(e.mesh);
  }

  update(dt: number, playerPos: THREE.Vector3, inventory: Inventory | null, onPickup: () => void): void {
    const target = new THREE.Vector3(playerPos.x, playerPos.y + 0.9, playerPos.z);
    const d = new THREE.Vector3();
    for (const e of [...this.entities]) {
      e.age += dt;
      if (e.age > DESPAWN) {
        this.remove(e);
        continue;
      }
      if (e.cooldown > 0) e.cooldown -= dt;

      d.subVectors(target, e.pos);
      const dist = d.length();
      if (inventory && e.cooldown <= 0 && dist < ATTRACT) {
        if (dist < ABSORB) {
          const leftover = inventory.add(e.stack.item, e.stack.count);
          if (leftover === 0) {
            this.remove(e);
            onPickup();
            continue;
          }
          if (leftover < e.stack.count) onPickup();
          e.stack.count = leftover;
          e.cooldown = OVERFLOW_COOLDOWN;
        } else {
          // magnet: fly straight at the player, ignore terrain
          e.pos.addScaledVector(d.normalize(), Math.min(ATTRACT_SPEED * dt, dist));
          this.sync(e);
          continue;
        }
      }

      if (!this.world.chunkLoaded(e.pos.x, e.pos.z)) continue; // frozen until terrain exists

      e.vel.y -= GRAVITY * dt;
      if (e.vel.y < -40) e.vel.y = -40;
      const dy = e.vel.y * dt; // capture sign: collideAxis zeroes vel on hit
      const onGround = collideAxis(this.solidCb, e.pos, e.vel, BOX, 'y', dy) && dy < 0;
      collideAxis(this.solidCb, e.pos, e.vel, BOX, 'x', e.vel.x * dt);
      collideAxis(this.solidCb, e.pos, e.vel, BOX, 'z', e.vel.z * dt);
      if (onGround) {
        e.vel.x *= Math.max(0, 1 - 10 * dt);
        e.vel.z *= Math.max(0, 1 - 10 * dt);
      }
      this.sync(e);
    }
    this.mergePass();
  }

  private sync(e: ItemEntity): void {
    e.mesh.position.set(e.pos.x, e.pos.y + 0.125 + Math.sin(e.age * 2) * 0.04, e.pos.z);
    e.mesh.rotation.y = e.age * 1.5;
  }

  private mergePass(): void {
    for (let i = 0; i < this.entities.length; i++) {
      const a = this.entities[i];
      const limit = maxStack(a.stack.item);
      for (let j = this.entities.length - 1; j > i; j--) {
        const b = this.entities[j];
        if (itemKey(a.stack.item) !== itemKey(b.stack.item)) continue;
        if (a.pos.distanceTo(b.pos) > MERGE) continue;
        // Partial transfer (mirrors Inventory.add): top up a, keep the rest in b.
        const take = Math.min(limit - a.stack.count, b.stack.count);
        if (take <= 0) continue; // a already full
        a.stack.count += take;
        b.stack.count -= take;
        if (b.stack.count === 0) this.remove(b);
      }
    }
  }
}
