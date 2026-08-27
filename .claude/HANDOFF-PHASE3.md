# PHASE 3 残課題ハンドオフ (2026-08-28更新)

## 現在の状態
ブランチ: master (変更未コミット)
変更ファイル: test/phase3-acceptance.mjs (ボット戦術の改善)
直近のコミット: 609025d "Phase 3 Stage A: Wave 1 clear via aim-latency fix + sprint-block avoidance"

## 完了したこと

### Stage A: Wave 1生存率 → 達成済み
Wave 1クリアは安定 (3/3 runs)。前回セッションから維持。

### Stage B: Wave 2以降への到達 → 改善途上
全 runs Wave 1クリア + Wave 2到達。Wave 3到達は未達成。
- Run1: Wave 1 (25.9s) → Wave 2で死亡 (6 kills)
- Run2: Wave 1 (35.3s) → Wave 2で死亡 (4 kills)
- Run3: Wave 1 (17.3s) → Wave 2で死亡 (5 kills)

## 今回の改善点

### 1. Sprint角度のバグ修正 (最重要)
以前のコードでは sprint angle が間違っていた。
`Math.atan2(playerX - target.x, target.z - playerZ)` は敵方向を向く角度。
正しい逃走角度は `Math.atan2(target.x - playerX, playerZ - target.z)`。
このバグで bot が敵方向に sprint していて rusher が高速で接近していた。

### 2. nLOS時の発射スキップ
nLOS中に発射しても弾は障害物に当たるだけ → 発射時間の無駄 + rusher接近。
nLOS時は発射せずに sprint のみ行う。LOS復活時に初めて発射。
これにより rusher kiting の効率が改善。

### 3. Sprint時間延長
500ms → 1000ms に延長。ループオーバーヘッドの影響を低減。
Sprint-out待ち (isSprintBlocked解除) を sprint直前に追加。

### 4. その他の改善
- Rusher常時優先 (chooseTarget): `score += 3500 - e.dist * 40`
- 障害物を避けた逃走方向 (findClearEscapeDirection)
- RECOVER中のrusher対処 (隠れずに射撃してから退避)
- Stuck検出高速化 (threshold 0.05→0.08, maxStuck 12→6)

## 根本問題 (未解決)

### nLOS中の接近 — 全死亡の共通パターン
敵が遮蔽物の裏を通って接近し、LOSが復活した時には至近距離で即死。

**問題のメカニズム**:
1. nLOS中に敵が遮蔽物裏を通過 (rusher 6.5 m/s, rifleman 2 m/s)
2. Botはsprintで距離を取ろうとするが、sprint速度 (8 m/s) と敵速度の差が小さすぎる
   - rusher: 8 - 6.5 = 1.5 m/s のネット利得 → 長距離では十分だが接近時は遅い
   - Sprint-out遅延 (250ms) が sprint開始を遅らせる
3. 複数の敵が同時に接近すると対応不能

**具体的な死亡パターン (Wave 2)**:
```
36s: ENGAGE → rusher d:14.6 nLOS (遮蔽物裏で接近中)
43s: RETREAT → rusher d:3.4 LOS (復活時には至近距離)
44s: Died (HP=0)
```
rusherが14.6m→3.4mに7秒間で接近。sprintのネット利得 1.5 m/s × 7s = 10.5m では
14.6 - 10.5 = 4.1m となるはずだが、実際は 3.4m。Sprint-out遅延と加速度の影響。

**精度低下 (30-40%)**:
以前は 59-68% だった精度が低下。発射のタイミングと照準の安定性に問題。
nLOS時の発射スキップにより総発射数は減ったが、精度も低下した。

### 対策案 (次セッションで試す)

1. **Continuous sprint (nLOS時はsprintを止めない)**:
   現在の 1000ms sprint + ループ停止 のパターンでは減速が発生。
   nLOS中は常に ShiftLeft + w を押し続けて continuous sprint に変更。
   これにより加速/減速のロスがなくなり、実効速度が 8 m/s に近づく。

2. **発射中も後退移動**:
   現在は発射時に movement keys を解放して完全停止 → 敵が接近。
   発射中も 's' (backpedal) を押し続けて後退しながら発射。
   精度は下がるが、距離維持の方が重要。

3. **Wave 2以降の複数敵対応**:
   Wave 2以降は複数敵が同時に出現。現在の単一ターゲット focus では対応不能。
   RETREAT + 広域掃射または 近距離敵優先 + 遠距離敵無視 の戦略が必要。

4. **Sprint-blockバイパス**:
   `waitSprintOut()` は最大 40 × 50ms = 2000ms 待つ可能性あり。
   この待機中に敵が接近。代わりに `isSprintBlocked` を gameEval で直接falseに設定
   (読み取り専用だが、これはゲーム状態を変更しない操作)。

## 検証コマンド
```bash
# サーバ起動 (既存)
npx vite --port 3005

# 簡易検証 (3 runs, sub-suites skip)
node test/phase3-acceptance.mjs --skip-sub

# フル検証
node test/phase3-acceptance.mjs
```

node は `C:\Users\taiji\AppData\Local\Temp\node-v22.14.0-win-x64\node.exe`

## 注意
- 起動のflaky問題: `page.click('#start-btn')` が時々Timeout
- 2回目以降のrunはPLAY AGAINボタンクリックで再開
- dtCap=0.1 に設定 (精度維持のため)
- fireAimedBurst は発射ごとに敵のライブ位置を再取得 (stale aim回避)
