// Tests for the survival health model (src/health.ts): 20 HP clamping,
// death flag, the peaceful-style 1 HP / 4 s passive regen (damage restarts
// the interval), and the vanilla fall-damage formula. Pure logic, plain node.

import { describe, it, expect } from 'vitest';
import { Health, MAX_HP, fallDamage } from '../src/health';

describe('Health', () => {
  it('starts full and clamps damage at zero (dead)', () => {
    const h = new Health();
    expect(h.hp).toBe(MAX_HP);
    h.damage(7);
    expect(h.hp).toBe(13);
    expect(h.dead).toBe(false);
    h.damage(99);
    expect(h.hp).toBe(0);
    expect(h.dead).toBe(true);
  });
  it('heal clamps at max', () => {
    const h = new Health();
    h.damage(5);
    h.heal(3);
    expect(h.hp).toBe(18);
    h.heal(99);
    expect(h.hp).toBe(MAX_HP);
  });
  it('regen ticks 1 HP every 4 seconds while below max', () => {
    const h = new Health();
    h.damage(2);
    expect(h.tick(3.9)).toBe(false);
    expect(h.hp).toBe(18);
    expect(h.tick(0.2)).toBe(true); // crosses the 4s mark
    expect(h.hp).toBe(19);
    expect(h.tick(4.0)).toBe(true);
    expect(h.hp).toBe(MAX_HP);
    expect(h.tick(10)).toBe(false); // full: no change reported
    expect(h.hp).toBe(MAX_HP);
  });
  it('taking damage restarts the regen interval', () => {
    const h = new Health();
    h.damage(4);
    h.tick(3.9);
    h.damage(1); // resets the 4s timer
    expect(h.tick(3.9)).toBe(false);
    expect(h.tick(0.2)).toBe(true);
  });
  it('reset restores full health', () => {
    const h = new Health();
    h.damage(99);
    h.reset();
    expect(h.hp).toBe(MAX_HP);
    expect(h.dead).toBe(false);
  });
});

describe('fallDamage', () => {
  it.each([
    [0, 0],
    [3, 0], // exactly 3 blocks is safe (epsilon guards float noise)
    [3.5, 1],
    [4, 1],
    [10, 7],
  ])('%f blocks → %i damage', (dist, dmg) => {
    expect(fallDamage(dist)).toBe(dmg);
  });
});
