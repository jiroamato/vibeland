// ---------------------------------------------------------------------------
// Item model. A hotbar slot holds an Item: either a placeable block or a tool
// (type + material tier). Tools change mining SPEED only — no durability, no
// drops, no inventory (see docs/superpowers/specs/2026-06-20-tool-based-mining).
//
// ToolType (the block-facing "which tool category" concept) lives in blocks.ts
// so block definitions can reference it without a circular import; Tier and the
// material tables are item concerns and live here.
// ---------------------------------------------------------------------------

import { BlockId, BlockDef, HOTBAR_BLOCKS, ToolType, Material } from './blocks';

export const enum Tier {
  Wood = 0,
  Stone = 1,
  Iron = 2,
  Gold = 3,
  Diamond = 4,
  Netherite = 5,
}

export type Item =
  | { kind: 'block'; block: BlockId }
  | { kind: 'tool'; tool: ToolType; tier: Tier }
  | { kind: 'material'; material: Material };

// Vanilla tool speed multipliers, indexed by Tier. Gold is fastest but its
// mining level is the lowest — matching Minecraft.
export const TIER_SPEED: Record<Tier, number> = {
  [Tier.Wood]: 2,
  [Tier.Stone]: 4,
  [Tier.Iron]: 6,
  [Tier.Gold]: 12,
  [Tier.Diamond]: 8,
  [Tier.Netherite]: 9,
};

// Mining level used by the can-harvest (1.5x vs 5x) speed split.
export const TIER_LEVEL: Record<Tier, number> = {
  [Tier.Wood]: 0,
  [Tier.Stone]: 1,
  [Tier.Iron]: 2,
  [Tier.Gold]: 0,
  [Tier.Diamond]: 3,
  [Tier.Netherite]: 4,
};

export const TOOL_TYPES: ToolType[] = [ToolType.Pickaxe, ToolType.Axe, ToolType.Shovel, ToolType.Hoe];
export const TIERS: Tier[] = [Tier.Wood, Tier.Stone, Tier.Iron, Tier.Gold, Tier.Diamond, Tier.Netherite];

const TOOL_NAMES: Record<ToolType, string> = {
  [ToolType.Pickaxe]: 'Pickaxe',
  [ToolType.Axe]: 'Axe',
  [ToolType.Shovel]: 'Shovel',
  [ToolType.Hoe]: 'Hoe',
};

const TIER_NAMES: Record<Tier, string> = {
  [Tier.Wood]: 'Wooden',
  [Tier.Stone]: 'Stone',
  [Tier.Iron]: 'Iron',
  [Tier.Gold]: 'Golden',
  [Tier.Diamond]: 'Diamond',
  [Tier.Netherite]: 'Netherite',
};

const MATERIAL_NAMES: Record<Material, string> = {
  [Material.Stick]: 'Stick',
  [Material.Coal]: 'Coal',
  [Material.RawIron]: 'Raw Iron',
  [Material.Diamond]: 'Diamond',
};

export function toolDisplayName(t: ToolType, tier: Tier): string {
  return `${TIER_NAMES[tier]} ${TOOL_NAMES[t]}`;
}

export function materialDisplayName(m: Material): string {
  return MATERIAL_NAMES[m];
}

export function block(id: BlockId): Item {
  return { kind: 'block', block: id };
}

export function tool(t: ToolType, tier: Tier): Item {
  return { kind: 'tool', tool: t, tier };
}

export function material(m: Material): Item {
  return { kind: 'material', material: m };
}

/** Stable string id for an item — used for hotbar diffing and texture caches. */
export function itemKey(item: Item): string {
  if (item.kind === 'block') return 'b:' + item.block;
  if (item.kind === 'tool') return 't:' + item.tool + ':' + item.tier;
  return 'm:' + item.material;
}

/** Stack limit per item: tools are unstackable, everything else stacks to 64. */
export function maxStack(item: Item): number {
  return item.kind === 'tool' ? 1 : 64;
}

/**
 * Seconds to break a block while holding `item`, per the vanilla formula:
 *   time = hardness * (canHarvest ? 1.5 : 5) / speedMultiplier
 * speedMultiplier is the tier multiplier only when the held tool is the correct
 * type for the block (else 1). canHarvest requires no tool, or the correct tool
 * at a high-enough mining level. Returns Infinity for unbreakable blocks.
 */
/** Can this break yield a drop / take the fast 1.5x path? (vanilla rule) */
export function canHarvest(def: BlockDef, item: Item | null): boolean {
  let correct = false;
  let level = 0;
  if (item && item.kind === 'tool') {
    correct = def.tool !== null && item.tool === def.tool;
    if (correct) level = TIER_LEVEL[item.tier];
  }
  return !def.requiresTool || (correct && level >= def.tierNeeded);
}

/** Resolve a block's drop for the held item, or null (wrong tool / no drop). */
export function dropFor(def: BlockDef, held: Item | null): Item | null {
  if (!def.drop || !canHarvest(def, held)) return null;
  if (def.drop.kind === 'self') return { kind: 'block', block: def.id };
  if (def.drop.kind === 'block') return { kind: 'block', block: def.drop.block };
  return { kind: 'material', material: def.drop.material };
}

export function breakSeconds(def: BlockDef, item: Item | null): number {
  if (!Number.isFinite(def.hardness)) return Infinity;
  let speed = 1;
  if (item && item.kind === 'tool' && def.tool !== null && item.tool === def.tool) {
    speed = TIER_SPEED[item.tier];
  }
  return (def.hardness * (canHarvest(def, item) ? 1.5 : 5)) / speed;
}

/** The default 9-slot hotbar: the placeable blocks, exactly as before tools. */
export function defaultHotbar(): Item[] {
  return HOTBAR_BLOCKS.map(block);
}

/** Full catalogue shown in the creative picker: every block + every tool. */
export function allItems(): Item[] {
  const items: Item[] = HOTBAR_BLOCKS.map(block);
  for (const t of TOOL_TYPES) for (const tier of TIERS) items.push(tool(t, tier));
  return items;
}
