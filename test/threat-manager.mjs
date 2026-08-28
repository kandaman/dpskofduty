// ─── THREAT MANAGER ───────────────────────────────────────────────────
// Multi-threat scoring, escape vector calculation, distance zones,
// and time-to-contact estimation.

// Distance zone thresholds (metres)
export const DISTANCE_ZONES = {
  COMFORTABLE:  18,   // >18m: feel safe
  WARNING:      12,   // 12-18m: caution
  HIGH_THREAT:   8,   // 8-12m: danger
  EMERGENCY:     5,   // <8m: critical
  CRITICAL:      3    // <5m: point blank
};

/**
 * Compute a threat score for a single enemy.
 * Higher = more dangerous.
 */
export function scoreThreat(enemy, playerX, playerZ) {
  if (!enemy) return -Infinity;
  let score = 0;

  // Base by type
  switch (enemy.type) {
    case 'sniper':   score += 5000; break;  // highest — one-shot potential
    case 'rusher':   score += 3500; break;  // charges relentlessly
    case 'boss':     score += 2500; break;  // tanky, steady damage
    case 'rifleman': score += 1000; break;  // default threat
    default:         score += 500;  break;
  }

  const dist = enemy.dist || Math.hypot(enemy.x - playerX, enemy.z - playerZ);

  // Distance penalty: closer = more urgent
  // Exponential ramp below WARNING zone
  if (dist < DISTANCE_ZONES.WARNING) {
    const urgency = (DISTANCE_ZONES.WARNING - dist) / DISTANCE_ZONES.WARNING;
    score += urgency * 3000;  // up to +3000 at point blank
  }

  // Rusher-specific: distance is extra critical
  if (enemy.type === 'rusher') {
    if (dist < DISTANCE_ZONES.COMFORTABLE) {
      score += (DISTANCE_ZONES.COMFORTABLE - dist) * 100;
    }
  }

  // Low-HP bonus: quick kill potential
  if (enemy.hp < 30) {
    score += 2000 + (100 - enemy.hp) * 5;
  }

  // HP bonus for already damaged enemies
  score += (100 - enemy.hp) * 2;

  return score;
}

/**
 * Select best target from all enemies using multi-threat scoring.
 * Returns the highest-scored enemy, or null.
 */
export function chooseTargetThreat(enemies, playerX, playerZ) {
  if (!enemies || enemies.length === 0) return null;
  let best = null;
  let bestScore = -Infinity;
  for (const e of enemies) {
    const s = scoreThreat(e, playerX, playerZ);
    if (s > bestScore) { bestScore = s; best = e; }
  }
  return best;
}

/**
 * Estimate time-to-contact for a moving enemy.
 * Negative = moving away.
 */
export function estimateTTC(enemy, playerX, playerZ, closingSpeed) {
  const dist = enemy.dist || Math.hypot(enemy.x - playerX, enemy.z - playerZ);
  const speed = closingSpeed || 6.5; // default rusher speed
  if (speed <= 0) return Infinity;
  return dist / speed;
}

/**
 * Score a candidate escape heading for multi-threat avoidance.
 * Considers:
 *   - obstacle clearance
 *   - predicted distance from nearest rusher after 1s
 *   - number of enemies with predicted LOS
 *   - distance to map boundary
 *   - risk of cornering
 *
 * @param {number} heading - candidate heading in radians
 * @param {object} playerPos - {x, z}
 * @param {Array} enemies - full enemy list
 * @param {Array} obstacles - obstacle positions [{x,z}]
 * @param {object} bounds - map boundary {min, max} or {xMin, xMax, zMin, zMax}
 * @param {number} playerSpeed - assumed player speed (default 8 = sprint)
 */
