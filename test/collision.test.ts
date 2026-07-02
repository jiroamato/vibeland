import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { collideAxis } from '../src/collision';

// solid floor at y < 0, wall at x >= 3
const world = (x: number, y: number, _z: number) =>
  Math.floor(y) < 0 || Math.floor(x) >= 3;
const box = { half: 0.3, height: 1.8 };

describe('collideAxis', () => {
  it('falling onto the floor snaps and reports the hit', () => {
    const pos = new THREE.Vector3(0.5, 0.4, 0.5);
    const vel = new THREE.Vector3(0, -10, 0);
    const hit = collideAxis(world, pos, vel, box, 'y', -0.45);
    expect(hit).toBe(true);
    expect(pos.y).toBeCloseTo(0, 2);
    expect(vel.y).toBe(0);
  });
  it('free fall with no block below moves the full amount', () => {
    const pos = new THREE.Vector3(0.5, 5, 0.5);
    const vel = new THREE.Vector3(0, -10, 0);
    expect(collideAxis(world, pos, vel, box, 'y', -0.4)).toBe(false);
    expect(pos.y).toBeCloseTo(4.6);
  });
  it('walking into a wall snaps to its face', () => {
    const pos = new THREE.Vector3(2.5, 0.1, 0.5);
    const vel = new THREE.Vector3(5, 0, 0);
    const hit = collideAxis(world, pos, vel, box, 'x', 0.4);
    expect(hit).toBe(true);
    expect(pos.x).toBeCloseTo(3 - 0.3, 2);
    expect(vel.x).toBe(0);
  });
});
