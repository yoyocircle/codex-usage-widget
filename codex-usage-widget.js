// Codex Usage Widget for Scriptable
//
// Paste a dedicated Codex OAuth refresh token once. After the first successful
// run, Scriptable Keychain owns the rotated access/refresh token pair.

const INITIAL_REFRESH_TOKEN = "PASTE_REFRESH_TOKEN_HERE";

const CODEX_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const TOKEN_URL = "https://auth.openai.com/oauth/token";
const USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
const USAGE_PAGE_URL = "https://chatgpt.com/codex/settings/usage";

const REFRESH_MINUTES = 15;
const REFRESH_BEFORE_SECONDS = 5 * 60;

const KEY_ACCESS_TOKEN = "codex-usage-widget.access-token";
const KEY_REFRESH_TOKEN = "codex-usage-widget.refresh-token";
const KEY_ACCOUNT_ID = "codex-usage-widget.account-id";

let widget;

try {
  let credentials = loadCredentials();

  if (!credentials.refreshToken) {
    throw new Error("Set INITIAL_REFRESH_TOKEN first");
  }

  // First run has no access token. Later runs refresh only near expiry.
  if (
    !credentials.accessToken ||
    isTokenExpiringSoon(credentials.accessToken, REFRESH_BEFORE_SECONDS)
  ) {
    credentials = await refreshCredentials(credentials);
  }

  let accountId =
    credentials.accountId || extractAccountId(credentials.accessToken);

  if (!accountId) {
    throw new Error("Unable to determine ChatGPT account ID");
  }

  saveAccountId(accountId);

  let usage;

  try {
    usage = await fetchUsage(credentials.accessToken, accountId);
  } catch (error) {
    if (error.statusCode !== 401) throw error;

    // Retry once with a freshly rotated token bundle.
    credentials = await refreshCredentials(credentials);
    accountId =
      credentials.accountId ||
      extractAccountId(credentials.accessToken) ||
      accountId;

    saveAccountId(accountId);
    usage = await fetchUsage(credentials.accessToken, accountId);
  }

  widget = createUsageWidget(usage);
} catch (error) {
  console.error(error);
  widget = createErrorWidget(error);
}

widget.refreshAfterDate = new Date(
  Date.now() + REFRESH_MINUTES * 60 * 1000
);

Script.setWidget(widget);

if (!config.runsInWidget) {
  await widget.presentSmall();
}

Script.complete();

// -----------------------------------------------------------------------------
// Credentials
// -----------------------------------------------------------------------------

function loadCredentials() {
  let accessToken = "";
  let refreshToken = "";
  let accountId = "";

  if (Keychain.contains(KEY_ACCESS_TOKEN)) {
    accessToken = Keychain.get(KEY_ACCESS_TOKEN);
  }

  if (Keychain.contains(KEY_REFRESH_TOKEN)) {
    refreshToken = Keychain.get(KEY_REFRESH_TOKEN);
  } else if (
    INITIAL_REFRESH_TOKEN &&
    INITIAL_REFRESH_TOKEN !== "PASTE_REFRESH_TOKEN_HERE"
  ) {
    refreshToken = INITIAL_REFRESH_TOKEN;
    Keychain.set(KEY_REFRESH_TOKEN, refreshToken);
  }

  if (Keychain.contains(KEY_ACCOUNT_ID)) {
    accountId = Keychain.get(KEY_ACCOUNT_ID);
  }

  return { accessToken, refreshToken, accountId };
}

function saveCredentials(accessToken, refreshToken) {
  if (accessToken) Keychain.set(KEY_ACCESS_TOKEN, accessToken);
  if (refreshToken) Keychain.set(KEY_REFRESH_TOKEN, refreshToken);
}

function saveAccountId(accountId) {
  if (accountId) Keychain.set(KEY_ACCOUNT_ID, accountId);
}

// -----------------------------------------------------------------------------
// OAuth refresh
// -----------------------------------------------------------------------------

