# Codex Usage Widget

[English](README.md) | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md)

一個給 iOS [Scriptable](https://scriptable.app/) 使用的小型 Widget，用來快速查看 OpenAI Codex 使用量。

Widget 會顯示：

- 目前短週期（例如 5 小時）的剩餘額度
- Weekly 剩餘額度
- 各週期的重置時間
- 依時間進度計算的使用速度 marker，快速看出目前是否用得太快
- 可用的 rate-limit reset 券數量
- ChatGPT 方案

本專案使用 ChatGPT / Codex 的內部 endpoint，並非官方公開 API。如果 OpenAI 調整 endpoint 或 OAuth 流程，Widget 可能會失效。

## Progress bar 怎麼看

數字與進度條填滿的部分都代表 **剩餘額度**。

- `100%` = 額度全部剩下
- `0%` = 額度已用完
- 進度條內的短直線 marker = 如果整個週期均勻使用，依照目前經過的時間，理論上應該剩下的額度位置

例如：

```text
Weekly                      30%
██████      ┃──────────────
Reset 3d 12h
```

如果填滿區域的尾端在 marker **左邊**，代表目前用量速度比時間進度快；如果超過 marker，代表目前用量速度較慢。

顏色也會反映使用速度：

- 綠色：正常或低於均勻速度
- 橘色：稍微超前
- 紅色：明顯超前，或剩餘額度低於等於 10%

## 需求

- iPhone 或 iPad
- [Scriptable](https://scriptable.app/)
- 一台可以執行 Codex CLI 的電腦，用來完成第一次 ChatGPT OAuth 登入
- 下列指令會使用 `jq`

## 1. 建立 Widget 專用的 Codex 登入

**不要**直接使用你平常電腦上 Codex session 的 refresh token。

建立一個獨立的 `CODEX_HOME`，讓 Widget 擁有自己的 OAuth session：

```bash
mkdir -p ~/.codex-widget

CODEX_HOME="$HOME/.codex-widget" \
  codex -c 'cli_auth_credentials_store="file"' login
```

接著在瀏覽器完成登入，使用你想監控 Codex 額度的同一個 ChatGPT 帳號。

登入完成後會建立：

```text
~/.codex-widget/auth.json
```

這個獨立 session 仍然會看到**同一個 ChatGPT 帳號的 Codex 額度**；它只是把 OAuth credential lifecycle 與你平常使用的 Codex session 分開。

## 2. 只取得 refresh token

輸出這個專用 session 的 refresh token：

```bash
jq -r '.tokens.refresh_token' ~/.codex-widget/auth.json
```

請把這個值當成密碼處理。不要 commit、貼到 issue，也不要分享給其他人。

## 3. 安裝到 Scriptable

1. 從 App Store 安裝 Scriptable。
2. 開啟 [`codex-usage-widget.js`](codex-usage-widget.js)，複製整份程式。
3. 在 Scriptable 建立新的 script 並貼上。
4. 只需要替換這一行：

```javascript
const INITIAL_REFRESH_TOKEN = "PASTE_REFRESH_TOKEN_HERE";
```

改成你的專用 refresh token：

```javascript
const INITIAL_REFRESH_TOKEN = "your-refresh-token";
```

不需要另外填 access token 或 account ID。程式會自行取得並管理。

## 4. 先執行一次

直接在 Scriptable 裡執行這支 script。

應該會看到 Small Widget 預覽。第一次成功執行時，程式會：

1. 用 refresh token 換取 access token
2. 從 access token JWT 解析 ChatGPT account ID
3. 把目前的 access token、refresh token 與 account ID 存入 Scriptable Keychain
4. 未來 refresh token 發生 rotation 時，自動保存最新 token

第一次成功後，你可以把 script 裡的值改回 placeholder：

```javascript
const INITIAL_REFRESH_TOKEN = "PASTE_REFRESH_TOKEN_HERE";
```

Widget 會繼續使用 Scriptable Keychain 裡已保存的 token。

## 5. 加到 iOS 主畫面

1. 在 iOS 主畫面加入 **Scriptable** Widget。
2. 選擇 **Small** 尺寸。
3. 編輯 Widget。
4. 選擇這支 script。

程式會要求最早約每 15 分鐘更新一次，但實際 Home Screen Widget 的刷新時間仍由 iOS 決定。

點擊 Widget 會開啟 ChatGPT 的 Codex usage 頁面。

## Reset 券

Footer 會顯示例如：

```text
↻ 2
```

代表 usage endpoint 回報目前可用的 banked rate-limit reset credits 數量。

## Refresh token rotation 與專用 session

Codex refresh token 可能會 rotation。當 Scriptable 第一次使用這組專用 refresh token 後，後續這條 token chain 應由 Scriptable Keychain 管理。

因此，不建議之後再使用 `~/.codex-widget` 這個 session 執行 Codex CLI，因為 Scriptable rotation token 後，該目錄的 `auth.json` 可能還保留舊 refresh token。

你平常使用的 `~/.codex` session 是獨立的，不會受到影響。

## 重新設定 Widget credential

如果要換帳號或全部重設，可以移除 Scriptable Keychain 中以下 key：

```text
codex-usage-widget.access-token
codex-usage-widget.refresh-token
codex-usage-widget.account-id
```

接著重新建立一組專用 Codex login，再貼入新的 refresh token。

## 安全注意事項

- 絕對不要把真實 refresh token commit 到這個 repo 或自己的 fork。
- Refresh token 可以長期維持 OAuth session，應視同密碼保護。
- 建議使用 Widget 專用 OAuth session，不要跟日常 Codex CLI 共用同一條 refresh-token chain。
- 初始設定完成後，credential 會保存在 Scriptable Keychain，而不是一般 script state。

## 實作細節

Widget 目前使用：

```text
POST https://auth.openai.com/oauth/token
GET  https://chatgpt.com/backend-api/wham/usage
```

`/wham/usage` 並不是 OpenAI 有正式文件的公開 API，因此 OpenAI 可以在沒有通知的情況下修改它。

## Disclaimer

本專案為非官方工具，與 OpenAI 無隸屬或官方認可關係。OpenAI、ChatGPT 與 Codex 為其權利人之商標。
