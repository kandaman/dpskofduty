/**
 * MovementController — persistent-key keyboard driver for Playwright bot tests.
 *
 * Keeps track of currently-held keys so callers can express desired movement
 * declaratively ({ forward: true, sprint: true }) and only the key deltas
 * are actually pressed/released on the page.
 *
 * Key codes match src/engine/InputManager.js / PlayerController.js
 * (WASD + ShiftLeft for sprint).
 */

const KEY = {
  forward: 'KeyW',
  backward: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  sprint: 'ShiftLeft',
};

const ALL_ACTIONS = Object.keys(KEY);

export class MovementController {
  constructor(page) {
    this.page = page;
    this.state = {};
    for (const action of ALL_ACTIONS) this.state[action] = false;
  }

  /**
   * Press/release keys to match the desired movement state.
   * Unspecified actions are left unchanged.
   * @param {{forward?: boolean, backward?: boolean, left?: boolean, right?: boolean, sprint?: boolean}} desired
   */
  async setMovement(desired) {
    for (const action of ALL_ACTIONS) {
      if (desired[action] === undefined) continue;
      const want = Boolean(desired[action]);
      if (want === this.state[action]) continue;
      this.state[action] = want;
      if (want) {
        await this.page.keyboard.down(KEY[action]);
      } else {
        await this.page.keyboard.up(KEY[action]);
      }
    }
  }

  /** Release every held key. */
  async releaseAll() {
    for (const action of ALL_ACTIONS) {
      if (!this.state[action]) continue;
      this.state[action] = false;
      await this.page.keyboard.up(KEY[action]);
    }
  }

  /** Snapshot of currently-held actions. */
  getState() {
    return { ...this.state };
  }
}