async function refreshCredentials(credentials) {
  if (!credentials.refreshToken) {
    throw new Error("Missing refresh token");
  }

  const req = new Request(TOKEN_URL);
  req.method = "POST";
  req.headers = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  };
  req.body = [
    "grant_type=refresh_token",
    `refresh_token=${encodeURIComponent(credentials.refreshToken)}`,
    `client_id=${encodeURIComponent(CODEX_CLIENT_ID)}`,
  ].join("&");
  req.timeoutInterval = 15;

  const body = await req.loadString();
  const status = req.response?.statusCode;

  let json = null;
  try {
    json = JSON.parse(body);
  } catch (_) {}

  if (status !== 200 || !json?.access_token) {
    const message =
      json?.error_description ||
      json?.error?.message ||
      json?.error?.code ||
      json?.error ||
      body;

    throw new Error(`Token refresh failed (${status}): ${message}`);
  }

  const accessToken = json.access_token;
  const refreshToken = json.refresh_token || credentials.refreshToken;
  const accountId =
    extractAccountId(accessToken) || credentials.accountId || "";

  // Refresh tokens can rotate. Persist the newest one immediately.
  saveCredentials(accessToken, refreshToken);
  saveAccountId(accountId);

  return { accessToken, refreshToken, accountId };
}

// -----------------------------------------------------------------------------
// Usage API
// -----------------------------------------------------------------------------

async function fetchUsage(accessToken, accountId) {
  const req = new Request(USAGE_URL);
  req.method = "GET";
  req.headers = {
    Authorization: `Bearer ${accessToken}`,
    "ChatGPT-Account-Id": accountId,
    Accept: "application/json",
  };
  req.timeoutInterval = 15;

  const body = await req.loadString();
  const status = req.response?.statusCode;

  if (status !== 200) {
    let detail = body;

    try {
      const json = JSON.parse(body);
      detail =
        json?.detail ||
        json?.error?.message ||
        json?.error?.code ||
        body;
    } catch (_) {}

    const error = new Error(`Usage API ${status}: ${detail}`);
    error.statusCode = status;
    throw error;
  }

  return JSON.parse(body);
}

// -----------------------------------------------------------------------------
// JWT helpers
// -----------------------------------------------------------------------------

function decodeJwtPayload(token) {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;

    let base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4 !== 0) base64 += "=";

    return JSON.parse(Data.fromBase64String(base64).toRawString());
  } catch (_) {
    return null;
  }
}

function extractAccountId(token) {
  const payload = decodeJwtPayload(token);
  if (!payload) return null;

  const auth = payload["https://api.openai.com/auth"] || {};

  return (
    auth.chatgpt_account_id ||
    auth.account_id ||
    payload.chatgpt_account_id ||
    payload.account_id ||
    null
  );
}

function isTokenExpiringSoon(token, beforeSeconds) {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return false;

  return payload.exp - Math.floor(Date.now() / 1000) <= beforeSeconds;
}

// -----------------------------------------------------------------------------
// Widget
// -----------------------------------------------------------------------------

function createUsageWidget(data) {
  const widget = new ListWidget();

  widget.backgroundColor = Color.dynamic(
    new Color("#F5F5F7"),
    new Color("#1C1C1E")
  );
  widget.setPadding(13, 14, 11, 14);
  widget.url = USAGE_PAGE_URL;

  const header = widget.addStack();
  header.layoutHorizontally();
  header.centerAlignContent();

  const title = header.addText("Codex");
  title.font = Font.semiboldSystemFont(15);
  title.textColor = Color.dynamic(
    new Color("#1D1D1F"),
    new Color("#FFFFFF")
  );

  header.addSpacer();

  if (data?.plan_type) {
    const plan = header.addText(formatPlan(data.plan_type));
    plan.font = Font.mediumSystemFont(9);
    plan.textColor = new Color("#8E8E93");
  }

  widget.addSpacer(9);

  const windows = [
    data?.rate_limit?.primary_window,
    data?.rate_limit?.secondary_window,
  ]
    .filter(Boolean)
    .sort(
      (a, b) =>
        Number(a.limit_window_seconds || 0) -
        Number(b.limit_window_seconds || 0)
    );

  if (windows.length === 0) {
    const noData = widget.addText("No usage data");
    noData.font = Font.systemFont(11);
    noData.textColor = new Color("#8E8E93");
  } else {
    windows.slice(0, 2).forEach((window, index) => {
      addUsageRow(widget, window);
      if (index < Math.min(windows.length, 2) - 1) widget.addSpacer(8);
    });
  }

  widget.addSpacer();

  const footer = widget.addStack();
  footer.layoutHorizontally();
  footer.centerAlignContent();

  const resetCount = Number(
    data?.rate_limit_reset_credits?.available_count ?? 0
  );

  const resets = footer.addText(`↻ ${resetCount}`);
  resets.font = Font.mediumSystemFont(8);
  resets.textColor = new Color("#8E8E93");

  footer.addSpacer();

  const updated = footer.addText(formatTime(new Date()));
  updated.font = Font.systemFont(8);
  updated.textColor = new Color("#8E8E93");

  return widget;
}

