// ---------------------------------------------------------------------------
// Global constants shared across modules. Keep gameplay-tunable numbers here.
// ---------------------------------------------------------------------------

// Chunk dimensions: 16 wide (x) x 128 tall (y) x 16 deep (z).
export const CHUNK_SX = 16;
export const CHUNK_SY = 128;
export const CHUNK_SZ = 16;
export const CHUNK_AREA = CHUNK_SX * CHUNK_SZ;
export const CHUNK_VOL = CHUNK_SX * CHUNK_SY * CHUNK_SZ;

// World vertical reference points.
export const SEA_LEVEL = 62;

// How many chunks to keep meshed around the player. RD 8 -> 17x17 columns.
export const RENDER_DISTANCE = 8;

// Light level range (Minecraft uses 0..15).
export const MAX_LIGHT = 15;

// Per-block storage index. y-major so vertical columns are contiguous-ish and
// the top-down lighting / heightmap passes are cache friendly.
export function blockIndex(x: number, y: number, z: number): number {
  return (y * CHUNK_SZ + z) * CHUNK_SX + x;
}

// Chunk key helpers (chunk coordinates -> string key for the Map).
export function chunkKey(cx: number, cz: number): string {
  return cx + ',' + cz;
}

// Floor-divide that works for negatives (JS % and / round toward zero).
export function floorDiv(a: number, b: number): number {
  return Math.floor(a / b);
}

// Proper modulo for negatives (e.g. mod(-1, 16) === 15).
export function mod(a: number, b: number): number {
  return ((a % b) + b) % b;
}
