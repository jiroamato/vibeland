// ---------------------------------------------------------------------------
// Survival health: 20 HP (10 hearts, half-heart granularity). The passive
// 1 HP / 4 s regen stands in for the milestone's excluded hunger system —
// peaceful-difficulty style — so fall damage is recoverable. Pure logic.
// ---------------------------------------------------------------------------

export const MAX_HP = 20;

const REGEN_INTERVAL = 4; // seconds per healed HP
const EPS = 1e-6;

export class Health {
  hp = MAX_HP;
  private regenTimer = 0;

  get dead(): boolean {
    return this.hp <= 0;
  }

  /** Lose n HP (clamped at 0). Taking damage restarts the regen interval. */
  damage(n: number): void {
    if (n <= 0) return;
    this.hp = Math.max(0, this.hp - n);
    this.regenTimer = 0;
  }

  heal(n: number): void {
    this.hp = Math.min(MAX_HP, this.hp + n);
  }

  /** Advance passive regen; true when hp changed (repaint the hearts). */
  tick(dt: number): boolean {
    if (this.dead || this.hp >= MAX_HP) {
      this.regenTimer = 0;
      return false;
    }
    this.regenTimer += dt;
    if (this.regenTimer < REGEN_INTERVAL) return false;
    this.regenTimer -= REGEN_INTERVAL;
    this.heal(1);
    return true;
  }

  reset(): void {
    this.hp = MAX_HP;
    this.regenTimer = 0;
  }
}

/** Vanilla fall damage: 1 HP per block beyond 3, rounded up. */
export function fallDamage(dist: number): number {
  return Math.max(0, Math.ceil(dist - 3 - EPS));
}
