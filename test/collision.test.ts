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
  it('moving -x snaps to the far face of a wall behind', () => {
    const behind = (x: number, y: number, _z: number) => Math.floor(y) < 0 || Math.floor(x) < 0;
    const pos = new THREE.Vector3(0.4, 0.1, 0.5);
    const vel = new THREE.Vector3(-5, 0, 0);
    const hit = collideAxis(behind, pos, vel, box, 'x', -0.3);
    expect(hit).toBe(true);
    expect(pos.x).toBeCloseTo(0.3, 2);
    expect(vel.x).toBe(0);
  });
  it('rising into a ceiling snaps the head, not the feet', () => {
    const ceiling = (_x: number, y: number, _z: number) => Math.floor(y) >= 3;
    const pos = new THREE.Vector3(0.5, 1.0, 0.5);
    const vel = new THREE.Vector3(0, 8, 0);
    const hit = collideAxis(ceiling, pos, vel, box, 'y', 0.4);
    expect(hit).toBe(true);
    expect(pos.y).toBeCloseTo(3 - box.height, 2);
    expect(vel.y).toBe(0);
  });
  it('diagonal move into a corner resolves each axis against its own wall', () => {
    const corner = (x: number, y: number, z: number) =>
      Math.floor(y) < 0 || Math.floor(x) >= 3 || Math.floor(z) >= 3;
    const pos = new THREE.Vector3(2.5, 0.1, 2.5);
    const vel = new THREE.Vector3(5, 0, 5);
    expect(collideAxis(corner, pos, vel, box, 'x', 0.4)).toBe(true);
    expect(collideAxis(corner, pos, vel, box, 'z', 0.4)).toBe(true);
    expect(pos.x).toBeCloseTo(3 - 0.3, 2);
    expect(pos.z).toBeCloseTo(3 - 0.3, 2);
    expect(vel.x).toBe(0);
    expect(vel.z).toBe(0);
  });
  it('a face already passed before the move never re-catches (corner-catch guard)', () => {
    // box already straddles the wall plane at x=3; moving further +x must not
    // snap it backward to the face it has passed — the EPS lead filter skips it
    const pos = new THREE.Vector3(2.9, 0.1, 0.5);
    const vel = new THREE.Vector3(5, 0, 0);
    const hit = collideAxis(world, pos, vel, box, 'x', 0.4);
    expect(hit).toBe(false);
    expect(pos.x).toBeCloseTo(3.3, 5);
    expect(vel.x).toBe(5);
  });
});
