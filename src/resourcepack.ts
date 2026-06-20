// ---------------------------------------------------------------------------
// Resource-pack loader. Reads the standard layout
//   assets/minecraft/textures/block/<name>.png
// from a locally-selected folder and swaps the matching procedural tiles, so
// any pack the user owns can be dropped in for an exact look. (No assets are
// bundled — the user supplies their own.)
// ---------------------------------------------------------------------------

import { TILE_NAMES, TILE_COUNT } from './blocks';
import { TILE_RES } from './textures';

function drawToTile(img: HTMLImageElement): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = TILE_RES;
  cv.height = TILE_RES;
  const ctx = cv.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  // Take the first square frame (handles animated strips like water_still that
  // stack frames vertically) and scale it to our tile resolution.
  const frame = Math.min(img.width, img.height) || img.width;
  ctx.drawImage(img, 0, 0, frame, frame, 0, 0, TILE_RES, TILE_RES);
  return cv;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

export interface PackResult {
  replaced: number;
  total: number;
}

/**
 * Replace entries of `tiles` in place with textures found in the picked folder.
 * Returns how many of the known tiles were matched.
 */
export async function loadResourcePack(files: FileList, tiles: HTMLCanvasElement[]): Promise<PackResult> {
  // index pngs under .../textures/block/ by base filename
  const byName = new Map<string, File>();
  for (const f of Array.from(files)) {
    const path = ((f as any).webkitRelativePath || f.name).replace(/\\/g, '/').toLowerCase();
    if (!path.endsWith('.png')) continue;
    if (!path.includes('textures/block/')) continue;
    const base = path.slice(path.lastIndexOf('/') + 1).replace('.png', '');
    byName.set(base, f);
  }

  let replaced = 0;
  for (let i = 0; i < TILE_COUNT; i++) {
    const want = TILE_NAMES[i];
    const file = byName.get(want);
    if (!file) continue;
    try {
      const img = await loadImage(file);
      tiles[i] = drawToTile(img);
      replaced++;
    } catch {
      // skip unreadable file, keep the procedural tile
    }
  }
  return { replaced, total: TILE_COUNT };
}
