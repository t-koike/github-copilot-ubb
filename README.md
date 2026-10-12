# GitHub Copilot Usage-Based Billing メモ

GitHub Copilot の Usage-Based Billing（従量課金制）への移行内容と、使用状況 CSV を集計する Deno CLI をまとめたリポジトリです。

GitHub Copilot は、2026 年 6 月 1 日に Premium Request Unit（PRU）ベースの課金から、GitHub AI Credits を使う Usage-Based Billing（従量課金制）へ移行しました。

この README は、GitHub Blog の告知と GitHub Docs の現行記載（2026 年 10 月 12 日時点で確認）をもとに、変更点と GitHub AI Credits の計算方法を整理したものです。本文中の `[S1]`〜`[S8]` は、末尾の「情報源とポインタ」に対応します。GitHub の料金・提供機能・移行条件は更新される可能性があるため、判断時には必ずリンク先の現行記載を確認してください。

## 何が変わったか

[S1][S2][S3]

- 月次プランでは、PRU が GitHub AI Credits に置き換わりました。年次契約は有効期限まで PRU ベースです。
- 月次の有料プランのサブスクリプション料金（個人プランの Pro / Pro+ / Max、組織プランの Business / Enterprise のシート料金）は変わりません。ただし、新規の年次プランは提供されなくなり、既存の年次契約はレガシーな扱いで有効期限まで維持されます。
- コード補完と Next Edit Suggestions は、引き続き有料プランで無制限に利用でき、AI Credits を消費しません。
- Copilot Chat、Copilot CLI、Copilot cloud agent、Copilot Spaces、Spark、サードパーティのコーディングエージェントなど、Copilot AI モデルを使う機能は AI Credits を消費します。
- 含まれるクレジットを使い切った後の扱いは、個人プランと組織・Enterprise で異なります。個人プランは追加利用の予算を設定すれば、公開されているトークン単価に基づく従量課金で継続できます。組織・Enterprise は「AI credits 有料使用」ポリシーが既定で有効で、予算・支出上限を設定していない（または上限停止を有効にしていない）場合、追加料金が上限なく発生し得ます（追加利用が上限に達した場合は、続行するために消費済みの追加利用分を支払う必要があります）。ポリシーを無効にすると、含まれるプールを使い切った時点でブロックされます。
- 個人・組織とも、予算や支出上限に達した場合に低コストモデルへ自動フォールバックすることはありません。コード補完と Next Edit Suggestions は AI Credits を消費しないため、引き続き利用できます。
- 有料の個人プランでは、Copilot Chat、Copilot CLI、GitHub Copilot app、Copilot cloud agent で auto model selection を使うと、モデル費用が 10% 割引されます [S2]。
- GitHub Mobile（iOS / Android）経由で Copilot プランを契約している、または契約したことがある場合、追加の AI Credits を購入するオプションは利用できません [S4]。
- Copilot code review は、AI Credits と GitHub Actions の実行時間を別々に消費・計上します。

## プランに含まれる GitHub AI Credits

[S2][S3]

1 GitHub AI Credit は **$0.01 USD** に相当します。

### 個人向けプラン

| プラン | 月額 | 基本クレジット | フレックス割り当て | 月間合計 |
| --- | ---: | ---: | ---: | ---: |
| Copilot Pro | $10 | 1,000 | 500 | 1,500 |
| Copilot Pro+ | $39 | 3,900 | 3,100 | 7,000 |
| Copilot Max | $100 | 10,000 | 10,000 | 20,000 |

Copilot Free と Copilot Student には AI Credits の利用枠があり、モデルには auto model selection 経由でのみアクセスできます。Free には月 2,000 回のコード補完、Student には無制限のコード補完が含まれます。Student はサードパーティエージェントを除くエージェント機能を利用できます [S7]。

含まれるクレジットを使い切った場合、個人プランでは次のいずれかを選べます [S2]。

- 上位プランへアップグレードする（差額のみの支払いで、追加クレジットは即時に利用可能）
- 現在のプランのまま追加利用の予算を設定する（予算は USD 指定、$10 = 1,000 AI Credits）
- 翌月のリセットを待つ上表は月額料金と基本・フレックス割り当てが公表されている有料個人プランを対象にしています。

月次契約の Pro / Pro+ は 2026 年 6 月 1 日に自動で Usage-Based Billing へ移行しました。年次プランは廃止され、既存の年次契約は有効期限まで従来の PRU ベースを利用できます。ただし、2026 年 6 月 1 日以降はモデル乗数が更新されます。有効期限後は、月次の有料プランへ申し込まない限り Copilot Free に移行します。既存の年次契約者の選択肢は「移行にあたって確認すること」を参照してください [S6]。

