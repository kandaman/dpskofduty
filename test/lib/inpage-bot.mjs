/**
 * In-page bot controller — the whole combat FSM runs INSIDE the browser page
 * at rAF rate, eliminating the evaluate round-trips that capped the old
 * Node-side loop's reaction time at ~100-300ms per decision.
 *
 * Injected via ctx.addInitScript(INPAGE_BOT_INIT). It activates automatically
 * once window.game exists, so it survives page reloads across all 3 runs.
 *
 * Node's role shrinks to: poll window.__bot.status, log, screenshot, handle
 * run-end (victory/death). Zero per-frame evaluates.
 *
 * State lessons carried over from the v1 Node-side FSM (32 cycles):
 *  - Rushers are the #1 target at ANY range (melee in ~2.5s otherwise)
 *  - <0.5m the aim math refuses to track → NEVER let a rusher get close;
 *    kite with sprint bursts + fire windows (fire is blocked ~250ms after
 *    sprinting — isSprintBlocked — checked per frame here, for free)
 *  - Hold-fire + per-frame re-aim beats burst timing; ADS halves spread
 *  - Reload on the move (walk, never sprint), R held until isReloading acks
 */
export function INPAGE_BOT_INIT() {
  var bot = {
    active: true,
    version: 2,
    status: {
      ok: false, started: false, state: 'IDLE', hp: 100, ammo: 30, reserve: 360,
      wave: 0, waveState: '', kills: 0, deaths: 0, victory: false, gameOver: false,
      enemies: 0, nearestDist: 999, ticks: 0, lastUpdate: 0
    }
  };
  window.__bot = bot;

  // ── synthetic input (same document-event mechanism as __botFire) ──
  var pressed = {}; // code → bool (our own view of key state)
  function key(code, down) {
    if (!!pressed[code] === down) return;
    pressed[code] = down;
    document.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code: code, bubbles: true }));
  }
  function mouse(btn, down) {
    document.dispatchEvent(new MouseEvent(down ? 'mousedown' : 'mouseup', { button: btn, bubbles: true }));
  }
  var firing = false, ads = false;
  function setFiring(on) { if (firing !== on) { firing = on; mouse(0, on); } }
  function setAds(on) { if (ads !== on) { ads = on; mouse(2, on); } }
  function releaseAll() {
    var codes = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'KeyR'];
    for (var i = 0; i < codes.length; i++) key(codes[i], false);
    setFiring(false); setAds(false);
  }

  // Aim the camera at world point (tx,tz) at eye-height 1.7 → target height th
  function aim(g, tx, tz, th) {
    var px = g.player.position.x, pz = g.player.position.z;
    var dx = tx - px, dz = tz - pz;
    var dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 0.05) return false;
    var yaw = -Math.atan2(dx, -dz);
    var pitch = Math.atan2((th === undefined ? 1.25 : th) - 1.7, dist);
    var c = g.camera;
    c.yaw = yaw; c.pitch = pitch;
    c.velocity.yaw = 0; c.velocity.pitch = 0;
    c.shakeAmount = 0; c.shakeOffset.set(0, 0, 0);
    c.rollAmount = 0; c.bobOffset.set(0, 0, 0); c.bobSpeed = 0;
    c.camera.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
    return true;
  }
  function aimYaw(g, yaw) {
    var c = g.camera;
    c.yaw = yaw; c.pitch = 0;
    c.velocity.yaw = 0; c.velocity.pitch = 0;
    c.shakeAmount = 0; c.shakeOffset.set(0, 0, 0);
    c.rollAmount = 0; c.bobOffset.set(0, 0, 0); c.bobSpeed = 0;
    c.camera.quaternion.setFromEuler(new THREE.Euler(0, yaw, 0, 'YXZ'));
  }
  // yaw toward (tx,tz) from player
  function yawTo(g, tx, tz) {
    var dx = tx - g.player.position.x, dz = tz - g.player.position.z;
    if (Math.sqrt(dx * dx + dz * dz) < 0.05) return null;
    return -Math.atan2(dx, -dz);
  }

  // Pick an escape heading: away from the threat, with obstacle clearance
  // scored via short raycasts (in-page equivalent of findBestEscapeHeading).
  function escapeYaw(g, threatX, threatZ) {
    var p = g.player.position;
    var away = yawTo(g, p.x * 2 - threatX, p.z * 2 - threatZ);
    if (away === null) return 0;
    var obs = g.level ? g.level.getObstacleMeshes() : [];
    var best = away, bestScore = -Infinity;
    var offsets = [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6];
    for (var i = 0; i < offsets.length; i++) {
      var y = away + offsets[i];
      var dir = new THREE.Vector3(Math.sin(y), 0, -Math.cos(y));
      var clear = 12;
      if (obs.length) {
        var rc = new THREE.Raycaster(new THREE.Vector3(p.x, 0.9, p.z), dir);
        rc.far = 12;
        var hits = rc.intersectObjects(obs, false);
        clear = hits.length ? hits[0].distance : 12;
      }
      var score = Math.min(clear, 12) - Math.abs(offsets[i]) * 2;
      if (score > bestScore) { bestScore = score; best = y; }
    }
    return best;
  }

  // LOS from player to (x,z) at waist height (0.8) — conservative
  function los(g, x, z) {
    var p = g.player.position;
    var st0 = new THREE.Vector3(p.x, 0.8, p.z);
    var en0 = new THREE.Vector3(x, 0.8, z);
    var d0 = new THREE.Vector3().subVectors(en0, st0);
    var dist0 = d0.length();
    if (dist0 < 0.5) return true;
    d0.normalize();
    var obs0 = g.level ? g.level.getObstacleMeshes() : [];
    if (!obs0.length) return true;
    var rc0 = new THREE.Raycaster();
    rc0.set(st0, d0); rc0.far = dist0 + 0.1;
    var hits0 = rc0.intersectObjects(obs0, false);
    return hits0.length === 0 || hits0[0].distance >= dist0;
  }

  // ── FSM ──
  var st = { name: 'ENGAGE', timer: 0, strafe: 1, strafeTimer: 0,
             kitePhase: 0, reloadAck: false, retreatYaw: 0, lastNow: 0 };

  function setState(s) { if (st.name !== s) { st.name = s; st.timer = 0; st.kitePhase = 0; st.reloadAck = false; } }

  function tick(now) {
    var g = window.game;
    if (!g || !g.running || !g.enemyManager || !g.waveManager) { releaseAll(); return; }
    if (g.input && !g.input.locked) g.input.locked = true;

    // real dt (works at both 60fps headed and ~6fps swiftshader headless)
    var dt = Math.min((now - (st.lastNow || now)) / 1000, 0.5);
    st.lastNow = now;

    var wc = g.weaponController, p = g.player;
    var ammo = 0, reserve = 0, reloading = false, sprintBlocked = false;
    try { ammo = wc.currentWeapon.ammo; reserve = wc.currentWeapon.stats.reserveAmmo;
          reloading = wc.isReloading; sprintBlocked = wc.isSprintBlocked; } catch (e) {}

    // enemies
    var enemies = [];
    var ee = g.enemyManager.enemies;
    for (var i = 0; i < ee.length; i++) {
      var e = ee[i];
      if (e && e.alive) {
        enemies.push({ x: e.position.x, z: e.position.z, hp: e.health, type: e.type, dist: p.position.distanceTo(e.position) });
      }
    }
    var rusher = null, nearest = null;
    for (var r = 0; r < enemies.length; r++) {
      var en = enemies[r];
      if (en.type === 'rusher' && (!rusher || en.dist < rusher.dist)) rusher = en;
      if (!nearest || en.dist < nearest.dist) nearest = en;
    }
    // target: rusher anywhere outranks any other
    var target = rusher || nearest;

    var ws = g.waveManager.state;
    var hp = p.health;

    // status for Node polling
    var s = bot.status;
    s.ok = true; s.started = true; s.state = st.name; s.hp = hp;
    s.ammo = ammo; s.reserve = reserve; s.wave = g.waveManager.currentWave;
    s.waveState = ws; s.kills = g.enemyManager.killCount || 0; s.victory = !!g.waveManager.victoryAchieved;
    s.gameOver = !!g.gameOver; s.enemies = enemies.length;
    s.nearestDist = nearest ? nearest.dist : 999;
    s.ticks++; s.lastUpdate = now;

    // dead or between waves → hands off (also resets combat state)
    if (g.gameOver || hp <= 0) { releaseAll(); setState('ENGAGE'); return; }
    if (ws !== 'active') { releaseAll(); setState('ENGAGE'); return; }

    st.timer += dt;

    // ── states ──
    if (st.name === 'RELOAD') {
      setFiring(false); setAds(false);
      if (rusher && rusher.dist < 7) { setState('KITE'); }
      else if (!reloading && st.timer > 0.3 && (ammo > 0 || reserve <= 0)) {
        setState(target ? 'ENGAGE' : 'SEARCH');
      } else if (st.timer > 5) { setState(target ? 'ENGAGE' : 'SEARCH'); }
      else {
        // face target and walk forward while reloading (never sprint)
        if (target) aim(g, target.x, target.z, 1.25);
        key('ShiftLeft', false);
        key('KeyS', false); key('KeyA', false); key('KeyD', false);
        key('KeyW', true);
        if (!st.reloadAck && !reloading && st.timer > 0.1) {
          key('KeyR', true); st.reloadAck = true;
        } else if (st.reloadAck) {
          key('KeyR', false);
        }
      }
      return;
    }

    if (st.name === 'KITE') {
      if (!rusher) { setState('ENGAGE'); }
      else if (rusher.dist > 14) { setState('ENGAGE'); } // ENGAGE re-routes to RETREAT if hp low
      else {
        if (st.kitePhase === 0) {
          // sprint burst away from the rusher
          setFiring(false); setAds(false);
          key('KeyS', false); // release backpedal or W+S cancel out
          aimYaw(g, escapeYaw(g, rusher.x, rusher.z));
          key('KeyW', true); key('ShiftLeft', true);
          if (st.timer > 1.0) { st.kitePhase = 1; st.timer = 0; }
        } else {
          // turn back at the rusher and BACKPEDAL (W here would walk INTO
          // the rusher — camera faces it), hold fire as sprint-block clears
          key('KeyW', false); key('KeyS', true); key('ShiftLeft', false);
          aim(g, rusher.x, rusher.z, 1.25);
          setAds(true);
          setFiring(!sprintBlocked && los(g, rusher.x, rusher.z));
          // rusher too close (or dead) → back to sprinting immediately
          if (st.timer > 0.8 || !rusher || rusher.dist < 3.5) { st.kitePhase = 0; st.timer = 0; }
        }
      }
      return;
    }

    if (st.name === 'RETREAT') {
      if (rusher && rusher.dist < 10) { setState('KITE'); }
      else if (hp >= 65 || st.timer > 8) { setState('ENGAGE'); }
      else {
        // re-pick heading once a second
        if (st.timer < 0.05 || st.timer - (st.retreatPick || 0) > 1) {
          st.retreatPick = st.timer;
          st.retreatYaw = target ? escapeYaw(g, target.x, target.z) : st.retreatYaw;
        }
        aimYaw(g, st.retreatYaw);
        setAds(false); setFiring(false);
        key('KeyW', true); key('ShiftLeft', true);
      }
      return;
    }

    if (st.name === 'SEARCH') {
      setAds(false); setFiring(false);
      key('ShiftLeft', false);
      if (target) { setState('ENGAGE'); }
      else if (ammo < 30 && reserve > 0 && !reloading) { setState('RELOAD'); }
      else {
        // slow strafe wander
        st.strafeTimer += dt;
        if (st.strafeTimer > 1.2) { st.strafeTimer = 0; st.strafe = -st.strafe; }
        key('KeyW', false);
        key('KeyA', st.strafe > 0);
        key('KeyD', st.strafe < 0);
      }
      return;
    }

    if (st.name === 'RESUPPLY') {
      var pk = g.ammoPickup;
      if (!pk || !pk.active || reserve > 60) { setState(target ? 'ENGAGE' : 'SEARCH'); }
      else if (rusher && rusher.dist < 7) { setState('KITE'); }
      else {
        var py = yawTo(g, pk.mesh.position.x, pk.mesh.position.z);
        if (py !== null) aimYaw(g, py);
        key('KeyW', true); key('ShiftLeft', false);
        key('KeyA', false); key('KeyD', false);
        setFiring(false); setAds(false);
      }
      return;
    }

    // ══ ENGAGE (default) ══
    if (!target) { setState('SEARCH'); return; }
    if (ammo <= 0 && reserve > 0 && !reloading) { setState('RELOAD'); return; }
    if (ammo <= 3 && !reloading && (!nearest || nearest.dist > 20)) { setState('RELOAD'); return; }
    if (reserve < 30 && g.ammoPickup && g.ammoPickup.active) { setState('RESUPPLY'); return; }
    if (rusher && rusher.dist < 7) { setState('KITE'); return; }
    if (hp < 40 && (!rusher || rusher.dist > 6)) { setState('RETREAT'); return; }

    // combat: aim every frame, hold ADS + fire — but ONLY with clear LOS.
    // Without this the bot pumps full mags into the crate an enemy hides
    // behind (the #1 silent ammo sink found by the hit-point probe).
    var visible = los(g, target.x, target.z);
    aim(g, target.x, target.z, 1.25);
    setAds(true);
    setFiring(!sprintBlocked && visible);

    // movement: backpedal from a closing rusher; strafe otherwise. If no
    // LOS, bias movement to close the distance / change angle instead.
    st.strafeTimer += dt;
    if (st.strafeTimer > (0.8 + Math.random() * 0.6)) {
      st.strafeTimer = 0; st.strafe = -st.strafe;
    }
    var backpedal = visible && target.dist < 10;
    key('KeyW', !visible && target.dist > 4);
    key('KeyA', st.strafe > 0);
    key('KeyD', st.strafe < 0);
    key('KeyS', backpedal && visible);
    key('ShiftLeft', false);
  }

  // ── driver: hook the game's own loop ──
  // CRITICAL ORDERING: the bot must run AFTER the game's update in each
  // frame. A plain rAF registered from the init script runs BEFORE the
  // game's rAF (registered later), making every aim one frame stale —
  // 0.15-0.3s in headless — and the shots miss. Wrapping _boundLoop makes
  // the aim land right after the game's update, so the next frame's
  // fire-raycast uses a zero-staleness direction.
  function activate() {
    var g = window.game;
    if (!g || !g._boundLoop || g.__botHooked) return false;
    g.__botHooked = true;
    var origLoop = g._boundLoop;
    g._boundLoop = function() {
      origLoop();
      if (!bot.active) return;
      try { tick(performance.now()); } catch (err) {
        bot.status.state = 'ERROR: ' + (err && err.message ? err.message : String(err));
      }
    };
    return true;
  }
  var iv = setInterval(function() {
    if (activate()) clearInterval(iv);
  }, 100);
}
