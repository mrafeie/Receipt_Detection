// ── Config — update these with your values ──────────────────
const COGNITO_DOMAIN = "https://eu-west-2orlfxjnnp.auth.eu-west-2.amazoncognito.com";
const CLIENT_ID      = "5qg9125b53uadocs2qbjjelhqf";
const TOKEN_PROXY_URL = "https://ifge22nmdi.execute-api.eu-west-2.amazonaws.com/prod/exchangeCodeForToken";
const API_URL        = "https://ifge22nmdi.execute-api.eu-west-2.amazonaws.com/prod/detect";
const REDIRECT_URI   = "https://www.mahdirafiei.co.uk/app.html"; // update for CloudFront later
const LOGOUT_URI     = "https://www.mahdirafiei.co.uk/index.html";
// ────────────────────────────────────────────────────────────

let currentFile = null;
let idToken     = null;

// ── On page load ─────────────────────────────────────────────
window.addEventListener("load", async () => {
  const params = new URLSearchParams(window.location.search);
  const code   = params.get("code");

  if (code) {
    await exchangeCodeForToken(code);
    window.history.replaceState({}, "", window.location.pathname);
  }

  idToken = sessionStorage.getItem("id_token");

  if (idToken) {
    showApp();
  } else {
    // No token and no code — redirect back to portfolio
    window.location.href = "index.html";
    
  }
});

// ── Auth ─────────────────────────────────────────────────────
function login() {
  // Generate a random state value to protect against CSRF
  const state = Math.random().toString(36).substring(2);
  sessionStorage.setItem("oauth_state", state);

const url = `${COGNITO_DOMAIN}/oauth2/authorize`
    + `?client_id=${CLIENT_ID}`
    + `&response_type=code`
    + `&scope=${encodeURIComponent("openid email")}`
    + `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`
    + `&state=${state}`;

  window.location.href = url;
}

/* async function exchangeCodeForToken(code) {
  // Verify state to prevent CSRF attacks
  const params        = new URLSearchParams(window.location.search);
  const returnedState = params.get("state");
  const savedState    = sessionStorage.getItem("oauth_state");

  if (returnedState !== savedState) {
    showError("Security check failed. Please try signing in again.");
    return;
  }
  sessionStorage.removeItem("oauth_state");

  try {
    const response = await fetch(`${COGNITO_DOMAIN}/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type:   "authorization_code",
        client_id:    CLIENT_ID,
        code:         code,
        redirect_uri: REDIRECT_URI,
      })
    });

    if (!response.ok) {
      throw new Error("Token exchange failed");
    }

    const data = await response.json();
    sessionStorage.setItem("id_token",      data.id_token);
    sessionStorage.setItem("access_token",  data.access_token);
    sessionStorage.setItem("refresh_token", data.refresh_token);

  } catch (err) {
    showError(`Sign in failed: ${err.message}`);
  }
} */

async function exchangeCodeForToken(code) {
  const params        = new URLSearchParams(window.location.search);
  const returnedState = params.get("state");
  const savedState    = sessionStorage.getItem("oauth_state");

  if (returnedState !== savedState) {
    showError("Security check failed. Please try signing in again.");
    return;
  }
  sessionStorage.removeItem("oauth_state");

  try {

    // We call OUR Lambda, not Cognito
	const response = await fetch(TOKEN_PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code : code
      })
    });

    const data = await response.json();
	console.log("Lambda Response Data:", data);
    if (!response.ok) {
      throw new Error(data.error_description || data.error || "Token exchange failed");
    }

    sessionStorage.setItem("id_token",      data.id_token);
    sessionStorage.setItem("access_token",  data.access_token);
    sessionStorage.setItem("refresh_token", data.refresh_token);

  } catch (err) {
    showError(`Sign in failed: ${err.message}`);
  }
}

function logout() {
  sessionStorage.removeItem("id_token");
  sessionStorage.removeItem("access_token");
  sessionStorage.removeItem("refresh_token");
  sessionStorage.removeItem("oauth_state");

  const url = `${COGNITO_DOMAIN}/logout`
    + `?client_id=${CLIENT_ID}`
    + `&logout_uri=${encodeURIComponent(LOGOUT_URI)}`;

  window.location.href = url;
}

function showLogin() {
  document.getElementById("login-page").classList.remove("hidden");
  document.getElementById("app-page").classList.add("hidden");
}

function showApp() {
  //document.getElementById("login-page").classList.add("hidden");
  document.getElementById("app-page").classList.remove("hidden");

  try {
    const payload = JSON.parse(atob(idToken.split(".")[1]));
    document.getElementById("user-email").textContent = payload.email;
  } catch (e) {}
}