### 組織・Enterprise 向けプラン

組織・Enterprise の「ユーザーごとの月間クレジット」は個人別の上限ではなく、課金エンティティ単位の共有プールへの算入額です。共有プールとは別に、ユーザーレベル予算（全ユーザー共通・コストセンター単位・個人単位。より限定的なものが優先され、個人予算には有効期限を設定可能）は、各ユーザーのプール利用と従量課金利用の合計に対する常時のハードストップとして機能します。組織・コストセンター・Enterprise 予算は共有プールを使い切った後の従量課金を制御するもので、ライセンス料金を含む月額請求総額の上限ではありません。コストセンターには、そのコストセンターに割り当てられたライセンス分（Business 1,900 / Enterprise 3,900 × ライセンス数）までにプール利用を制限する「含まれる使用量の制御」も設定できます [S5]。

| プラン | シート料金（月額） | ユーザーごとの月間 AI Credits |
| --- | ---: | ---: |
| Copilot Business | $19 | 1,900 |
| Copilot Enterprise | $39 | 3,900 |

[S3][S5][S7]

予算・制御の要点は次のとおりです [S5]。

- ユーザーレベル予算以外（コストセンター・組織・Enterprise 予算）の「Stop usage when budget limit is reached」は既定で **オフ** です。オフのままだと上限を超えても課金が続くため、予算作成時には有効化が推奨されています。
- 複数の制御が適用される場合は「残り枠が最も少ないものが先にブロックする」ルールです。ユーザーレベル予算に残りがあっても Enterprise 予算が先に尽きればブロックされ、逆にコストセンター予算を増やしてもユーザーレベル予算に達したユーザーは解除されません。
- 「含まれる使用量の制御」で上限に達したときは、メンバーをブロックするか、追加利用を有料超過として継続するかを選べます。ライセンス追加・アップグレードによる上限増加は即時、削除・ダウングレード・コストセンター間の移動は次の課金サイクルから反映されます。
- コストセンター除外を有効にすると、そのコストセンターの従量課金は Enterprise 予算に算入されず、Enterprise 予算到達時にもブロックされません（自身のコストセンター予算のみで上限管理）。
- Enterprise 予算は月額請求総額の上限ではありません。たとえば Copilot Business 400 ライセンス（$7,600）に $5,000 の Enterprise 予算を設定した場合、最大請求額は $12,600 です。
- 複数の組織から Copilot ライセンスを受けているユーザーは、課金サイクルごとにランダムに選ばれた 1 組織に課金されるため、組織予算での管理が不安定になります。

組織向けプランでは、ユーザーごとのクレジットは課金エンティティ単位でプールされます。月の途中でライセンスを追加するとプールは即時に増えますが、削除してもプールは縮小せず、次の課金サイクルから反映されます。含まれるクレジットは翌月へ繰り越されず、毎月 1 日 00:00:00 UTC にリセットされます。たとえば Copilot Business のユーザーが 100 人いる場合、100 個の個別枠ではなく、190,000 AI Credits の共有プールとして扱われます。

なお、2026 年 6 月 1 日〜9 月 1 日に既存の Business / Enterprise 顧客へ付与されていたプロモーション（Business 3,000 / Enterprise 7,000）は終了しており、現行ドキュメントには記載されていません。2026 年 10 月時点の標準値は上表のとおりです。

## Usage-Based Billing の計算方法

[S4]

Copilot の利用料金は、モデルとのやり取りで消費されたトークン数と、利用したモデルのトークン単価から計算されます。

計算対象になる主なトークンは次のとおりです。

- 入力トークン: モデルに送信したプロンプトやコンテキスト
- 出力トークン: モデルが生成した回答やコード
- キャッシュされた入力トークン: モデルが再利用するコンテキスト
- キャッシュ書き込みトークン: Anthropic モデルと、GPT-5.6 / GPT-6 / GPT-6.1 系の OpenAI モデルで発生します（それ以前の OpenAI モデルには書き込み費用はありません）。
- 入力トークンが閾値（モデルにより 100K / 200K / 272K）を超えると、Long context 区分の高い単価が適用されるモデルがあります。
- 単価はモデルごとに異なります。最新の価格表は [S4] を参照してください（例: Gemini 3.7 / 3.8 Flash は 2026 年 12 月 31 日までプロモーション価格）。

基本式は次のとおりです。

