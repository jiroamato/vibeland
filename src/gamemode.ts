// ---------------------------------------------------------------------------
// Game modes. Creative is the original sandbox (fly, infinite picker, no
// drops); survival adds the gathering loop. The rules object is the single
// place systems consult, so slice 2-5 features hang new flags here.
// ---------------------------------------------------------------------------

export type GameMode = 'creative' | 'survival';

export interface GameRules {
  fly: boolean; // F / double-space fly toggle available
  picker: boolean; // E opens the creative item picker
  drops: boolean; // breaking spawns item entities
  consumeOnPlace: boolean; // placing decrements the held stack
}

export function rulesFor(mode: GameMode): GameRules {
  const creative = mode === 'creative';
  return { fly: creative, picker: creative, drops: !creative, consumeOnPlace: !creative };
}