export function scoreEscapeHeading(heading, playerPos, enemies, obstacles, bounds, playerSpeed) {
  if (playerSpeed === undefined) playerSpeed = 8;

  // Predicted position after 1s of moving in this direction
  const px = playerPos.x + Math.sin(heading) * playerSpeed;
  const pz = playerPos.z - Math.cos(heading) * playerSpeed;

  let score = 0;

  // 1. Obstacle clearance: check obstacles in the movement path
  if (obstacles && obstacles.length > 0) {
    const blocked = obstacles.some(o => {
      const dx = o.x - playerPos.x;
      const dz = o.z - playerPos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 6) return false; // only consider nearby obstacles
      if (dist < 0.5) return true; // on top of obstacle = blocked
      const angle = Math.atan2(dx, dz); // direction from player to obstacle
      const diff = normalizeAngle(heading - angle);
      // If heading is within 0.8 rad (~45°) of obstacle direction AND
      // obstacle is close enough to block within 3m of movement
      return Math.abs(diff) < 0.8 && dist <= playerSpeed * 1; // within ~1s of movement
    });
    if (blocked) {
      score -= 5000 + (5 - (obstacles.some(o => Math.hypot(o.x - playerPos.x, o.z - playerPos.z) < 1) ? 0 : 0)) * 1000;
    }
  }

  // 2. Predicted distance from each enemy after 1s
  for (const e of enemies || []) {
    const ex = e.x || 0;
    const ez = e.z || 0;
    const currentDist = Math.hypot(ex - playerPos.x, ez - playerPos.z);
    const futureDist = Math.hypot(ex - px, ez - pz);

    // If heading away from this enemy (distance increases), bonus
    const distDelta = futureDist - currentDist;
    if (distDelta > 0) {
      score += distDelta * (e.type === 'rusher' ? 300 : 100);
    } else {
      score += distDelta * (e.type === 'rusher' ? 500 : 200); // negative penalty
    }
  }

  // 3. Map boundary distance
  const bxMin = bounds && bounds.xMin !== undefined ? bounds.xMin : -19;
  const bxMax = bounds && bounds.xMax !== undefined ? bounds.xMax : 19;
  const bzMin = bounds && bounds.zMin !== undefined ? bounds.zMin : -19;
  const bzMax = bounds && bounds.zMax !== undefined ? bounds.zMax : 19;

  const distToEdgeX = Math.min(Math.abs(px - bxMin), Math.abs(px - bxMax));
  const distToEdgeZ = Math.min(Math.abs(pz - bzMin), Math.abs(pz - bzMax));
  const minEdgeDist = Math.min(distToEdgeX, distToEdgeZ);

  // Penalty for getting close to map edge (< 5m)
  if (minEdgeDist < 5) {
    score -= (5 - minEdgeDist) * 1000;
  }

  // 4. Corner risk (both axes close to edge)
  if (distToEdgeX < 8 && distToEdgeZ < 8) {
    score -= 2000;
  }

  // 5. Preference for open space (penalty if heading directly toward a wall)
  if (minEdgeDist < 3) {
    score -= 3000; // heading into a corner is very bad
  }

  return score;
}

/**
 * Find the best escape heading from all nearby threats.
 * Evaluates 8 candidate directions.
 * Returns the heading with the highest score.
 */
export function findBestEscapeHeading(playerPos, enemies, obstacles, bounds, opts) {
  if (!playerPos) return 0;

  // 8 candidate headings (0°, 45°, 90°, etc.)
  const candidates = [];
  for (let i = 0; i < 8; i++) {
    candidates.push((Math.PI * 2 * i) / 8);
  }

  // If no enemies, default to moving forward (current direction)
  if (!enemies || enemies.length === 0) return 0;

  let bestHeading = 0;
  let bestScore = -Infinity;

  for (const h of candidates) {
    var s = scoreEscapeHeading(h, playerPos, enemies, obstacles, bounds, 8);
    // If biased mode: extra penalty for headings that approach map edge
    if (opts && opts.biased) {
      var margin = opts.margin || 5;
      const bxMin = bounds && bounds.xMin !== undefined ? bounds.xMin : -19;
      const bxMax = bounds && bounds.xMax !== undefined ? bounds.xMax : 19;
      const bzMin = bounds && bounds.zMin !== undefined ? bounds.zMin : -19;
      const bzMax = bounds && bounds.zMax !== undefined ? bounds.zMax : 19;
      var px = playerPos.x + Math.sin(h) * 12;
      var pz = playerPos.z - Math.cos(h) * 12;
      var dxe = Math.min(Math.abs(px - bxMin), Math.abs(px - bxMax));
      var dze = Math.min(Math.abs(pz - bzMin), Math.abs(pz - bzMax));
      if (dxe < margin || dze < margin) {
        s -= (margin - Math.min(dxe, dze)) * 2000;
      }
    }
    if (s > bestScore) {
      bestScore = s;
      bestHeading = h;
    }
  }

  return bestHeading;
}

/**
 * Check if a heading would collide with an obstacle within lookahead distance.
 */
export function headingBlocked(heading, playerPos, obstacles, lookahead) {
  if (!obstacles || obstacles.length === 0) return false;
  if (lookahead === undefined) lookahead = 3;

  const px = playerPos.x + Math.sin(heading) * lookahead;
  const pz = playerPos.z - Math.cos(heading) * lookahead;

  return obstacles.some(o => {
    const dist = Math.hypot(o.x - playerPos.x, o.z - playerPos.z);
    if (dist > lookahead + 2) return false;
    const dx = o.x - px;
    const dz = o.z - pz;
    return Math.hypot(dx, dz) < 1.5;
  });
}

function normalizeAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/**
 * Classify distance into a named zone string.
 */
export function classifyDistance(d) {
  if (d < DISTANCE_ZONES.CRITICAL) return 'CRITICAL';
  if (d < DISTANCE_ZONES.EMERGENCY) return 'EMERGENCY';
  if (d < DISTANCE_ZONES.HIGH_THREAT) return 'HIGH_THREAT';
  if (d < DISTANCE_ZONES.WARNING) return 'WARNING';
  if (d < DISTANCE_ZONES.COMFORTABLE) return 'COMFORTABLE';
  return 'SAFE';
}
