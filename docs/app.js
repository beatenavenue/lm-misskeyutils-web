const OAUTH_CONFIG = {
  issuer: "https://misskey.io",
  authorizationEndpoint: "https://misskey.io/oauth/authorize",
  tokenEndpoint: "https://misskey.io/oauth/token",
  userinfoEndpoint: "https://misskey.io/oauth/api/userinfo",
  scope: "read:account"
};

const STORAGE_KEYS = {
  codeVerifier: "lm-misskeyutils-web:code-verifier",
  state: "lm-misskeyutils-web:state",
  accessToken: "lm-misskeyutils-web:access-token"
};

function getRedirectUri() {
  // GitHub Pages上の本番URLでは、IndieAuthの検証に用いるため固定のURLを返す
  if (window.location.hostname === "beatenavenue.github.io") {
    return "https://beatenavenue.github.io/lm-misskeyutils-web/";
  }
  const url = window.location.origin + window.location.pathname;
  // それ以外の環境では末尾スラッシュ付きのURLをcanonicalとして扱う
  return url.endsWith("/") ? url : url + "/";
}

function getClientId() {
  // MisskeyのIndieAuth拡張では、公開されているアプリケーションのURL自体をclient_idとして用いる
  return getRedirectUri();
}

function base64UrlEncode(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function generateRandomString(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  const chars = [];
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  for (let i = 0; i < bytes.length; i++) {
    chars.push(alphabet[bytes[i] % alphabet.length]);
  }
  return chars.join("");
}

async function generateCodeChallenge(codeVerifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(digest);
}

function setStatus(element, type, message) {
  element.textContent = message;
  element.classList.remove("success", "error");
  if (type === "success") {
    element.classList.add("success");
  } else if (type === "error") {
    element.classList.add("error");
  }
}

function saveSessionValue(key, value) {
  try {
    sessionStorage.setItem(key, value);
  } catch (_) {
    // storageが利用できない場合は無視
  }
}

function getSessionValue(key) {
  try {
    return sessionStorage.getItem(key);
  } catch (_) {
    return null;
  }
}

function clearSession() {
  try {
    sessionStorage.removeItem(STORAGE_KEYS.codeVerifier);
    sessionStorage.removeItem(STORAGE_KEYS.state);
    sessionStorage.removeItem(STORAGE_KEYS.accessToken);
  } catch (_) {
    // ignore
  }
}

async function startAuthorizationFlow() {
  const statusEl = document.getElementById("oauth-status");
  const clientId = getClientId();

  const codeVerifier = generateRandomString(64);
  const state = generateRandomString(32);
  saveSessionValue(STORAGE_KEYS.codeVerifier, codeVerifier);
  saveSessionValue(STORAGE_KEYS.state, state);

  let codeChallenge;
  try {
    codeChallenge = await generateCodeChallenge(codeVerifier);
  } catch (err) {
    setStatus(statusEl, "error", "code_challenge の生成に失敗しました。: " + String(err));
    return;
  }

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: getRedirectUri(),
    scope: OAUTH_CONFIG.scope,
    code_challenge_method: "S256",
    code_challenge: codeChallenge,
    state
  });

  const authorizeUrl = OAUTH_CONFIG.authorizationEndpoint + "?" + params.toString();
  setStatus(statusEl, "success", "Misskey.io へリダイレクトします…");
  window.location.assign(authorizeUrl);
}