function addUsageRow(parent, window) {
  const used = clamp(Number(window.used_percent ?? 0), 0, 100);
  const remaining = clamp(100 - used, 0, 100);
  const elapsed = getElapsedPercent(window);
  const expectedRemaining = clamp(100 - elapsed, 0, 100);
  const paceDelta = used - elapsed;

  const row = parent.addStack();
  row.layoutHorizontally();
  row.centerAlignContent();

  const label = row.addText(getWindowLabel(window.limit_window_seconds));
  label.font = Font.mediumSystemFont(10);
  label.textColor = Color.dynamic(
    new Color("#3A3A3C"),
    new Color("#EBEBF5")
  );

  row.addSpacer();

  const remainingText = row.addText(`${Math.round(remaining)}%`);
  remainingText.font = Font.semiboldSystemFont(11);
  remainingText.textColor = getRemainingColor(remaining, paceDelta);

  parent.addSpacer(4);

  const image = parent.addImage(
    createPaceBar(remaining, expectedRemaining, paceDelta)
  );
  image.imageSize = new Size(120, 7);

  parent.addSpacer(3);

  const reset = parent.addText(getResetDescription(window));
  reset.font = Font.systemFont(8);
  reset.textColor = new Color("#8E8E93");
}

// Rounded remaining-quota bar.
// Fill = actual remaining quota.
// Short marker = expected remaining quota if usage were uniform over the window.
function createPaceBar(remainingPercent, expectedRemainingPercent, paceDelta) {
  const width = 240;
  const height = 14;
  const barY = 2;
  const barHeight = 10;
  const radius = barHeight / 2;

  const ctx = new DrawContext();
  ctx.size = new Size(width, height);
  ctx.opaque = false;
  ctx.respectScreenScale = true;

  const dark = Device.isUsingDarkAppearance();

  const backgroundPath = new Path();
  backgroundPath.addRoundedRect(
    new Rect(0, barY, width, barHeight),
    radius,
    radius
  );
  ctx.addPath(backgroundPath);
  ctx.setFillColor(dark ? new Color("#3A3A3C") : new Color("#E5E5EA"));
  ctx.fillPath();

  const remainingWidth = clamp(
    (width * remainingPercent) / 100,
    0,
    width
  );

  // 0% means truly empty. Tiny non-zero values retain a rounded cap.
  if (remainingWidth > 0) {
    const visibleWidth = Math.min(
      Math.max(remainingWidth, barHeight),
      width
    );

    const fillPath = new Path();
    fillPath.addRoundedRect(
      new Rect(0, barY, visibleWidth, barHeight),
      radius,
      radius
    );
    ctx.addPath(fillPath);
    ctx.setFillColor(getUsageBarColor(paceDelta));
    ctx.fillPath();
  }

  const markerX = clamp(
    (width * expectedRemainingPercent) / 100,
    2,
    width - 3
  );
  const markerHeight = 6;
  const markerY = barY + (barHeight - markerHeight) / 2;

  // Short marker kept entirely inside the capsule.
  ctx.setFillColor(
    dark ? new Color("#000000", 0.4) : new Color("#FFFFFF", 0.85)
  );
  ctx.fillRect(
    new Rect(markerX - 2, markerY - 1, 5, markerHeight + 2)
  );

  ctx.setFillColor(dark ? new Color("#FFFFFF") : new Color("#1C1C1E"));
  ctx.fillRect(new Rect(markerX, markerY, 2, markerHeight));

  return ctx.getImage();
}

