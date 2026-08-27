# PHASE 3 SURVIVAL HARDENING & EVIDENCE LOCK — Implementation Plan

## Context

Phase 3 is NOT complete: the latest clean bot reaches Wave 2 at best, dying to basic riflemen due to standing in LOS too long, retreating too late (HP < 20), and starting RECOVER while enemies still have clear LOS. Additionally, camera-shake cheating exists in test helpers, a real ammo-pickup restart bug inflates starting reserve, result evidence lacks identity fields, and the anti-cheat audit misses camera effects. This plan addresses ALL outstanding items systematically with staged validation.

---

## File Inventory

### Game source (production code to fix):
- `src/Game.js` — `restart()` missing `ammoPickup.reset()`
- `src/gameplay/AmmoPickup.js` — has `reset()` method, already works correctly

### Test/bot code (to modify):
- `test/phase3-acceptance.mjs` — main acceptance runner: remove camera-shake cheating, overhaul combat state machine, add evidence identity fields, add play-again ammo regression test
- `test/playthrough-test.mjs` — remove camera-shake cheating
- `test/victory-flow-test.mjs` — remove camera-shake cheating
- `test/results/` — result files to generate with proper identity fields

---

## Implementation Sections

### A. Remove Camera-Shake Cheating (test code only)

**Files:** `test/phase3-acceptance.mjs`, `test/playthrough-test.mjs`, `test/victory-flow-test.mjs`

**Changes in `aimAt()` and `aimDirection()`:**
- Remove `c.shakeAmount=0;`
- Remove `c.shakeOffset.set(0,0,0);`

Only these remain:
```js
c.yaw=yaw; c.pitch=pitch; c.velocity.yaw=0; c.velocity.pitch=0;
var euler=new THREE.Euler(pitch,yaw,0,"YXZ"); c.camera.quaternion.setFromEuler(euler);
```

**Note:** `phase3-acceptance.mjs` lines 96, 102; `playthrough-test.mjs` lines 40, 44 already clean (no shake writes); `victory-flow-test.mjs` lines 39, 43 already clean. Only `phase3-acceptance.mjs` needs fixing.

---

### B. Fix Real Play-Again Ammo Bug (production code)

**File:** `src/Game.js` method `restart()`

**Problem:** `restart()` resets weapon ammo/reserve but does NOT call `this.ammoPickup.reset()`. If an ammo pickup was active when the player died, its mesh persists. On restart, the player spawns at origin. If the pickup was near origin, auto-collect at distance < 3.0 immediately grants `magSize * 2 = 60` extra reserve, inflating reserve from 360 to 420.

**Fix:** Add `this.ammoPickup.reset();` in `restart()` after the existing system resets (~line 366, after `this.waveManager.reset()`).

After fix, reserve should be 360 on every restart before any pickup collection.

---

### C. Overhaul Combat State Machine (test code)

**File:** `test/phase3-acceptance.mjs` — the `playThrough()` function and state machine

#### C1. HP Thresholds (updated from current LOW=20, MEDIUM=40, HIGH=65)

```js
var HP_THRESHOLD = {
  CRITICAL: 25,    // Emergency — break LOS, survive
  LOW: 40,         // Retreat immediately, don't engage riflemen
  MEDIUM: 60,      // Retreat/reposition unless close threat dies fast
  HIGH: 75,        // Defensive engage: short exposure, short bursts
  SAFE: 90         // Normal engage
};
```

#### C2. Damage Rate Tracking

Add to `playThrough()`:

```js
// Track damage over rolling windows
var damageLog = [];  // entries: { time, hp }
var damageTakenLast1s = 0;
var damageTakenLast2s = 0;
var damageTakenLast3s = 0;
```

Update each loop iteration — compare current HP to previous HP, push to log, and compute rolling sums by filtering entries within each time window.

**Damage-rate emergency override:**
```js
if (damageTakenLast1s > 25 || damageTakenLast2s > 35) {
  // Immediate RETREAT regardless of current HP
}
```

#### C3. New State Transition Logic