async function handleAuthorizationCallback() {
  const statusEl = document.getElementById("oauth-status");
  const apiStatusEl = document.getElementById("api-status");
  const url = new URL(window.location.href);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    setStatus(statusEl, "error", "認可リクエストがエラーで終了しました: " + error);
    return;
  }

  if (!code) {
    const token = getSessionValue(STORAGE_KEYS.accessToken);
    if (token) {
      document.getElementById("call-userinfo-btn").disabled = false;
      setStatus(statusEl, "success", "アクセストークンがセッションに存在します。API呼び出しを実行できます。");
    }
    return;
  }

  const storedState = getSessionValue(STORAGE_KEYS.state);
  if (!storedState || storedState !== state) {
    setStatus(statusEl, "error", "state が一致しません。セッションが失効した可能性があります。");
    return;
  }

  const codeVerifier = getSessionValue(STORAGE_KEYS.codeVerifier);
  if (!codeVerifier) {
    setStatus(statusEl, "error", "code_verifier が見つかりません。最初からやり直してください。");
    return;
  }

  const clientId = getClientId();

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    code,
    redirect_uri: getRedirectUri(),
    code_verifier: codeVerifier
  });

  setStatus(statusEl, null, "トークンエンドポイントへリクエスト中...");

  try {
    const response = await fetch(OAUTH_CONFIG.tokenEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: body.toString()
    });

    if (!response.ok) {
      const text = await response.text();
      setStatus(statusEl, "error", "トークン取得に失敗しました: HTTP " + response.status + "\n" + text);
      return;
    }

    const tokenResponse = await response.json();
    const accessToken = tokenResponse.access_token;

    if (!accessToken) {
      setStatus(statusEl, "error", "レスポンスに access_token が含まれていません。");
      return;
    }

    saveSessionValue(STORAGE_KEYS.accessToken, accessToken);
    setStatus(statusEl, "success", "アクセストークンを取得しました。ユーザ情報取得ボタンからAPI呼び出しを試せます。");
    document.getElementById("call-userinfo-btn").disabled = false;

    // URL から code / state を削除してきれいな状態に戻す
    url.searchParams.delete("code");
    url.searchParams.delete("state");
    url.searchParams.delete("iss");
    window.history.replaceState({}, document.title, url.toString());

    setStatus(apiStatusEl, null, "");
  } catch (err) {
    setStatus(statusEl, "error", "トークン取得時にエラーが発生しました: " + String(err));
  }
}

async function callUserinfo() {
  const statusEl = document.getElementById("api-status");
  const accessToken = getSessionValue(STORAGE_KEYS.accessToken);

  if (!accessToken) {
    setStatus(statusEl, "error", "アクセストークンがセッションにありません。まず認可フローを実行してください。");
    return;
  }

  setStatus(statusEl, null, "ユーザ情報を取得中...");

  try {
    const response = await fetch(OAUTH_CONFIG.userinfoEndpoint, {
      method: "GET",
      headers: {
        "Authorization": "Bearer " + accessToken
      }
    });

    if (!response.ok) {
      const text = await response.text();
      setStatus(statusEl, "error", "ユーザ情報取得に失敗しました: HTTP " + response.status + "\n" + text);
      return;
    }

    const body = await response.json();
    setStatus(statusEl, "success", "ユーザ情報の取得に成功しました:\n" + JSON.stringify(body, null, 2));
  } catch (err) {
    setStatus(statusEl, "error", "ユーザ情報取得時にエラーが発生しました: " + String(err));
  }
}

function setupPage() {
  const redirectUriEl = document.getElementById("redirect-uri-display");
  const startAuthBtn = document.getElementById("start-auth-btn");
  const clearSessionBtn = document.getElementById("clear-session-btn");
  const callUserinfoBtn = document.getElementById("call-userinfo-btn");

  if (redirectUriEl) {
    redirectUriEl.textContent = getRedirectUri();
  }

  if (startAuthBtn) {
    startAuthBtn.addEventListener("click", () => {
      startAuthorizationFlow().catch(err => {
        const statusEl = document.getElementById("oauth-status");
        setStatus(statusEl, "error", "認可フロー開始時にエラーが発生しました: " + String(err));
      });
    });
  }

  if (clearSessionBtn) {
    clearSessionBtn.addEventListener("click", () => {
      clearSession();
      setStatus(document.getElementById("oauth-status"), "success", "セッション情報をクリアしました。");
      setStatus(document.getElementById("api-status"), null, "");
      callUserinfoBtn.disabled = true;
    });
  }

  if (callUserinfoBtn) {
    callUserinfoBtn.addEventListener("click", () => {
      callUserinfo().catch(err => {
        const statusEl = document.getElementById("api-status");
        setStatus(statusEl, "error", "API呼び出し時にエラーが発生しました: " + String(err));
      });
    });
  }
}

window.addEventListener("DOMContentLoaded", () => {
  setupPage();
  handleAuthorizationCallback().catch(err => {
    const statusEl = document.getElementById("oauth-status");
    setStatus(statusEl, "error", "コールバック処理中にエラーが発生しました: " + String(err));
  });
});
