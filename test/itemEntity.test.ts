// Tests for the item-entity DropManager (src/itemEntity.ts). Pins drop physics
// (spawned drops fall via the shared voxel collision and settle on the floor),
// same-item merging within 0.5m, the pickup vacuum into a nearby player's
// inventory, full-inventory overflow leaving the drop in the world, the 300s
// despawn timer, and the 256-entity cap culling the oldest. Mesh creation is
// injected (stub Object3D factory, null scene) so everything runs in plain node.

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { DropManager } from '../src/itemEntity';
import { Inventory } from '../src/inventory';
import { block } from '../src/items';
import { Blocks } from '../src/blocks';

const flat = { solidAt: (_x: number, y: number, _z: number) => y < 0, chunkLoaded: () => true };
const stub = () => new THREE.Object3D();
const dirt = block(Blocks.DIRT);
const mk = () => new DropManager(flat, stub, null);
const settle = (dm: DropManager, s = 120) => { for (let i = 0; i < s; i++) dm.update(1 / 60, FAR, null, () => {}); };
const FAR = new THREE.Vector3(100, 0, 100);

describe('DropManager', () => {
  it('spawned drops fall and settle on the floor', () => {
    const dm = mk();
    dm.spawn(dirt, 1, 0.5, 3, 0.5);
    settle(dm);
    expect(dm.entities[0].pos.y).toBeGreaterThanOrEqual(0);
    expect(dm.entities[0].pos.y).toBeLessThan(0.2);
  });
  it('same-item drops within 0.5 merge', () => {
    const dm = mk();
    dm.spawn(dirt, 1, 0.5, 0.5, 0.5);
    dm.spawn(dirt, 2, 0.7, 0.5, 0.5);
    settle(dm);
    expect(dm.count).toBe(1);
    expect(dm.entities[0].stack.count).toBe(3);
  });
  it('near-full stacks merge partially up to the stack limit', () => {
    const dm = mk();
    dm.spawn(dirt, 60, 0.5, 0.5, 0.5);
    dm.spawn(dirt, 10, 0.5, 0.5, 0.5);
    settle(dm);
    expect(dm.count).toBe(2);
    const counts = dm.entities.map((e) => e.stack.count).sort((a, b) => a - b);
    expect(counts).toEqual([6, 64]);
  });
  it('nearby player vacuums the drop into the inventory', () => {
    const dm = mk();
    const inv = new Inventory();
    dm.spawn(dirt, 3, 0.5, 0.5, 0.5);
    let picked = false;
    for (let i = 0; i < 120; i++) dm.update(1 / 60, new THREE.Vector3(1.2, 0, 0.5), inv, () => { picked = true; });
    expect(dm.count).toBe(0);
    expect(picked).toBe(true);
    expect(inv.slots[0]).toEqual({ item: dirt, count: 3 });
  });
  it('full inventory leaves the drop in the world', () => {
    const dm = mk();
    const inv = new Inventory();
    for (let i = 0; i < 36; i++) inv.slots[i] = { item: block(Blocks.SAND), count: 64 };
    dm.spawn(dirt, 1, 0.5, 0.5, 0.5);
    for (let i = 0; i < 120; i++) dm.update(1 / 60, new THREE.Vector3(0.5, 0, 0.5), inv, () => {});
    expect(dm.count).toBe(1);
  });
  it('drops despawn after 300s and the cap culls the oldest', () => {
    const dm = mk();
    dm.spawn(dirt, 1, 0.5, 0.5, 0.5);
    for (let i = 0; i < 320; i++) dm.update(1, FAR, null, () => {});
    expect(dm.count).toBe(0);
    for (let i = 0; i < 300; i++) dm.spawn(block(Blocks.SAND), 1, i * 2, 0.5, 0.5); // spaced: no merging
    expect(dm.count).toBe(256);
  });
});
