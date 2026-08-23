# GitHub Copilot Usage-Based Billing メモ

GitHub Copilot の Usage-Based Billing（従量課金制）への移行内容と、使用状況 CSV を集計する Deno CLI をまとめたリポジトリです。

GitHub Copilot は、2026 年 6 月 1 日に Premium Request Unit（PRU）ベースの課金から、GitHub AI Credits を使う Usage-Based Billing（従量課金制）へ移行しました。

この README は、GitHub Blog の告知と GitHub Docs の移行ガイドをもとに、変更点と GitHub AI Credits の計算方法を整理したものです。

## 何が変わったか

- 月次プランでは、PRU が GitHub AI Credits に置き換わりました。年次契約は有効期限まで PRU ベースです。
- 月次の有料プランのサブスクリプション料金（個人プランの Pro / Pro+ / Max、組織プランの Business / Enterprise のシート料金）は変わりません。ただし、年次プランは廃止されます。
- コード補完と Next Edit Suggestions は、引き続き有料プランで無制限に利用でき、AI Credits を消費しません。
- Copilot Chat、Copilot CLI、Copilot cloud agent、Copilot Spaces、Spark、サードパーティのコーディングエージェントなど、Copilot AI モデルを使う機能は AI Credits を消費します。
- 含まれるクレジットを使い切った後も、追加利用の予算を設定していれば、公開されているトークン単価に基づく追加料金で利用を継続できます。予算の上限に達した場合は、追加利用の支払い、プランのアップグレード、または次のリセットまで待つ必要があります。
- 従来の低コストモデルへの自動フォールバックは廃止されました。
- Copilot code review は、AI Credits と GitHub Actions の実行時間を別々に消費・計上します。

## プランに含まれる GitHub AI Credits

1 GitHub AI Credit は **$0.01 USD** に相当します。

### 個人向けプラン

| プラン | 月額 | 基本クレジット | フレックス割り当て | 月間合計 |
| --- | ---: | ---: | ---: | ---: |
| Copilot Pro | $10 | 1,000 | 500 | 1,500 |
| Copilot Pro+ | $39 | 3,900 | 3,100 | 7,000 |
| Copilot Max | $100 | 10,000 | 10,000 | 20,000 |

Copilot Free と Copilot Student には AI Credits の利用枠があり、モデルには auto model selection 経由でのみアクセスできます。Free には月 2,000 回のコード補完、Student には無制限のコード補完が含まれます。上表は月額料金と基本・フレックス割り当てが公表されている有料個人プランを対象にしています。

月次契約の Pro / Pro+ は 2026 年 6 月 1 日に自動で Usage-Based Billing へ移行しました。年次プランは廃止され、既存の年次契約は有効期限まで従来の PRU ベースを利用できます。ただし、2026 年 6 月 1 日以降はモデル乗数が更新されます。有効期限後は、月次の有料プランへ申し込まない限り Copilot Free に移行します。

### 組織・Enterprise 向けプラン

| プラン | ユーザーごとの月間 AI Credits |
| --- | ---: |
| Copilot Business | 1,900 |
| Copilot Enterprise | 3,900 |

組織向けプランでは、ユーザーごとのクレジットは課金エンティティ単位でプールされます。たとえば Copilot Business のユーザーが 100 人いる場合、100 個の個別枠ではなく、190,000 AI Credits の共有プールとして扱われます。

既存の Copilot Business / Enterprise 顧客には、2026 年 6 月・7 月・8 月の 3 か月間、プロモーションとして追加クレジットが自動付与されます。プロモーション終了後は標準のクレジット数に戻ります。

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
- キャッシュ書き込みトークン: Anthropic モデルや一部の OpenAI モデルで発生するキャッシュ書き込み

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

同じ操作でも、より高性能なモデルを選ぶ、会話が長くなる、複数ファイルをまたぐエージェント作業になる、モデル呼び出し回数が増える、といった場合は消費クレジットが増えます。個人向け有料プランでは、基本クレジットを先に使い、超過後はフレックス割り当てが IDE・GitHub.com・Copilot CLI 全体に自動適用されます。未使用のクレジットは翌月へ繰り越されず、毎月 1 日 00:00:00 UTC にリセットされます。

## 移行にあたって確認すること

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
- [個人の使用量ベースの課金](https://docs.github.com/ja/copilot/concepts/billing/usage-based-billing-for-individuals)
- [組織と企業の使用量ベースの課金](https://docs.github.com/ja/copilot/concepts/billing/usage-based-billing-for-organizations-and-enterprises)
- [GitHub Copilot のモデルと価格設定](https://docs.github.com/ja/copilot/reference/copilot-billing/models-and-pricing)
料金・クレジット数・対象機能・モデル単価は変更される可能性があるため、利用時は GitHub 公式ドキュメントを優先してください。