```text
利用額 USD =
  入力トークン数 / 1,000,000 * 入力単価
+ キャッシュ入力トークン数 / 1,000,000 * キャッシュ入力単価
+ 出力トークン数 / 1,000,000 * 出力単価
+ 必要に応じてキャッシュ書き込み分

消費 AI Credits = 利用額 USD / 0.01
```

たとえば、入力 $2.00 / 100 万トークン、キャッシュ入力 $0.50 / 100 万トークン、出力 $8.00 / 100 万トークンのモデルで、入力 100,000 トークン、キャッシュ入力 50,000 トークン、出力 20,000 トークンを使った場合は次のようになります。

```text
入力:           100,000 / 1,000,000 * $2.00 = $0.200
キャッシュ入力:  50,000 / 1,000,000 * $0.50 = $0.025
出力:            20,000 / 1,000,000 * $8.00 = $0.160

合計: $0.385
AI Credits: 38.5
```

同じ操作でも、より高性能なモデルを選ぶ、会話が長くなる、複数ファイルをまたぐエージェント作業になる、モデル呼び出し回数が増える、といった場合は消費クレジットが増えます。個人向け有料プランでは、基本クレジットを先に使い、基本クレジットを超えた場合はフレックス割り当てが IDE・GitHub.com・Copilot CLI 全体に自動適用されます。フレックス割り当ては基本クレジットとは別の追加の毎月枠であり、これを「超過料金」と混同しないよう注意が必要です。含まれるクレジット（基本・フレックス）は翌月へ繰り越されず、毎月 1 日 00:00:00 UTC にリセットされます。

## 最小バージョンの目安

[S2][S3]

使用量ベース課金の表示（モデル価格、使用量、課金用語、使用状況アラート）を正しく得るため、次のバージョン以上への更新が案内されています。古いバージョンでも動作はします。

| IDE / クライアント / 拡張機能 | 最小バージョン |
| --- | --- |
| VS Code | 1.120 |
| Visual Studio 2022 (17.x) | 17.14.33 |
| Visual Studio 2026 (18.x) | 18.6.0 |
| SQL Server Management Studio | 22.6 |
| JetBrains IDEs (plugin) | 1.9.1 |
| Eclipse (plugin) | 0.18.0 |
| Xcode (extension) | 0.50.0 |
| Copilot CLI | 1.0.48 |

## 移行にあたって確認すること

[S1][S6]

Copilot Pro / Pro+ の既存の年次契約は、年次契約の有効期間中はレガシーなリクエストベース課金として扱われます（ただし、2026 年 6 月 1 日以降は年次プラン向けのモデル乗数が更新されます）。年次契約の扱いを「すでに全員が AI Credits 課金へ移行済み」と解釈しないでください。既存の年次契約者には次の選択肢があります。

- **継続**: 有効期限まで PRU + モデル乗数で利用し、期限後は自動で Copilot Free にダウングレード
- **解約**: 日割り返金を受け、必要に応じて同等の月次プランへ再契約
- **アップグレード**: 月次の有料プランへ移行し、年次契約の残存価値を日割りクレジットとして受け取る（例: Pro 年次 → Pro+ 月次）

レガシーな年次プランの利用者は、新しいモデルや機能へのアクセスを受けられません。年次プラン向けのモデル乗数は、たとえば Claude Opus 4.8 が 27、GPT-5.5 が 57、Copilot code review が 13 などで、Usage-Based Billing には適用されません。

### 使用状況レポートの列

[S8]

移行前の課金プレビュー用の使用状況レポートには、Usage-Based Billing での見積もりとして、次の列が含まれていました。通常の Copilot アクティビティレポートと、課金プレビュー用レポートを混同しないでください。

| 列 | 意味 |
| --- | --- |
| `aic_quantity` | 使用された AI Credits 数 |
| `aic_gross_amount` | Usage-Based Billing での推定コスト（USD） |

移行後の現行の課金レポートは、Metered usage ページの Summarized / Detailed usage report と、AI usage ページの **AI usage report**（ユーザー・モデル・日付別の AI Credits 消費の詳細、最大 31 日間）です。これらは `aic_*` 列ではなく `quantity`、`gross_amount`、`discount_amount`（含まれる使用量による割引）、`net_amount`（実際の請求対象額 = `gross_amount - discount_amount`）を使い、AI usage report には `model`、`input`、`output`、`cache_read`、`cache_write` のトークン内訳も含まれます。

課金プレビュー用の CSV は、課金プレビューツールにアップロードして PRU ベースの利用と AI Credits ベースの予測を比較するためのものでした。`aic_gross_amount` はあくまでレポート上の Usage-Based Billing の見積額であり、この CSV の合計がそのまま請求確定額や追加利用の請求額になるとは限りません。見積もりは説明目的の予測であり、実際の請求は課金プラットフォームが処理した実使用量、契約、予算設定などに基づきます。

