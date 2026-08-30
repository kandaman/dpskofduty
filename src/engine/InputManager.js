export class InputManager {
  constructor() {
    this.keys = {};
    this.mouse = { x: 0, y: 0, dx: 0, dy: 0, buttons: {} };
    this.mouseSensitivity = 0.002;
    this.locked = false;
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
    this._onPointerLockChange = this._onPointerLockChange.bind(this);

    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('keyup', this._onKeyUp);
    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('mousedown', this._onMouseDown);
    document.addEventListener('mouseup', this._onMouseUp);
    document.addEventListener('pointerlockchange', this._onPointerLockChange);
  }

  _onKeyDown(e) {
    this.keys[e.code] = true;
    this.lastKeyCode = e.code + (e.isComposing ? ' (IME)' : '');
    if (['ShiftLeft','ShiftRight','ControlLeft','ControlRight','AltLeft','AltRight'].includes(e.code)) {
      e.preventDefault();
    }
  }

  _onKeyUp(e) {
    this.keys[e.code] = false;
  }

  _onMouseMove(e) {
    if (!this.locked) return;
    this.mouse.dx += e.movementX;
    this.mouse.dy += e.movementY;
    this.mouse.x += e.movementX;
    this.mouse.y += e.movementY;
  }

  _onMouseDown(e) {
    this.mouse.buttons[e.button] = true;
  }

  _onMouseUp(e) {
    this.mouse.buttons[e.button] = false;
  }

  _onPointerLockChange() {
    this.locked = document.pointerLockElement !== null;
  }

  lock() {
    // Chrome returns a promise; it rejects on the Esc-cooldown — swallow it
    const p = document.body.requestPointerLock();
    if (p && p.catch) p.catch(() => {});
  }

  unlock() {
    document.exitPointerLock();
  }

  isKeyDown(code) {
    return !!this.keys[code];
  }

  isMouseDown(button = 0) {
    return !!this.mouse.buttons[button];
  }

  consumeMouseDelta() {
    const dx = this.mouse.dx;
    const dy = this.mouse.dy;
    this.mouse.dx = 0;
    this.mouse.dy = 0;
    return { dx, dy };
  }

  updateSensitivity(val) {
    this.mouseSensitivity = val;
  }

  dispose() {
    document.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('keyup', this._onKeyUp);
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('mousedown', this._onMouseDown);
    document.removeEventListener('mouseup', this._onMouseUp);
    document.removeEventListener('pointerlockchange', this._onPointerLockChange);
  }
}
