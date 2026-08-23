# GitHub Copilot Usage-Based Billing メモ

GitHub Copilot の Usage-Based Billing（従量課金制）への移行内容と、使用状況 CSV を集計する Deno CLI をまとめたリポジトリです。

GitHub Copilot は、2026 年 6 月 1 日から Premium Request Unit（PRU）ベースの課金から、GitHub AI Credits を使う Usage-Based Billing（従量課金制）へ移行します。

この README は、GitHub Blog の告知と GitHub Docs の移行ガイドをもとに、変更点と GitHub AI Credits の計算方法を整理したものです。

## 何が変わるか

- PRU は GitHub AI Credits に置き換わります。
- Copilot の基本月額料金は変わりません。
- コード補完と Next Edit Suggestions は、引き続き有料プランに含まれ、AI Credits を消費しません。
- Copilot Chat、Copilot CLI、Copilot cloud agent、Copilot Spaces、Spark、サードパーティのコーディングエージェントなど、Copilot AI モデルを使う機能は AI Credits を消費します。
- クレジットを使い切った場合、追加利用を許可していれば公開レートで課金されます。追加利用を許可していない場合は、次の請求サイクルでクレジットがリセットされるまで対象機能の利用が制限されます。
- 従来の低コストモデルへの自動フォールバックは廃止されます。
- Copilot code review は AI Credits に加えて、GitHub Actions の実行時間も消費します。

## プランに含まれる GitHub AI Credits

1 GitHub AI Credit は **$0.01 USD** に相当します。

### 個人向けプラン

| プラン | 月額 | 基本クレジット | フレックス割り当て | 月間合計 |
| --- | ---: | ---: | ---: | ---: |
| Copilot Pro | $10 | 1,000 | 500 | 1,500 |
| Copilot Pro+ | $39 | 3,900 | 3,100 | 7,000 |
| Copilot Max | $100 | 10,000 | 10,000 | 20,000 |

月次契約の Pro / Pro+ は 2026 年 6 月 1 日に自動で移行します。年次契約は有効期限まで既存の PRU ベースが維持されますが、2026 年 6 月 1 日以降はモデル乗数が変更されます。

### 組織・Enterprise 向けプラン

| プラン | ユーザーごとの月間 AI Credits |
| --- | ---: |
| Copilot Business | 1,900 |
| Copilot Enterprise | 3,900 |

組織向けプランでは、ユーザーごとのクレジットは課金エンティティ単位でプールされます。たとえば Copilot Business のユーザーが 100 人いる場合、100 個の個別枠ではなく、190,000 AI Credits の共有プールとして扱われます。

既存の Copilot Business / Enterprise 顧客には、移行開始から最初の 3 か月間、プロモーションとして追加クレジットが付与されます。

| プラン | プロモーション期間中のユーザーごとの月間 AI Credits |
| --- | ---: |
| Copilot Business | 3,000 |
| Copilot Enterprise | 7,000 |

## Usage-Based Billing の計算方法

Copilot の利用料金は、モデルとのやり取りで消費されたトークン数と、利用したモデルのトークン単価から計算されます。

計算対象になる主なトークンは次のとおりです。

- 入力トークン: モデルに送信したプロンプトやコンテキスト
- 出力トークン: モデルが生成した回答やコード
- キャッシュされた入力トークン: モデルが再利用するコンテキスト
- キャッシュ書き込みトークン: 一部の Anthropic モデルで発生するキャッシュ書き込み

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

同じ操作でも、より高性能なモデルを選ぶ、会話が長くなる、複数ファイルをまたぐエージェント作業になる、モデル呼び出し回数が増える、といった場合は消費クレジットが増えます。日常的な軽い質問には軽量モデルを使うと、含まれるクレジットを長く使えます。

## 移行前に確認すること

Copilot Pro / Pro+ では、Premium Request 分析ページから使用状況レポートをダウンロードできます。レポートには Usage-Based Billing での見積もりとして、次の列が追加されます。

| 列 | 意味 |
| --- | --- |
| `aic_quantity` | 使用された AI Credits 数 |
| `aic_gross_amount` | Usage-Based Billing での推定コスト（USD） |

CSV は課金プレビューツールにアップロードして、現在の PRU ベースの利用と AI Credits ベースの予測を比較できます。見積もりは説明目的の予測であり、実際の請求は課金プラットフォームが処理した実使用量に基づきます。

また、IDE、クライアント、Copilot 拡張機能は最新の安定版に更新しておくことが推奨されています。古いバージョンでは、モデル価格や使用量表示、課金用語、使用状況アラートが正しく表示されない場合があります。

## CSV から利用額を計算する

このリポジトリには、Deno で動作する TypeScript CLI が含まれています。GitHub の使用状況レポート CSV に含まれる `aic_quantity` と `aic_gross_amount` を読み込み、AI Credits と推定金額を合計します。外部依存はありません。

### 前提

- [Deno](https://deno.com/) がインストールされていること
- GitHub の使用状況レポート CSV をダウンロードしていること
- CSV に `aic_quantity` と `aic_gross_amount` の列が含まれていること

CLI の型チェックは次のコマンドで実行できます。

```bash
deno task check
```

### 基本的な使い方

CSV 全体の合計を確認します。

```bash
deno task calculate ./usage-report.csv
```

プランに含まれる AI Credits と比較し、残量・超過クレジット・超過見込み額を確認できます。

```bash
deno task calculate ./usage-report.csv --plan pro
deno task calculate ./usage-report.csv --plan business --seats 100
deno task calculate ./usage-report.csv --plan enterprise --seats 50 --promotional
```

出力例:

```text
CSV: usage-report.csv
Rows: 2
AI Credits used: 1,250
Estimated gross amount: $12.50
Plan: Copilot Pro
Seats: 1
Included AI Credits: 1,500
Remaining AI Credits: 250
Overage AI Credits: 0
Estimated overage amount: $0.00
```

### オプション

| オプション | 説明 |
| --- | --- |
| `--plan <plan>` | `pro`, `pro-plus`, `max`, `business`, `enterprise` のいずれかを指定し、プランに含まれるクレジットと比較します。 |
| `--seats <number>` | 含まれるクレジットをシート数倍して見積もります。既定値は `1` です。正の整数を指定してください。 |
| `--promotional` | Business / Enterprise の移行初期 3 か月に付与されるプロモーションクレジットで計算します。`--plan business` または `--plan enterprise` と併用してください。 |
| `-h`, `--help` | ヘルプを表示します。 |

`business` と `enterprise` では、集計結果に課金エンティティ単位のクレジットプールであることが表示されます。`--plan` を省略した場合は、プラン比較を行わず CSV の集計結果だけを表示します。

### CSV の入力例

必要な列以外は無視されます。金額列には `$` や桁区切りを含む値も指定できます。

```csv
aic_quantity,aic_gross_amount
1000,$10.00
250,2.50
```

不正な CSV、必須列の不足、数値として解釈できない値がある場合は、エラーを表示して終了します。

## 参考

- [GitHub Copilot is moving to usage-based billing](https://github.blog/jp/2026-04-28-github-copilot-is-moving-to-usage-based-billing/)
- [使用量ベースの課金への移行の準備](https://docs.github.com/ja/copilot/how-tos/manage-and-track-spending/prepare-for-your-move-to-usage-based-billing)
- [GitHub Copilot のモデルと価格設定](https://docs.github.com/ja/copilot/reference/copilot-billing/models-and-pricing)
