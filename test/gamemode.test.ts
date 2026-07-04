// Pins the per-mode rules table: creative = sandbox (fly/picker, no survival
// systems), survival = the inverse, including the slice-2 inventory screen.

import { describe, it, expect } from 'vitest';
import { rulesFor } from '../src/gamemode';

describe('rulesFor', () => {
  it('creative: fly + picker, no drops/consume/inventory screen', () => {
    expect(rulesFor('creative')).toEqual({
      fly: true,
      picker: true,
      drops: false,
      consumeOnPlace: false,
      inventoryScreen: false,
    });
  });
  it('survival: no fly/picker, drops + consume + inventory screen', () => {
    expect(rulesFor('survival')).toEqual({
      fly: false,
      picker: false,
      drops: true,
      consumeOnPlace: true,
      inventoryScreen: true,
    });
  });
});
