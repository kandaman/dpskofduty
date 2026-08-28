// ─── PERSISTENT MOVEMENT CONTROLLER ───────────────────────────────────
// Tracks held keyboard state and diffs against desired state so key
// changes are only emitted when needed — no unnecessary key toggles.
//
// Usage:
//   const mc = new MovementController(page);
//   await mc.setMovement({ forward: true, sprint: true });
//   // keys stay held across loop iterations
//   await mc.setMovement({ forward: false });
//   // only releases what changed

export class MovementController {
  constructor(page) {
    this.page = page;
    this._held = {};
    this._keys = ['w', 'a', 's', 'd', 'ShiftLeft', 'ShiftRight'];
    this._keys.forEach(k => this._held[k] = false);
  }

  /**
   * Set desired movement state. Only emits key.down/key.up for keys
   * that actually change state.
   * @param {object} opts
   * @param {boolean} [opts.forward]
   * @param {boolean} [opts.backward]
   * @param {boolean} [opts.left]
   * @param {boolean} [opts.right]
   * @param {boolean} [opts.sprint]   // ShiftLeft
   * @param {boolean} [opts.sprintRight]  // ShiftRight (fallback)
   */
  async setMovement(opts) {
    const map = {
      forward: 'w',
      backward: 's',
      left: 'a',
      right: 'd',
      sprint: 'ShiftLeft',
      sprintRight: 'ShiftRight'
    };

    for (const [optKey, physicalKey] of Object.entries(map)) {
      if (opts[optKey] === undefined) continue;
      const desired = !!opts[optKey];
      if (desired !== this._held[physicalKey]) {
        this._held[physicalKey] = desired;
        try {
          if (desired) {
            await this.page.keyboard.down(physicalKey);
          } else {
            await this.page.keyboard.up(physicalKey);
          }
        } catch (e) {
          // Ignore key-up errors (key may not be held)
        }
      }
    }
  }

  /** Release all movement keys */
  async releaseAll() {
    for (const k of this._keys) {
      if (this._held[k]) {
        this._held[k] = false;
        try { await this.page.keyboard.up(k); } catch (e) {}
      }
    }
  }

  /** Release only the sprint key */
  async releaseSprint() {
    if (this._held.ShiftLeft) {
      this._held.ShiftLeft = false;
      try { await this.page.keyboard.up('ShiftLeft'); } catch (e) {}
    }
    if (this._held.ShiftRight) {
      this._held.ShiftRight = false;
      try { await this.page.keyboard.up('ShiftRight'); } catch (e) {}
    }
  }

  /** @returns {{ forward, backward, left, right, sprint }} */
  getState() {
    return {
      forward: this._held.w,
      backward: this._held.s,
      left: this._held.a,
      right: this._held.d,
      sprint: this._held.ShiftLeft
    };
  }

  /** True if any movement key (WASD) is held */
  isMoving() {
    return this._held.w || this._held.s || this._held.a || this._held.d;
  }

  /** @returns {string} human-readable state */
  toString() {
    const parts = [];
    if (this._held.w) parts.push('FWD');
    if (this._held.s) parts.push('BWD');
    if (this._held.a) parts.push('L');
    if (this._held.d) parts.push('R');
    if (this._held.ShiftLeft) parts.push('SPRINT');
    return parts.join('+') || '(stopped)';
  }
}
