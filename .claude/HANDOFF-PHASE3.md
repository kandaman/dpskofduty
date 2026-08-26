# PHASE 3 残課題ハンドオフ

## 現在の状態
ブランチ: master (3503355 → コミット予定)
変更ファイル: test/phase3-acceptance.mjs (ボット戦術の大幅改善)

## 完了したこと (このセッションで達成)

### Stage A: Wave 1生存率 → 達成
ボット戦術を大幅改善し、Wave 1クリアが3/3 runsで達成 (以前は0%→死亡)。

**主要な改善 (全て test/phase3-acceptance.mjs):**
1. **精度問題の根本原因を発見・修正**:
   - `game.dtCap = 0.5` が精度を壊していた → `0.1` に変更。
     ヘッドレス描画のhiccupフレームで敵が0.75m/フレーム飛ぶ → 弾が空を飛ぶ。
   - `aimAt()` に `rollAmount`/`bobOffset`/`bobSpeed` リセット追加 (camera.updateが毎フレーム再計算するため)。
   - **発射時の aim が stale だった** → `fireAimedBurst()` が `enemyIdx` (配列index) で特定敵の**ライブ位置を毎ショット再取得**して照準。敵が aim〜発射間で移動しても追従。
   - 精度: 0% → 26-44% (最高79%)。命中数: 0 → 3-24。
2. **Sprint-block回避** (`isSprintBlocked` 250ms):
   - `waitSprintOut()` を発射前に追加 (sprint-out完了待ち)。
   - 距離管理のbackpedalを非sprintに (ShiftLeft不使用)。
   - RETREATはsprint (逃げるため。8m/s > rusher 6.5m/s)。
3. **LOS-Aware Burst**: LOS確立中は6発連続発射 (burst切れ目なし)。
4. **距離管理**: backpedal at <10m, approach at >28m, それ以外strafe。
   - nLOS時はtargetに近づかない (strafe/backpedalで距離維持)。
5. **RECOVER短縮**: stateTimer > 3 or HP >= 65 で再交戦 (敵が近づく間に隠れすぎない)。

## 主要な発見
- 精度の決め手は**aim〜発射間のレイテンシと敵の移動**。同期レイキャストは当たるが、フレームを挟むと外れる。
- `enemy.velocity` は読める (rifleman 1-3m/s, rusher 5-6.5m/s)。
- 移動しながら撃つと命中0% (head bob)。静止して撃つのが必須。
- ライブ位置再取得は「targetに最も近い敵」ではなく「特定のenemyIdx」でなければダメ (複数敵で誤射→壁ヒット)。

## 残課題

### Stage B: Wave 2+到達 (現在 全runがWave 2でrusherに死亡)
1. **Rusher対処 (最重要)**:
   - rusher (HP60, 5-6.5m/s) が point-blank (0.1-0.3m) まで到達し bot を殺す。
   - RETREATのsprint逃げが機能していない可能性 → **壁に衝突してstuck**か、rusherの突進速度がsprintより速い。
   - rusherがnLOS (6-9m) で詰まっている → LOS破れ中に閉められる。camera-height LOSは精度0%になるので使用不可。
   - 対策候補: 壁を避けた撤退方向 (findCover活用)、rusherを遠距離で殺す (6発burst = 1kill, HP60)。
2. **マルチターゲット対応** (湧き中のWave遷移で死亡)。
3. **RECOVER→RETREATループ解消** (LOS復帰時は即RETREATではなく角度変更)。

### Stage C: 3連続Victory (現在不可能)
- ボットの限界把握後、ゲームバランス調整を検討。

## 実行コマンド
```bash
# サーバ起動 (既存)
npx vite --port 3005

# 簡易検証 (3 runs, sub-suites skip)
node test/phase3-acceptance.mjs --skip-sub

# フル検証
node test/phase3-acceptance.mjs
```

## 注意
- 起動のflaky問題: `page.click('#start-btn')` が時々Timeout 30000ms。再実行で解決 (サーバ過負荷)。
- node は `C:\Users\taiji\AppData\Local\Temp\node-v22.14.0-win-x64\node.exe` (PATHにない)。