**ENGAGE → RETREAT triggers (in priority order):**
1. `damageTakenLast1s > 25` → immediate RETREAT (damage-rate emergency)
2. `hp < HP_THRESHOLD.CRITICAL` → RETREAT immediately, no shooting at non-rushers
3. `hp < HP_THRESHOLD.LOW` → RETREAT, only fire at close rushers (< 8m)
4. `hp < HP_THRESHOLD.MEDIUM` → RETREAT unless a very close target can be killed instantly (< 5m, < 30 HP)
5. `hp < HP_THRESHOLD.HIGH` → defensive ENGAGE (short bursts, prefer cover)

**RETREAT state behavior:**
- Move away from nearest threat
- After moving, verify LOS is actually broken via `checkLOSBetweenPoints`
- If LOS still clear: keep moving, do NOT enter RECOVER
- Only transition to RECOVER when `majorThreatLOS == false && damageTakenLast1s < 5`

**RECOVER state behavior (replaces fixed 6s timer):**
- Must have: `numEnemiesWithLOS === 0 && damageTakenLast1s < 5`
- Recovery targets: if HP < 40 → recover to ≥ 75; if HP 40-60 → recover to ≥ 80; if HP > 60 → re-engage sooner
- If LOS becomes true during RECOVER → immediately transition to RETREAT
- If a rusher enters < 8m → interrupt recovery, engage or retreat

#### C4. Active LOS Threat Tracking

Add to state reading each loop:
```js
// Count enemies with LOS
var numEnemiesWithLOS = 0;
var highestThreatWithLOS = null;
var nearestThreatWithLOS = null;
```

Compute by checking LOS from player position to each enemy position. Then:
- `numEnemiesWithLOS >= 2` → much more defensive behavior
- `numEnemiesWithLOS >= 3` → immediate RETREAT/REPOSITION

#### C5. Contextual Target Priority (updated `chooseTarget`)

Current prioritizes snipers too heavily regardless of context.

New scoring:
```js
// Rusher < 8m: highest priority (emergency)
if (e.type === 'rusher' && e.dist < 8) score += 10000;
// Close rusher < 12m: very high
if (e.type === 'rusher' && e.dist < 12) score += 5000 - e.dist * 100;
// Low-HP enemy: quick kill
if (e.hp < 30) score += 3000 + (100 - e.hp) * 10;
// Sniper with LOS: high priority (but only if visible)
if (e.type === 'sniper') score += 4500;  // reduced from 5000
// Rifleman shooting at us (< 15m): high
if (e.type === 'rifleman' && e.dist < 15) score += 2500;
// Boss: medium priority
if (e.type === 'boss') score += 1500;
// Distance factor: prefer closer
score += Math.max(0, 80 - e.dist) * 2;
```

#### C6. Micro-Exposure Combat (new fire pattern)

Replace the current "stop, fire 3 shots while stopped" with:
```js
// Micro-exposure fire pattern:
// 1. Stop movement briefly
await releaseMovementKeys(page);
// 2. Small settle delay (shorter — ~50ms)
await sleep(50);
// 3. Re-aim at target
await aimAt(page, target.x, target.z, 1.25);
// 4. Fire calculated burst based on target state
var burstCount = calculateBurstCount(target, ammo);
for (var si = 0; si < burstCount && ammo > 0; si++) {
  await aimAt(page, target.x, target.z, 1.25);
  await page.mouse.down();
  await sleep(25);
  await page.mouse.up();
  await sleep(50);
  // Update ammo
  var liveAmmo = await gameEval(page, 'game.weaponController.currentWeapon.ammo');
  if (typeof liveAmmo === 'number') ammo = liveAmmo;
}
// 5. Immediately start moving again
```

**`calculateBurstCount(target)`:**
- Rifleman at 100 HP: 2-4 aimed shots
- Rifleman < 30 HP: 1-2 shots  
- Rusher (close): 3-5 shots (urgency)
- Sniper: 1-2 shots (short exposure)
- Boss: 2-3 shots (controlled, maintain survival)

#### C7. Cover Selection Improvement

Update `findCover()` to:
1. Verify each candidate actually blocks LOS between player and nearest threat
2. Score by: number of dangerous LOS lines blocked × distance suitability × escape options
3. Use obstacle dimensions to compute a position ON THE PROTECTED SIDE, not at obstacle center