// ── File handling ─────────────────────────────────────────────
function handleFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;
  currentFile = file;

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = document.getElementById("preview-img");
    img.src   = e.target.result;
    img.onload = () => clearCanvas();
  };
  reader.readAsDataURL(file);

  document.getElementById("preview-container").classList.remove("hidden");
  document.getElementById("detect-btn").classList.remove("hidden");
  document.getElementById("upload-zone").classList.add("hidden");
  document.getElementById("stats-row").classList.add("hidden");
  document.getElementById("results-card").classList.add("hidden");
  document.getElementById("error-box").classList.add("hidden");
}

// ── Detection ─────────────────────────────────────────────────
async function detect() {
  if (!currentFile || !idToken) return;

  const btn = document.getElementById("detect-btn");
  btn.textContent = "Detecting...";
  btn.disabled    = true;
  hideError();

  try {
    const form = new FormData();
    form.append("file", currentFile);

    const response = await fetch(API_URL, {
      method:  "POST",
      headers: { "Authorization": `Bearer ${idToken}` },
      body:    form
    });

    if (response.status === 401) {
      sessionStorage.removeItem("id_token");
      showError("Session expired. Please sign in again.");
      setTimeout(showLogin, 2000);
      return;
    }

    if (!response.ok) throw new Error(`Server error: ${response.status}`);

    const data = await response.json();
    displayResults(data);

  } catch (err) {
    showError(`Detection failed: ${err.message}`);
  } finally {
    btn.textContent = "Detect receipts";
    btn.disabled    = false;
  }
}// ── Display results ───────────────────────────────────────────
function displayResults(data) {
  const boxes = data.boxes       || [];
  const confs = data.confs || [];

  drawBoxes(boxes, confs);

  const avgConf = confs.length
    ? Math.round(confs.reduce((a, b) => a + b, 0) / confs.length * 100)
    : 0;

  document.getElementById("stat-count").textContent = boxes.length;
  document.getElementById("stat-conf").textContent  = `${avgConf}%`;
  document.getElementById("stats-row").classList.remove("hidden");

  const list = document.getElementById("results-list");
  list.innerHTML = "";

  if (boxes.length === 0) {
    list.innerHTML = `<p style="font-size:14px;color:#6b6b68;padding:8px 0">No receipts detected.</p>`;
  } else {
    boxes.forEach((box, i) => {
      const conf  = Math.round((confs[i] || 0) * 100);
      const badge = conf >= 85 ? "conf-high" : conf >= 65 ? "conf-med" : "conf-low";
      const item  = document.createElement("div");
      item.className = "result-item";
      item.innerHTML = `
        <span>Receipt ${i + 1}</span>
        <span class="conf-badge ${badge}">${conf}%</span>
      `;
      list.appendChild(item);
    });
  }

  document.getElementById("results-card").classList.remove("hidden");
}

// ── Canvas drawing ────────────────────────────────────────────
function drawBoxes(boxes, confs) {
  const img    = document.getElementById("preview-img");
  const canvas = document.getElementById("box-canvas");
  const ctx    = canvas.getContext("2d");

  canvas.width  = img.naturalWidth;
  canvas.height = img.naturalHeight;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  boxes.forEach((box, i) => {
    const [x1, y1, x2, y2] = box;
    const conf  = confs[i] || 0;
    const w     = x2 - x1;
    const h     = y2 - y1;
    const color = conf >= 0.85 ? "#3B6D11"
                : conf >= 0.65 ? "#854F0B"
                :                "#A32D2D";

    ctx.strokeStyle = color;
    ctx.lineWidth   = Math.max(2, canvas.width / 200);
    ctx.strokeRect(x1, y1, w, h);

    const label    = `Receipt ${i + 1} — ${Math.round(conf * 100)}%`;
    const fontSize = Math.max(12, canvas.width / 40);
    ctx.font       = `${fontSize}px sans-serif`;
    const textW    = ctx.measureText(label).width;
    const padX = 6, padY = 4;

    ctx.fillStyle = color;
    ctx.fillRect(x1, y1 - fontSize - padY * 2, textW + padX * 2, fontSize + padY * 2);

    ctx.fillStyle = "#ffffff";
    ctx.fillText(label, x1 + padX, y1 - padY);
  });
}

function clearCanvas() {
  const canvas = document.getElementById("box-canvas");
  canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
}

// ── Error handling ────────────────────────────────────────────
function showError(msg) {
  const box = document.getElementById("error-box");
  box.textContent = msg;
  box.classList.remove("hidden");
}

function hideError() {
  document.getElementById("error-box").classList.add("hidden");
}