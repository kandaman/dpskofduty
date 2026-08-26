# decisions.md — DpskOfDuty ループ決定ログ

2026-08-26 09:16  監視窓を開設。tatenaga (709e7ba7) を DpskOfDuty のループノードとして登録 (START_HERE_DpskOfDuty.md / loop_nodes.json)
  理由:   taiji が本ノードをループノードと指定。実測: 本番ツリーあり (master daf4a60) / claude CLI 無し / tick タスク無し = 起動機構は未設置
  却下:   起動機構の勝手な設置 (runner 方式・BSOD 自動復帰の設計は taiji 裁定待ち)
  未解決: (1)claude CLI 未インストール (2)tick タスク未登録 (3)devices.json 未登録 (4)node15 の daikoukai ループが本 repo に PHASE 指示を投げる周がある = 管轄重複の芽。tatenaga 稼働開始前に node15 側の対象から外すこと
  lock:   触っていない
2026-08-26 09:30  訂正: 「起動機構なし・未稼働」は誤診。実体は VS Code 拡張 + auto-accept の常駐セッション型で、08:56 からセッション a508592f (PHASE 3 FINAL CLEAN ACCEPTANCE) が稼働中
  理由:   初回計測がスケジュールタスクと PATH しか見ておらず、プロセスと ~/.claude/projects の jsonl を見ていなかった
  却下:   なし (計測方法の欠陥。START_HERE §0 のプローブをプロセス+jsonl 鮮度に差し替え済み)
  未解決: BSOD 後の自動復帰なし (VS Code を人が開く必要がある)。devices.json 未登録と node15 の管轄重複は前項のまま
  lock:   触っていない