Update `getCoverPosition()`:
```js
function getCoverPosition(cover, obstacleSize, avgTx, avgTz) {
  // Compute position on side of obstacle opposite to threats
  var dx = cover.x - avgTx;
  var dz = cover.z - avgTz;
  var dist = Math.hypot(dx, dz);
  if (dist < 0.1) return { x: cover.x + 3, z: cover.z };
  var nx = dx / dist, nz = dz / dist;
  // Position at obstacle edge + 2 units on protected side
  var halfSize = Math.max(obstacleSize?.width || 1.5, obstacleSize?.depth || 1.5) / 2;
  return { x: cover.x + nx * (halfSize + 2), z: cover.z + nz * (halfSize + 2) };
}
```

---

### D. Anti-Cheat Audit (test code)

**File:** `test/phase3-acceptance.mjs` — `auditForCheats()` function

Add to the `forbiddenPatterns` array (after the existing ~pattern at line ~1208):

```js
{ pattern: 'shakeAmount =', desc: 'Camera shake clear' },
{ pattern: 'shakeOffset.set', desc: 'Camera shake offset write' },
{ pattern: 'bobOffset.set', desc: 'Head bob offset write' },
{ pattern: 'recoil =', desc: 'Recoil override' },
```

Update the `filesToAudit` to include `playthrough-test.mjs` and `victory-flow-test.mjs` (already included, verify).

---

### E. Result Evidence Identity Fields (test code)

**File:** `test/phase3-acceptance.mjs` — `runPhase3()` function and result writing

#### E1. Generate acceptanceRunId at startup:
```js
var acceptanceRunId = 'p3-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
```

#### E2. Get actual git commit:
```js
import { execSync } from 'child_process';
var gitCommit = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
```

#### E3. Each run result gets identity fields:
```js
var result = {
  gitCommit: gitCommit,
  acceptanceRunId: acceptanceRunId,
  startedAt: new Date(runStartTime).toISOString(),
  finishedAt: new Date().toISOString(),
  ...existingMetrics
};
```

#### E4. Stale evidence cleanup at startup:
```js
// Delete stale temporary result files at startup
var staleFiles = ['phase3-run-1.json', 'phase3-run-2.json', 'phase3-run-3.json'];
for (var sf of staleFiles) {
  var sfPath = path.join(RESULT_DIR, sf);
  if (fs.existsSync(sfPath)) fs.unlinkSync(sfPath);
}
```

#### E5. Verification at completion:
```js
for (var ri = 0; ri < runResults.length; ri++) {
  var rr = runResults[ri];
  assert(rr.gitCommit === gitCommit, 'Run ' + (ri+1) + ' gitCommit matches HEAD');
  assert(rr.acceptanceRunId === acceptanceRunId, 'Run ' + (ri+1) + ' acceptanceRunId matches');
}
```

---

### F. Phase 3 Summary (test code)

**File:** `test/phase3-acceptance.mjs` — after all runs complete

Generate:
```js
var phase3Summary = {
  gitCommit: gitCommit,
  acceptanceRunId: acceptanceRunId,
  realInput: realInputPass ? 'PASS' : 'FAIL',
  behavioral: behavioralPass ? 'PASS' : 'FAIL',
  antiCheat: auditPassed ? 'PASS' : 'FAIL',
  runtimeErrors: allErrors.length,
  runs: runResults.map(function(r, i) { return {
    run: 'Run' + (i + 1),
    victory: r.reachedVictory,
    wavesCompleted: r.wavesCompleted,
    kills: r.kills,
    deaths: r.deaths,
    shots: r.shotsFired,
    hits: r.hits,
    headshots: r.headshots,
    accuracy: r.shotsFired > 0 ? (r.hits / r.shotsFired * 100).toFixed(1) + '%' : 'N/A',
    duration: r.duration.toFixed(1) + 's',
    startingReserve: r.startingReserve,
    errors: r.runtimeErrors ? r.runtimeErrors.length : 0
  }; }),
  phase3Complete: runResults.length === 3 && runResults.every(function(r) { return r && r.reachedVictory; })
};
fs.writeFileSync(path.join(RESULT_DIR, 'phase3-summary.json'), JSON.stringify(phase3Summary, null, 2));
```

---

### G. Play Again Ammo Regression Test

**File:** `test/phase3-acceptance.mjs` — `verifyRestartState()` function

