// Tests for the first-person held overlay (src/held.ts): which of the three
// roots (block cube / sprite extrusion / bare arm) is visible per item, and
// that the empty-hand arm actually animates when a swing fires. Three.js runs
// fine in plain node as long as nothing renders, so no DOM is needed.

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { HeldItem } from '../src/held';
import { block } from '../src/items';
import { Blocks } from '../src/blocks';

const mk = () => new HeldItem(new THREE.Texture(), 1.6);
const root = (h: HeldItem, name: string) => h.scene.getObjectByName(name)!;

describe('HeldItem', () => {
  it('empty hand shows the bare arm and hides block/sprite', () => {
    const h = mk();
    h.setItem(null);
    expect(root(h, 'arm').visible).toBe(true);
    expect(root(h, 'block').visible).toBe(false);
    expect(root(h, 'sprite').visible).toBe(false);
  });
  it('equipping a block hides the arm again', () => {
    const h = mk();
    h.setItem(null);
    h.setItem(block(Blocks.DIRT));
    expect(root(h, 'arm').visible).toBe(false);
    expect(root(h, 'block').visible).toBe(true);
  });
  it('a swing moves the arm off its idle pose and it recovers to idle', () => {
    const h = mk();
    h.setItem(null);
    h.update(1 / 60, false);
    const idleX = root(h, 'arm').rotation.x;
    h.update(1 / 60, true); // trigger the swing
    h.update(1 / 60, false); // advance mid-swing
    expect(root(h, 'arm').rotation.x).not.toBe(idleX);
    for (let i = 0; i < 60; i++) h.update(1 / 60, false); // full recovery
    expect(root(h, 'arm').rotation.x).toBeCloseTo(idleX, 5);
  });
});