// -----------------------------------------------------------------------------
// Pace / formatting
// -----------------------------------------------------------------------------

function getElapsedPercent(window) {
  const duration = Number(window.limit_window_seconds);
  const resetAt = Number(window.reset_at);

  if (!duration || !resetAt) return 0;

  const startAt = resetAt - duration;
  const elapsed = Date.now() / 1000 - startAt;

  return clamp((elapsed / duration) * 100, 0, 100);
}

function getUsageBarColor(paceDelta) {
  if (paceDelta > 10) return new Color("#FF453A");
  if (paceDelta > 3) return new Color("#FF9F0A");
  return new Color("#30D158");
}

function getRemainingColor(remaining, paceDelta) {
  if (remaining <= 10 || paceDelta > 10) return new Color("#FF453A");
  if (paceDelta > 3) return new Color("#FF9F0A");

  return Color.dynamic(new Color("#1D1D1F"), new Color("#FFFFFF"));
}

function getWindowLabel(seconds) {
  seconds = Number(seconds);

  if (!seconds) return "Usage";
  if (seconds === 18000) return "5 hours";
  if (seconds === 604800) return "Weekly";

  if (seconds < 86400) {
    return `${Math.round(seconds / 3600)} hours`;
  }

  return `${Math.round(seconds / 86400)} days`;
}

function getResetDescription(window) {
  let resetDate = null;

  if (window.reset_at) {
    resetDate = new Date(Number(window.reset_at) * 1000);
  } else if (window.reset_after_seconds) {
    resetDate = new Date(
      Date.now() + Number(window.reset_after_seconds) * 1000
    );
  }

  if (!resetDate || isNaN(resetDate.getTime())) return "Reset unknown";

  const diff = resetDate.getTime() - Date.now();
  if (diff <= 0) return "Resetting…";

  const totalMinutes = Math.floor(diff / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours < 24) {
    return hours === 0
      ? `Reset ${minutes}m`
      : `Reset ${hours}h ${minutes}m`;
  }

  const days = Math.floor(hours / 24);
  return `Reset ${days}d ${hours % 24}h`;
}

function formatPlan(plan) {
  const names = {
    free: "Free",
    plus: "Plus",
    pro: "Pro",
    prolite: "Pro",
    team: "Team",
    business: "Business",
    enterprise: "Enterprise",
    edu: "Edu",
  };

  return names[plan] || plan;
}

function formatTime(date) {
  const formatter = new DateFormatter();
  formatter.locale = "en_US";
  formatter.dateFormat = "HH:mm";
  return formatter.string(date);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// -----------------------------------------------------------------------------
// Error widget
// -----------------------------------------------------------------------------

function createErrorWidget(error) {
  const widget = new ListWidget();

  widget.backgroundColor = Color.dynamic(
    new Color("#F5F5F7"),
    new Color("#1C1C1E")
  );
  widget.setPadding(14, 14, 14, 14);

  const title = widget.addText("Codex");
  title.font = Font.semiboldSystemFont(15);
  title.textColor = Color.dynamic(
    new Color("#1D1D1F"),
    new Color("#FFFFFF")
  );

  widget.addSpacer(10);

  const failed = widget.addText("Unable to load");
  failed.font = Font.semiboldSystemFont(12);
  failed.textColor = new Color("#FF453A");

  widget.addSpacer(5);

  const message = widget.addText(String(error.message || error));
  message.font = Font.systemFont(9);
  message.textColor = new Color("#8E8E93");
  message.lineLimit = 5;

  return widget;
}