Update to add ammoPickup state check:
```js
async function verifyRestartState(page) {
  // Existing checks...
  await sleep(300); // Small delay for pickup timer to settle
  var pickupActive = await gameEval(page, 'game.ammoPickup.active');
  assert(!pickupActive, 'Ammo pickup inactive after restart');
  // Verify reserve BEFORE any pickup can be collected
  // (player spawns at origin, pickups spawn >5 units away)
}
```

Add after `clickPlayAgain` and before waiting for Wave 1:
```js
// ═══ Play Again ammo regression check ═══
var startHp = await gameEval(page, 'game.player.health');
var startAmmo = await gameEval(page, 'game.weaponController.currentWeapon.ammo');
var startReserve = await gameEval(page, 'game.weaponController.currentWeapon.stats.reserveAmmo');
var startScore = await gameEval(page, 'game.score');
var startEnemies = await gameEval(page, 'game.enemyManager.enemies.length');
var startWave = await gameEval(page, 'game.waveManager.currentWave');
var startPickupActive = await gameEval(page, 'game.ammoPickup.active');

assert(startHp === 100, 'HP = 100 after restart');
assert(startAmmo === 30, 'Ammo = 30 after restart');
assert(startReserve === 360, 'Reserve = 360 after restart (got ' + startReserve + ')');
assert(startScore === 0, 'Score = 0 after restart');
assert(startEnemies === 0, 'Enemies cleared after restart');
assert(startWave === 0 || startWave === 1, 'Wave reset to 0/1');
assert(!startPickupActive, 'Ammo pickup inactive after restart');
```

**Only after all assertions pass** — wait for Wave 1 to start naturally.

---

### H. Micro-Exposure Timing

New `calculateSettleTime()` helper — the minimum time to stop movement, let bob settle, aim, and fire accurately:

```js
function calculateSettleTime() {
  // At dtCap=0.5: 
  // - Bob decay after releasing movement: ~1-2 frames (500-1000ms realtime)
  // - But with reported framerate ~2fps, each waitForFrames call takes ~500ms
  // - We can use a 50ms sleep to stop, then immediately aim and fire
  // - The key insight: movement keys released → bobOffset decays over ~0.1s game time
  // - At dtCap=0.5, that's ~0.2s real time ≈ 1 frame
  // So: release keys → sleep(50) → aim → fire = sufficient
  return 50; // ms
}
```

---

## Execution Strategy (Staged)

### Stage A: Fixes + Wave 1 reliability
1. Remove camera-shake cheating
2. Fix ammo pickup restart bug  
3. Implement damage rate tracking
4. Update HP thresholds
5. Update RETREAT/RECOVER with LOS verification
6. Implement micro-exposure combat
7. Implement contextual target priority
8. Run Wave 1 repeatedly until ≥ 8/10 clean survival

### Stage B: Wave 1-2 reliability
9. Implement rusher defense (Wave 2)
10. Implement active LOS threat tracking
11. Run Wave 1-2 repeatedly until ≥ 8/10 reach Wave 3

### Stage C: Evidence system
12. Add identity fields to results
13. Generate phase3-summary.json
14. Add stale evidence cleanup
15. Add play-again ammo regression test
16. Update anti-cheat audit for camera effects

### Stage D: Integration + verify
17. Update verifyRestartState with full checks
18. Run full phase3-acceptance
19. Iterate Stage A+B as needed
20. Only then Stage E

### Stage E: Final acceptance
21. Three consecutive clean victories
22. All gates PASS
23. Commit: `PHASE 3 COMPLETE — three consecutive cheat-free victories with verified evidence`

---

## Verification

### Per-change testing (manual):
- Camera shake removal: Run game, fire weapon, observe shake effects present
- Ammo restart: `Game.restart()` → check `ammoPickup.active === false`, `reserve === 360`
- Combat changes: Run individual wave tests, inspect decision log for timely retreats

### Automated validation:
- `node test/phase3-acceptance.mjs --skip-sub` — skip behavioral/real-input subsuites, run full playthrough only
- `node test/phase3-acceptance.mjs` — full acceptance including sub-suites

### Evidence verification:
- Check `test/results/phase3-run-*.json` for gitCommit and acceptanceRunId
- Check `test/results/phase3-summary.json` for computed `phase3Complete`
- Check `test/results/playthrough-result.json` for identity fields