また、IDE、クライアント、Copilot 拡張機能は最新の安定版に更新しておくことが推奨されています。古いバージョンでは、モデル価格や使用量表示、課金用語、使用状況アラートが正しく表示されない場合があります。

## CSV から利用額を計算する

このリポジトリには、Deno で動作する TypeScript CLI が含まれています。GitHub の使用状況レポート CSV を読み込み、AI Credits と金額を合計します。外部依存はありません。

### 対応する CSV 形式

列名から形式を自動判定します。必要な列以外は無視されます。

| 形式 | 必須列 | 任意列 |
| --- | --- | --- |
| 課金プレビュー用レポート（移行期） | `aic_quantity`, `aic_gross_amount` | — |
| 現行の使用状況レポート / AI usage report [S8] | `quantity`, `gross_amount` | `discount_amount`, `net_amount` |

- 金額・数量は固定小数点（小数 9 桁）で集計するため、1 クレジット未満の利用や 1 セント未満の金額を多数合計しても浮動小数点誤差が生じません。`$` や桁区切り、指数表記（`1e-5`）も受け付けます。
- Metered usage の Summarized / Detailed usage report は Actions など他製品の行を含みます。`product` / `sku` 列に複数の値がある場合は、無関係な数量を合算しないようエラーになるため、`--product` / `--sku` で AI Credits の行を指定してください。
- 総額が「AI Credits × $0.01」と 1%（最低 $0.01）以上ずれている場合は、誤った行・列を集計している可能性があるため警告を表示します。データ行が 0 件の場合やフィルタに一致しない場合も警告します。

### 前提

