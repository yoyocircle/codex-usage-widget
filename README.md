# Codex Usage Widget

[English](README.md) | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md)

A small [Scriptable](https://scriptable.app/) widget for iOS that shows your OpenAI Codex usage at a glance.

It displays:

- remaining quota for the current short window (for example, 5 hours)
- remaining weekly quota
- reset time for each window
- a visual pace marker showing whether usage is running ahead of elapsed time
- available rate-limit reset credits
- your ChatGPT plan

The widget uses ChatGPT/Codex internal endpoints. It is unofficial and may stop working if OpenAI changes those endpoints or the OAuth flow.

## How the progress bar works

The number and filled bar both represent **remaining quota**.

- `100%` = full quota remaining
- `0%` = quota exhausted
- the short vertical marker inside the bar is the amount you would expect to have remaining if usage were spread evenly across the current time window

Example:

```text
Weekly                      30%
██████      ┃──────────────
Reset 3d 12h
```

If the filled bar ends **before** the marker, usage is running faster than the elapsed-time pace. If it extends **past** the marker, usage is below that pace.

The bar color also reflects pace:

- green: on or below pace
- orange: slightly ahead of pace
- red: significantly ahead of pace, or 10% or less quota remains

## Requirements

- iPhone or iPad
- [Scriptable](https://scriptable.app/)
- Codex CLI on a computer for the initial ChatGPT OAuth login
- `jq` for the commands below

## 1. Create a dedicated Codex login

Do **not** reuse the refresh token from the Codex session you normally use on your computer.

Create a separate `CODEX_HOME` so the widget gets its own OAuth session:

```bash
mkdir -p ~/.codex-widget

CODEX_HOME="$HOME/.codex-widget" \
  codex -c 'cli_auth_credentials_store="file"' login
```

Finish the browser login using the same ChatGPT account whose Codex quota you want to monitor.

This creates a separate credential file at:

```text
~/.codex-widget/auth.json
```

The separate session still sees the **same Codex quota** for that ChatGPT account; it only separates the OAuth credential lifecycle.

## 2. Get only the refresh token

Print the dedicated session's refresh token:

```bash
jq -r '.tokens.refresh_token' ~/.codex-widget/auth.json
```

Treat this value like a password. Do not commit it, paste it into an issue, or share it with anyone.

## 3. Install the Scriptable widget

1. Install Scriptable from the App Store.
2. Open [`codex-usage-widget.js`](codex-usage-widget.js) and copy the entire file.
3. Create a new script in Scriptable and paste the code.
4. Replace only this line:

```javascript
const INITIAL_REFRESH_TOKEN = "PASTE_REFRESH_TOKEN_HERE";
```

with your dedicated refresh token:

```javascript
const INITIAL_REFRESH_TOKEN = "your-refresh-token";
```

No access token or account ID is required. The script obtains and manages them automatically.

## 4. Run it once

Run the script directly inside Scriptable.

A small-widget preview should appear. On the first successful run the script:

1. exchanges the refresh token for an access token
2. derives the ChatGPT account ID from the access-token JWT
3. stores the current access token, refresh token, and account ID in Scriptable Keychain
4. automatically stores future rotated refresh tokens

After the first successful run, you may replace the refresh token in the script with the placeholder again:

```javascript
const INITIAL_REFRESH_TOKEN = "PASTE_REFRESH_TOKEN_HERE";
```

The widget will continue using the copy stored in Scriptable Keychain.

## 5. Add it to the Home Screen

1. Add a **Scriptable** widget to the iOS Home Screen.
2. Choose the **Small** widget size.
3. Edit the widget.
4. Select this script.

The script requests a refresh no earlier than every 15 minutes. iOS ultimately decides when Home Screen widgets actually refresh.

Tapping the widget opens the Codex usage page on ChatGPT.

## Reset credits

The footer shows something like:

```text
↻ 2
```

This is the number of available banked rate-limit reset credits reported by the usage endpoint.

## Token rotation and the dedicated session

Codex refresh tokens can rotate. Once Scriptable uses the dedicated refresh token, Scriptable Keychain becomes the owner of that token chain.

For that reason, avoid subsequently using the `~/.codex-widget` session with the Codex CLI. Its `auth.json` may contain an older refresh token after Scriptable has rotated it.

Your normal `~/.codex` Codex login remains separate and unaffected.

## Resetting the widget credentials

If you want to switch accounts or start over, either delete the Scriptable script and its Keychain entries, or temporarily add code that removes these keys:

```text
codex-usage-widget.access-token
codex-usage-widget.refresh-token
codex-usage-widget.account-id
```

Then create a new dedicated Codex login and paste its new refresh token.

## Security notes

- Never commit a real refresh token to this repository or your own fork.
- A refresh token grants persistent access to the OAuth session and should be protected like a password.
- Use a dedicated OAuth session for the widget instead of sharing the refresh-token chain with your normal Codex CLI session.
- Credentials stored after setup are kept in Scriptable Keychain rather than in ordinary script state.

## Implementation details

The widget currently uses:

```text
POST https://auth.openai.com/oauth/token
GET  https://chatgpt.com/backend-api/wham/usage
```

The usage endpoint is not a documented public OpenAI API. The implementation can therefore break without notice.

## Disclaimer

This project is unofficial and is not affiliated with or endorsed by OpenAI. OpenAI, ChatGPT, and Codex are trademarks of their respective owner.
