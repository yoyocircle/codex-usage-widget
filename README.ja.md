# Codex Usage Widget

[English](README.md) | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md)

iOS の [Scriptable](https://scriptable.app/) で OpenAI Codex の使用量をすばやく確認するための小さなウィジェットです。

表示内容：

- 現在の短時間ウィンドウ（例: 5 時間）の残りクォータ
- Weekly の残りクォータ
- usage endpoint が返す場合は Luna Reserve の残りクォータ
- 各ウィンドウのリセット時刻
- 経過時間に対して使用量が速すぎないかを示すペースマーカー
- 利用可能な rate-limit reset credits
- ChatGPT プラン

このプロジェクトは ChatGPT / Codex の内部 endpoint を使用しており、公式の公開 API ではありません。OpenAI が endpoint や OAuth フローを変更した場合、動作しなくなる可能性があります。

## Progress bar の見方

数値と塗りつぶされたバーはどちらも **残りクォータ** を表します。

- `100%` = クォータがすべて残っている
- `0%` = クォータを使い切った
- バー内の短い縦線 = ウィンドウ全体で均等に使った場合、現在時刻の時点で理論上残っているはずの位置

例：

```text
Weekly                      30%
██████      ┃──────────────
Reset 3d 12h
```

塗りつぶしの終端がマーカーより **左** にある場合、経過時間に対して使用ペースが速いことを意味します。マーカーより右まで伸びている場合は、均等ペースより余裕があります。

通常の Codex quota row では、色も使用ペースを示します：

- 緑: 均等ペース以下
- オレンジ: 少しペース超過
- 赤: 大幅なペース超過、または残り 10% 以下

## Luna Reserve

`/backend-api/wham/usage` の `additional_rate_limits` に対象エントリが含まれる場合、通常の短時間ウィンドウと Weekly の後に 3 行目として Luna Reserve を表示します。

次のどちらかが一致すると Luna Reserve と判定します：

```text
limit_name        = gpt-reserve
normal_model_slug = gpt-5.6-luna
```

Luna row は通常 quota の pace 色ではなく、ChatGPT の表示に近い専用スタイルを使います：

- 黄色の `moon.fill` アイコン
- progress bar の fill は常に `#FFD240`
- 残りパーセントの文字色は通常の foreground color
- 既存の pace marker はそのまま表示
- reset time は Luna 自身の `primary_window` から計算

例：

```text
🌙 Luna Reserve                16%
███        ┃────────────────
Reset 6d 21h
```

`additional_rate_limits` に一致する項目がなければ Luna row は表示されません。判定に `rate_limit_upsell.banner_type` は使用しません。

## 必要なもの

- iPhone または iPad
- [Scriptable](https://scriptable.app/)
- 初回の ChatGPT OAuth ログイン用に Codex CLI を実行できるコンピューター
- 以下のコマンドで `jq` を使用します

## 1. ウィジェット専用の Codex ログインを作成する

普段 PC で使っている Codex session の refresh token をそのまま再利用しないでください。

別の `CODEX_HOME` を作成して、ウィジェット専用の OAuth session を用意します：

```bash
mkdir -p ~/.codex-widget

CODEX_HOME="$HOME/.codex-widget" \
  codex -c 'cli_auth_credentials_store="file"' login
```

ブラウザーでログインを完了し、監視したい Codex クォータと同じ ChatGPT アカウントを使用してください。

ログイン後、次のファイルが作成されます：

```text
~/.codex-widget/auth.json
```

この専用 session も **同じ ChatGPT アカウントの Codex クォータ** を参照します。分離されるのは OAuth credential のライフサイクルだけです。

## 2. refresh token だけを取得する

専用 session の refresh token を表示します：

```bash
jq -r '.tokens.refresh_token' ~/.codex-widget/auth.json
```

この値はパスワードと同様に扱ってください。commit、issue への貼り付け、第三者との共有はしないでください。

## 3. Scriptable にインストールする

1. App Store から Scriptable をインストールします。
2. [`codex-usage-widget.js`](codex-usage-widget.js) を開き、ファイル全体をコピーします。
3. Scriptable で新しい script を作成し、コードを貼り付けます。
4. 次の 1 行だけを変更します：

```javascript
const INITIAL_REFRESH_TOKEN = "PASTE_REFRESH_TOKEN_HERE";
```

専用 refresh token を設定します：

```javascript
const INITIAL_REFRESH_TOKEN = "your-refresh-token";
```

access token や account ID を手動で設定する必要はありません。script が自動的に取得・管理します。

## 4. 一度手動で実行する

Scriptable 内で script を直接実行します。

Small Widget のプレビューが表示されます。初回の正常実行時に script は：

1. refresh token を access token に交換
2. access token JWT から ChatGPT account ID を取得
3. access token、refresh token、account ID を Scriptable Keychain に保存
4. refresh token が rotation した場合、最新 token を自動保存

初回実行が成功した後は、script 内の値を placeholder に戻しても構いません：

```javascript
const INITIAL_REFRESH_TOKEN = "PASTE_REFRESH_TOKEN_HERE";
```

以後は Scriptable Keychain に保存された token が使用されます。

## 5. ホーム画面に追加する

1. iOS ホーム画面に **Scriptable** ウィジェットを追加します。
2. **Small** サイズを選びます。
3. ウィジェットを編集します。
4. この script を選択します。

script は 15 分より早く再更新しないよう要求しますが、実際のホーム画面ウィジェット更新時刻は iOS が決定します。

ウィジェットをタップすると ChatGPT の Codex usage ページを開きます。

## ウィジェット更新の制限

Scriptable では、iOS ホーム画面ウィジェットの更新時刻を正確な間隔で指定することはできません。[`refreshAfterDate`](https://docs.scriptable.app/listwidget/#refreshafterdate) は **次回更新が許可される最も早い時刻** を指定するだけで、タイマーではありません。Scriptable の公式ドキュメントでも、指定時刻に正確に更新される保証はないとされています。

このプロジェクトでは、正常実行後の `refreshAfterDate` を約 15 分後に設定しています。実際の意味は次のとおりです：

- その時刻より前の更新を要求しない
- **15 分ごとに必ず更新されるわけではない**、また 15 分後ちょうどに更新される保証もない
- 実際の更新スケジュールの一部は iOS / iPadOS が決定する
- バッテリー残量が少ない場合や、ウィジェットがあまり見られていない場合は更新が遅れることがある
- フッターの時刻はウィジェットが最後に正常実行された時刻なので、表示されているクォータ情報の鮮度を確認する目安になる

Scriptable App 内で script を手動実行すると、そのプレビューでは最新データを取得できます。ただし、ホーム画面ウィジェット自体は引き続き iOS の更新スケジュールに従います。

## Reset credits

フッターには次のように表示されます：

```text
↻ 2
```

これは usage endpoint が返す、現在利用可能な banked rate-limit reset credits の数です。

## Refresh token rotation と専用 session

Codex の refresh token は rotation する場合があります。Scriptable が専用 refresh token を一度使用した後は、その token chain は Scriptable Keychain 側で管理されます。

そのため、以後 `~/.codex-widget` session を Codex CLI で使うことは推奨しません。Scriptable が token を rotation した後、`auth.json` 側には古い refresh token が残る可能性があります。

普段使用している `~/.codex` session は別なので影響を受けません。

## ウィジェットの credential をリセットする

アカウントを変更したり最初からやり直したい場合は、Scriptable Keychain から次のキーを削除します：

```text
codex-usage-widget.access-token
codex-usage-widget.refresh-token
codex-usage-widget.account-id
```

その後、新しい専用 Codex login を作成し、新しい refresh token を設定してください。

## セキュリティ上の注意

- 実際の refresh token をこの repository や fork に commit しないでください。
- Refresh token は OAuth session への継続的なアクセスを可能にするため、パスワードと同様に保護してください。
- 普段の Codex CLI session と refresh-token chain を共有せず、ウィジェット専用 OAuth session を使用してください。
- 初期設定後の credential は通常の script state ではなく Scriptable Keychain に保存されます。

## 実装詳細

現在、ウィジェットは次の endpoint を使用します：

```text
POST https://auth.openai.com/oauth/token
GET  https://chatgpt.com/backend-api/wham/usage
```

`/wham/usage` は OpenAI が公開仕様として文書化している API ではないため、予告なく変更される可能性があります。Luna Reserve の検出に使う `additional_rate_limits` の構造や存在自体も変更される可能性があります。

## Disclaimer

このプロジェクトは非公式であり、OpenAI との提携・承認関係はありません。OpenAI、ChatGPT、Codex はそれぞれの権利者の商標です。