- [Deno](https://deno.com/) 2.x がインストールされていること
- GitHub の使用状況レポート CSV をダウンロードしていること

型チェック・テスト・Lint は次のコマンドで実行できます。

```bash
deno task check
deno task test
deno task lint
```

### 基本的な使い方

CSV 全体の合計を確認します。`-` を指定すると標準入力から読み込みます。

```bash
deno task calculate ./usage-report.csv
cat ./usage-report.csv | deno task calculate -
```

プランに含まれる AI Credits と比較し、残量・超過クレジット・超過見込み額を確認できます。

```bash
deno task calculate ./usage-report.csv --plan pro
deno task calculate ./usage-report.csv --plan business --seats 100
deno task calculate ./usage-report.csv --plan=enterprise --seats=50
```

出力例:

```text
CSV: usage-report.csv
Report format: billing preview (aic_*)
Rows: 2
AI Credits used: 1,250
Gross amount: $12.50
Plan: Copilot Pro
Seats: 1
Included AI Credits: 1,500
Remaining AI Credits: 250
Overage AI Credits: 0
Estimated overage amount: $0.00
```

現行レポートで `discount_amount` / `net_amount` 列がある場合は、含まれる使用量による割引額と、実際の請求対象額（`net_amount`）も表示されます。

ユーザー・モデル・日付などの内訳や、JSON 出力も可能です。

```bash
deno task calculate ./ai-usage-report.csv --group-by user
deno task calculate ./ai-usage-report.csv --group-by model --json
deno task calculate ./detailed-usage-report.csv --product copilot --group-by date
```

### オプション

| オプション | 説明 |
| --- | --- |
| `--plan <plan>` | `pro`, `pro-plus`, `max`, `business`, `enterprise` のいずれかを指定し、プランに含まれるクレジットと比較します（大文字小文字は区別しません）。 |
| `--seats <number>` | Business / Enterprise の含まれるクレジットをシート数倍して見積もります。`--plan business` または `--plan enterprise` と併用してください。既定値は `1` です。正の整数を指定してください。 |
| `--product <value>` | `product` 列が一致する行だけを集計します（大文字小文字は区別しません）。 |
| `--sku <value>` | `sku` 列が一致する行だけを集計します（大文字小文字は区別しません）。 |
| `--group-by <key>` | `date`, `user`, `model`, `sku`, `product`, `organization`, `cost-center` ごとの内訳を表示します。対応する列（`date`, `username`, `model`, `sku`, `product`, `organization`, `cost_center_name`）が必要です。 |
| `--json` | 機械可読な JSON を出力します（警告は `warnings` 配列に含まれます）。 |
| `-h`, `--help` | ヘルプを表示します。 |

すべての値付きオプションは `--option value` と `--option=value` のどちらでも指定できます。

`business` と `enterprise` では、集計結果に課金エンティティ単位のクレジットプールであることが表示されます。`--seats` による計算は、全シートが同じプランで 1 か月分の枠を持つという単純化した見積もりです。混在プラン、月途中のライセンス追加・削除、ユーザーレベル予算、コストセンター・組織・Enterprise の予算は反映されないため、実際の利用可否や請求額の判定には使えません。実際の請求対象額は、現行レポートの `net_amount` を参照してください。

### CSV の入力例

```csv
aic_quantity,aic_gross_amount
1000,$10.00
250,2.50
```

```csv
date,username,model,quantity,gross_amount,discount_amount,net_amount
2026-10-01,alice,gpt-5.4,100,1.00,1.00,0
2026-10-01,bob,claude-sonnet-4.6,50.5,0.505,0.25,0.255
```

不正な CSV（閉じられていない引用符、列数超過、空・重複ヘッダーなど）、必須列の不足、空欄・負数を含む数値として解釈できない値がある場合は、行番号付きのエラーを表示して終了コード 1 で終了します。

## 情報源とポインタ

以下のポインタは、本文の各記述を確認する場所を示しています。ページ内検索（見出し名）でも到達できます。

| ID | 情報源 | 確認するポインタ（ページ内の見出し・記載） |
| --- | --- | --- |
| [S1] | [GitHub Blog: GitHub Copilot is moving to usage-based billing](https://github.blog/jp/2026-04-28-github-copilot-is-moving-to-usage-based-billing/) | 移行日、月次・年次プランの移行、既存年次契約、移行スケジュール |
| [S2] | [Usage-based billing for individuals](https://docs.github.com/en/copilot/concepts/billing-and-usage/individuals/billing) | 「How do AI credits work?」「GitHub AI Credits allowance by plan」「What is billed in AI credits?」「What happens if I exceed my included AI credits?」 |
| [S3] | [Usage-based billing for organizations and enterprises](https://docs.github.com/en/copilot/concepts/billing-and-usage/organizations-and-enterprises/billing) | 「How do AI credits work?」「What happens if I exceed my included AI credits?」「Update your IDE, client, and extension」 |
| [S4] | [Models and pricing for GitHub Copilot](https://docs.github.com/en/copilot/reference/copilot-billing/models-and-pricing) | 「How model pricing works」「Pricing tables」「Code completions」「Pricing and usage cost considerations for Copilot code review」 |
| [S5] | [Budgets for usage-based billing](https://docs.github.com/en/copilot/concepts/billing-and-usage/organizations-and-enterprises/budgets) | 「User-level budget」「Cost center budget」「Included usage controls for cost centers」「Organization budget」「Enterprise budget」「How user-level budgets and spending limits interact」「Cost center exclusion」 |
| [S6] | [What changed with Copilot billing (legacy)](https://docs.github.com/en/copilot/reference/copilot-billing/request-based-billing-legacy/what-changed-with-billing) / [Model multipliers for annual plans (legacy)](https://docs.github.com/en/copilot/reference/copilot-billing/request-based-billing-legacy/model-multipliers-for-annual-plans) | 「What are my options as a Copilot Pro and Copilot Pro+ user on an existing annual plan?」「Model multipliers」 |
| [S7] | [Plans for GitHub Copilot](https://docs.github.com/en/copilot/get-started/plans) | 「Copilot plans overview」「GitHub AI Credits allowance by plan」 |
| [S8] | [Billing reports reference](https://docs.github.com/en/billing/reference/billing-reports) | 「Report types」「AI usage report」「Usage report fields」 |

## 参考

- [Copilot アクティビティレポートのダウンロード](https://docs.github.com/ja/copilot/how-tos/administer-copilot/download-activity-report) — 通常のアクティビティレポートの取得方法とレポートフィールド

料金・クレジット数・対象機能・モデル単価は変更される可能性があるため、利用時は GitHub 公式ドキュメントを優先してください。

[S1]: https://github.blog/jp/2026-04-28-github-copilot-is-moving-to-usage-based-billing/
[S2]: https://docs.github.com/en/copilot/concepts/billing-and-usage/individuals/billing
[S3]: https://docs.github.com/en/copilot/concepts/billing-and-usage/organizations-and-enterprises/billing
[S4]: https://docs.github.com/en/copilot/reference/copilot-billing/models-and-pricing
[S5]: https://docs.github.com/en/copilot/concepts/billing-and-usage/organizations-and-enterprises/budgets
[S6]: https://docs.github.com/en/copilot/reference/copilot-billing/request-based-billing-legacy/what-changed-with-billing
[S7]: https://docs.github.com/en/copilot/get-started/plans
[S8]: https://docs.github.com/en/billing/reference/billing-reports
