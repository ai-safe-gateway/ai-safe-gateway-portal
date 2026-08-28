const config = window.ASG_PORTAL_CONFIG || {};
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const SESSION_KEY = "asg_session";
const REMEMBER_KEY = "asg_remember_login";

const state = {
  session: null,
  user: null,
  company: null,
  member: null,
  licenses: [],
  devices: [],
  usage: [],
  release: null,
  portalBootstrap: null,
  demo: Boolean(config.demoMode || !config.supabaseUrl || !config.supabasePublishableKey),
};

const demoData = (() => {
  const now = new Date();
  const usage = Array.from({ length: 12 }, (_, index) => {
    const date = new Date(now); date.setDate(now.getDate() - (11 - index) * 3);
    const documents = [4, 7, 5, 9, 11, 8, 14, 12, 18, 15, 21, 24][index];
    const exported = Math.max(0, documents - 1);
    const qualitySamples = index % 3 === 0 ? 1 : 0;
    return {
      device_hash: ["21cf4e4ee581d754", "8c19df38a201cc42", "570ea8093ccf6f91"][index % 3],
      period_end: date.toISOString().slice(0, 10),
      counts: {
        documents_analyzed: documents,
        packages_exported: exported,
        detection_count: documents * 18,
        manual_added_count: index % 4,
        disabled_count: index % 3,
        type_changed_count: index % 5 === 0 ? 2 : 0,
        human_reviewed_count: documents * 4,
        auto_reviewed_count: documents * 14,
        correction_free_documents: Math.max(0, exported - (index % 3 === 0 ? 1 : 0)),
        final_preview_acknowledged_count: exported,
        risk_acknowledged_count: index % 4 === 0 ? 1 : 0,
        quality_comparisons: qualitySamples,
        quality_score_samples: qualitySamples,
        quality_score_sum: qualitySamples ? [95, 93, 96, 94][Math.floor(index / 3)] : 0,
        use_minutes_count: Math.round(exported * .55),
        use_contract_count: Math.round(exported * .2),
        use_analysis_count: Math.round(exported * .15),
        use_general_count: Math.max(0, exported - Math.round(exported * .55) - Math.round(exported * .2) - Math.round(exported * .15)),
        failed_operations: index % 7 === 0 ? 1 : 0,
      },
    };
  });
  return {
    user: { id: "demo-user", email: "admin@sample.co.jp", user_metadata: { display_name: "山田 太郎" } },
    company: { id: "8d31c4ba-28b2-4fe4-a174-95cf5fb3e732", company_code: "ASG-DEMO-2401", name: "株式会社サンプル", plan: "Business", status: "trial", created_at: "2026-07-01T00:00:00Z" },
    member: { role: "owner", display_name: "山田 太郎" },
    licenses: [
      { id: "c4b2b217-29cc-4efd-b1a0-445731ac1957", label: "本社 PoC評価用", edition: "Business", seats: 10, status: "active", expires_at: "2026-08-31T00:00:00Z" },
      { id: "44d93d13-c00c-4b83-af25-905df1e42244", label: "営業部 検証用", edition: "Business", seats: 5, status: "active", expires_at: "2026-08-15T00:00:00Z" },
    ],
    devices: [
      { id: "1", license_id: "c4b2b217-29cc-4efd-b1a0-445731ac1957", device_hash: "21cf4e4ee581d754…", app_version: "0.35.0", last_seen_at: new Date().toISOString(), active: true },
      { id: "2", license_id: "c4b2b217-29cc-4efd-b1a0-445731ac1957", device_hash: "8c19df38a201cc42…", app_version: "0.35.0", last_seen_at: new Date(Date.now()-86400000).toISOString(), active: true },
      { id: "3", license_id: "44d93d13-c00c-4b83-af25-905df1e42244", device_hash: "570ea8093ccf6f91…", app_version: "0.33.3", last_seen_at: new Date(Date.now()-4*86400000).toISOString(), active: true },
    ],
    release: {
      version: "0.38.0", platform: "windows-x64", file_name: "AISafeGatewayPoC-Portable-v0.38.0.exe",
      size_bytes: 46460293, sha256: "a4e1dc824ac8b8c281cf9ba9fdf093baf0d05a9703af95acb38b6b5e2d6ef120",
      published_at: "2026-07-31T00:00:00Z", minimum_os: "Windows 10 64-bit", signed: false,
    }, usage,
  };
})();

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}
function showNotice(message, type = "success") {
  const node = $("#notice"); node.textContent = message; node.className = `notice ${type}`; node.hidden = false;
  clearTimeout(showNotice.timer); showNotice.timer = setTimeout(() => { node.hidden = true; }, 5000);
}
function friendlyError(error) {
  const code = String(error?.message || error || "");
  const messages = {
    invalid_credentials: "メールアドレスまたはパスワードが正しくありません。",
    email_not_confirmed: "確認メールのリンクを開いてからログインしてください。",
    user_already_exists: "このメールアドレスは既に登録されています。",
    weak_password: "より長く複雑なパスワードを設定してください。",
    unauthorized: "認証の有効期限が切れました。もう一度ログインしてください。",
    forbidden: "この操作を行う管理者権限がありません。",
    company_already_registered: "企業登録は既に完了しています。",
    license_not_active: "ライセンスが停止中、または有効期限切れです。",
    seat_limit_reached: "利用可能な端末上限に達しています。",
    trial_limit_reached: "評価版の発行上限を超えています。既存ライセンスをご利用ください。",
    rate_limited: "操作が集中しています。少し待ってからやり直してください。",
    invalid_request: "入力内容を確認してください。",
    release_unavailable: "現在ダウンロードできるWindows版がありません。管理者へお問い合わせください。",
  };
  return messages[code] || code || "処理を完了できませんでした。";
}
function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}
function formatNumber(value) { return new Intl.NumberFormat("ja-JP").format(Number(value || 0)); }
function sumCounts(rows) {
  return rows.reduce((total, row) => {
    Object.entries(row.counts || {}).forEach(([key, value]) => { total[key] = (total[key] || 0) + Number(value || 0); });
    return total;
  }, {});
}
function sessionHeaders(extra = {}) {
  return { apikey: config.supabasePublishableKey, Authorization: `Bearer ${state.session?.access_token || ""}`, "Content-Type": "application/json", ...extra };
}
async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body = {}; try { body = text ? JSON.parse(text) : {}; } catch { body = { message: text }; }
  if (!response.ok) throw new Error(body.error_description || body.msg || body.message || body.error || `HTTP ${response.status}`);
  return body;
}
async function authRequest(path, body) {
  return fetchJson(`${config.supabaseUrl}/auth/v1/${path}`, { method: "POST", headers: { apikey: config.supabasePublishableKey, "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
async function rest(path) {
  return fetchJson(`${config.supabaseUrl}/rest/v1/${path}`, { headers: sessionHeaders() });
}
async function invoke(name, body) {
  const base = config.functionsBaseUrl || `${config.supabaseUrl}/functions/v1`;
  return fetchJson(`${base}/${name}`, { method: "POST", headers: sessionHeaders(), body: JSON.stringify(body) });
}

function clearStoredSession() {
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(SESSION_KEY);
}
function saveSession(session, remember = localStorage.getItem(REMEMBER_KEY) !== "false") {
  state.session = session;
  state.user = session?.user || state.user;
  state.portalBootstrap = null;
  clearStoredSession();
  const target = remember ? localStorage : sessionStorage;
  target.setItem(SESSION_KEY, JSON.stringify({ ...session, user: state.user }));
  localStorage.setItem(REMEMBER_KEY, remember ? "true" : "false");
}

async function refreshSession(refreshToken) {
  if (!refreshToken) throw new Error("認証の有効期限が切れました。もう一度ログインしてください。");
  const refreshed = await authRequest("token?grant_type=refresh_token", { refresh_token: refreshToken });
  saveSession(refreshed);
  return refreshed;
}

async function restoreAuthenticatedSession(cached) {
  state.session = cached;
  try {
    state.user = await fetchJson(`${config.supabaseUrl}/auth/v1/user`, { headers: sessionHeaders() });
    saveSession({ ...cached, user: state.user });
  } catch (error) {
    await refreshSession(cached?.refresh_token);
  }
}

function setAuthTab(tab) {
  const login = tab === "login";
  $("#loginTab").classList.toggle("active", login); $("#registerTab").classList.toggle("active", !login);
  $("#loginForm").hidden = !login; $("#registerForm").hidden = login;
}
$("#loginTab").addEventListener("click", () => setAuthTab("login"));
$("#registerTab").addEventListener("click", () => setAuthTab("register"));
if (new URLSearchParams(location.search).get("mode") === "register") {
  setAuthTab("register");
}

async function completePendingCompany() {
  if (!state.session || !state.user?.id) return;
  const bootstrap = await invoke("portal-bootstrap", {});
  if (bootstrap.registered) {
    state.portalBootstrap = bootstrap;
    localStorage.removeItem("asg_pending_company");
    return;
  }
  const pending = localStorage.getItem("asg_pending_company");
  const metadata = state.user?.user_metadata || {};
  let saved = null;
  try { saved = pending ? JSON.parse(pending) : null; } catch { localStorage.removeItem("asg_pending_company"); }
  const data = saved || {
    company_name: String(metadata.company_name || "").trim(),
    display_name: String(metadata.display_name || "").trim(),
  };
  if (!data.company_name || !data.display_name) return;
  try {
    const result = await invoke("register-company", data);
    state.portalBootstrap = null;
    localStorage.removeItem("asg_pending_company");
    if (result?.trial_license?.license_envelope) {
      downloadLicenseEnvelope(result.trial_license.license_envelope, result.trial_license.license_id);
      showNotice("企業登録が完了し、30日間のPoCライセンスを保存しました。");
    }
  } catch (error) {
    if (error.message === "company_already_registered") {
      localStorage.removeItem("asg_pending_company");
      return;
    }
    throw error;
  }
}
$("#loginForm").addEventListener("submit", async event => {
  event.preventDefault();
  try {
    if (state.demo) return enterDemo();
    const result = await authRequest("token?grant_type=password", { email: $("#loginEmail").value.trim(), password: $("#loginPassword").value });
    saveSession(result, $("#rememberLogin").checked);
    await completePendingCompany(); await loadPortal();
  } catch (error) { showNotice(`ログインできません：${friendlyError(error)}`, "error"); }
});
$("#demoLogin").addEventListener("click", enterDemo);
$("#forgotPassword").addEventListener("click", () => {
  $("#passwordEmail").value = $("#loginEmail").value.trim(); $("#passwordDialog").showModal();
});
$("#passwordRequestForm").addEventListener("submit", async event => {
  event.preventDefault();
  try {
    if (state.demo) { showNotice("デモモードではメールを送信しません。", "error"); return; }
    await authRequest("recover", { email: $("#passwordEmail").value.trim(), redirect_to: `${location.origin}${location.pathname}` });
    $("#passwordDialog").close(); showNotice("再設定メールを送信しました。");
  } catch (error) { showNotice(`送信できません：${friendlyError(error)}`, "error"); }
});
$("#newPasswordForm").addEventListener("submit", async event => {
  event.preventDefault();
  try {
    await fetchJson(`${config.supabaseUrl}/auth/v1/user`, { method: "PUT", headers: sessionHeaders(), body: JSON.stringify({ password: $("#newPassword").value }) });
    $("#newPasswordDialog").close(); history.replaceState(null, "", location.pathname); showNotice("パスワードを変更しました。ログインしてください。");
  } catch (error) { showNotice(`変更できません：${friendlyError(error)}`, "error"); }
});

$("#registerForm").addEventListener("submit", async event => {
  event.preventDefault();
  const registration = { company_name: $("#registerCompany").value.trim(), display_name: $("#registerName").value.trim() };
  try {
    if (state.demo) {
      showNotice("デモモードでは登録内容を保存しません。Supabase設定後に利用できます。", "error"); return;
    }
    const result = await authRequest("signup", { email: $("#registerEmail").value.trim(), password: $("#registerPassword").value, data: { display_name: registration.display_name, company_name: registration.company_name } });
    localStorage.setItem("asg_pending_company", JSON.stringify(registration));
    if (result.access_token) {
      saveSession(result);
      await completePendingCompany(); await loadPortal();
    } else {
      setAuthTab("login"); showNotice("確認メールを送信しました。確認後にログインすると企業登録が完了します。");
    }
  } catch (error) { showNotice(`登録できません：${friendlyError(error)}`, "error"); }
});

function enterDemo() {
  Object.assign(state, demoData, { demo: true, session: { access_token: "demo" } });
  renderPortal();
  showView("productdemo");
}
async function loadPortal() {
  if (state.demo) return enterDemo();
  const bootstrap = state.portalBootstrap || await invoke("portal-bootstrap", {});
  state.portalBootstrap = null;
  if (!bootstrap.registered) {
    setAuthTab("register");
    throw new Error("企業登録が完了していません。「企業を登録」から登録してください。");
  }
  state.member = bootstrap.member;
  state.company = bootstrap.company;
  state.licenses = bootstrap.licenses || [];
  state.devices = bootstrap.devices || [];
  state.usage = bootstrap.usage || [];
  state.release = null;
  renderPortal();
  showView("dashboard");
}
function renderPortal() {
  $("#authShell").hidden = true; $("#portalShell").hidden = false;
  $("#companyNameHeader").textContent = state.company.name; $("#companyCodeHeader").textContent = `企業ID ${state.company.company_code}`;
  $("#userAvatar").textContent = (state.member.display_name || state.user.email || "管").slice(0, 1);
  $("#openLicenseModal").hidden = !["owner","admin"].includes(state.member?.role);
  renderDashboard(); renderLicenses(); renderMyPage(); renderDownloads();
}

function filteredUsage() {
  const period = $("#periodSelect").value;
  if (period === "all") return state.usage;
  const since = new Date(); since.setDate(since.getDate() - Number(period));
  return state.usage.filter(row => new Date(row.period_end) >= since);
}
function defaultRoiSettings() {
  return { reviewSeconds: 15 };
}
function roiStorageKey() { return `asg_roi_settings_${state.company?.id || "default"}`; }
function loadRoiSettings() {
  const defaults = defaultRoiSettings();
  try {
    const saved = JSON.parse(localStorage.getItem(roiStorageKey()) || "{}");
    return { reviewSeconds: Math.max(1, Number(saved.reviewSeconds ?? defaults.reviewSeconds)) };
  } catch { return defaults; }
}
function rate(value, denominator) { return denominator > 0 ? value / denominator * 100 : null; }
function rateText(value) { return value == null ? "収集中" : `${Math.round(value)}%`; }
function clampRate(value) { return Math.max(0, Math.min(100, Number(value || 0))); }
function metricRow(label, value, help, tone = "") {
  const width = value == null ? 0 : clampRate(value);
  return `<div class="metric-row ${tone}"><div class="metric-row-head"><span>${escapeHtml(label)}</span><strong>${rateText(value)}</strong></div><div class="metric-track"><i style="width:${width}%"></i></div><small>${escapeHtml(help)}</small></div>`;
}
function verdictCard(label, status, copy, tone) {
  return `<article class="verdict-card ${tone}"><small>${escapeHtml(label)}</small><strong>${escapeHtml(status)}</strong><span>${escapeHtml(copy)}</span></article>`;
}
function renderDashboard() {
  const rows = filteredUsage(); const counts = sumCounts(rows); const settings = loadRoiSettings();
  const exported = counts.packages_exported || 0;
  const analyzed = counts.documents_analyzed || 0;
  const failed = counts.failed_operations || 0;
  const detections = counts.detection_count || 0;
  const reviewed = (counts.human_reviewed_count || 0) + (counts.auto_reviewed_count || 0);
  const autoRate = reviewed ? Math.round((counts.auto_reviewed_count || 0) / reviewed * 100) : 0;
  const hasSafetyV2 = rows.some(row => Object.hasOwn(row.counts || {}, "final_preview_acknowledged_count"));
  const hasValueV2 = rows.some(row => Object.hasOwn(row.counts || {}, "use_minutes_count"));
  const finalCheckRate = hasSafetyV2 ? rate(counts.final_preview_acknowledged_count || 0, exported) : null;
  const correctionFreeRate = hasSafetyV2 ? rate(counts.correction_free_documents || 0, exported) : null;
  const successRate = rate(exported, exported + failed);
  const qualitySamples = counts.quality_score_samples || 0;
  const qualityAverage = qualitySamples ? (counts.quality_score_sum || 0) / qualitySamples : null;
  const savedMinutes = Math.round((counts.auto_reviewed_count || 0) * settings.reviewSeconds / 60);
  const savedHours = savedMinutes / 60;
  const savedDays = savedHours / 7.5;
  const savedMinutesPerDocument = exported ? savedMinutes / exported : 0;
  const seats = state.licenses.filter(item => item.status === "active").reduce((sum, item) => sum + Number(item.seats || 0), 0);
  const periodDeviceHashes = new Set(rows.map(row => row.device_hash).filter(Boolean));
  const activeDevices = periodDeviceHashes.size || state.devices.filter(item => item.active).length;
  const seatUseRate = rate(activeDevices, seats);
  const activeDays = new Set(rows.map(row => row.period_end).filter(Boolean)).size;
  const docsPerDevice = activeDevices ? exported / activeDevices : 0;
  const useCases = [
    ["議事録・要約", counts.use_minutes_count || 0, "minutes"],
    ["契約・規程", counts.use_contract_count || 0, "contract"],
    ["調査・分析", counts.use_analysis_count || 0, "analysis"],
    ["その他", counts.use_general_count || 0, "general"],
  ];
  const useTotal = useCases.reduce((sum, item) => sum + item[1], 0);
  const useBreadth = useCases.filter(item => item[1] > 0).length;
  const adoptionTone = exported >= 20 && (seatUseRate == null || seatUseRate >= 30) ? "good" : exported ? "watch" : "neutral";
  const safetyTone = finalCheckRate != null && finalCheckRate >= 95 && (successRate ?? 0) >= 98 ? "good" : hasSafetyV2 ? "watch" : "neutral";
  const valueTone = useBreadth >= 2 && qualitySamples >= 3 ? "good" : hasValueV2 ? "watch" : "neutral";
  const impactTone = savedMinutes >= 60 ? "good" : savedMinutes > 0 ? "watch" : "neutral";
  $("#executiveSummary").innerHTML = [
    verdictCard("利用定着", exported ? `${formatNumber(exported)}文書で利用` : "利用実績なし", seatUseRate == null ? "端末利用率は収集中" : `契約端末の${Math.round(seatUseRate)}%が利用`, adoptionTone),
    verdictCard("安全運用", finalCheckRate == null ? "新指標を収集中" : finalCheckRate >= 95 ? "最終確認は良好" : "確認率に注意", finalCheckRate == null ? "最新版から集計を開始します" : `最終確認 ${Math.round(finalCheckRate)}%`, safetyTone),
    verdictCard("有効活用", hasValueV2 ? `${useBreadth}種類の業務用途` : "用途データを収集中", qualityAverage == null ? "回答品質比較を増やしてください" : `品質維持 ${qualityAverage.toFixed(1)}%`, valueTone),
    verdictCard("工数削減", savedMinutes ? `${savedHours.toFixed(1)}時間を削減` : "削減効果を収集中", `${formatNumber(counts.auto_reviewed_count || 0)}件を自動確認`, impactTone),
  ].join("");
  const cards = [
    ["安全化した文書", exported, "件", `${activeDays}日で利用`, "document"],
    ["期間内の利用端末", activeDevices, "台", seats ? `${activeDevices}/${seats}台` : "端末上限なし", "device"],
    ["確認削減時間", (savedMinutes / 60).toFixed(1), "時間", `${settings.reviewSeconds}秒/候補で試算`, "time"],
    ["1文書あたり削減", savedMinutesPerDocument.toFixed(1), "分", "平均の確認削減時間", "money"],
  ];
  $("#kpiGrid").innerHTML = cards.map(([label, value, unit, trend, icon]) => `<article class="outcome-card"><span class="outcome-icon ${icon}"></span><div><small>${escapeHtml(label)}</small><div class="outcome-value"><strong>${typeof value === "number" ? formatNumber(value) : escapeHtml(value)}</strong><span>${unit}</span></div><em>${escapeHtml(trend)}</em></div></article>`).join("");
  $("#adoptionDetails").innerHTML = `<div class="adoption-hero"><div class="radial-progress" style="--progress:${clampRate(seatUseRate)}"><strong>${rateText(seatUseRate)}</strong><small>端末利用率</small></div><div class="compact-stats"><div><strong>${formatNumber(exported)}</strong><small>文書</small></div><div><strong>${docsPerDevice.toFixed(1)}</strong><small>文書/端末</small></div><div><strong>${activeDays}</strong><small>利用日</small></div></div></div><p class="data-note">実際のAI送信は追跡せず、「安全化して出力した件数」を利用実績として表示します。</p>`;
  $("#safetyDetails").innerHTML = [
    metricRow("最終プレビュー確認率", finalCheckRate, "出力前の人による最終確認"),
    metricRow("修正なし文書率", correctionFreeRate, "追加・解除・種類変更なし"),
    metricRow("処理成功率", successRate, `${failed}件の失敗を記録`),
  ].join("") + `<p class="data-note">安全性を保証する数値ではなく、確認工程が守られているかを見る運用指標です。</p>`;
  const maxUse = Math.max(1, ...useCases.map(item => item[1]));
  const dominantUse = [...useCases].sort((a, b) => b[1] - a[1])[0];
  const adviceByUse = {
    minutes: ["会議後の整理で真価を発揮", "決定事項・担当・期限を残す業務に定着しています。次は商談後の提案骨子、案件進捗レポート、代理店・アライアンス先との協議整理へ広げられます。"],
    contract: ["条件整理と交渉準備で真価を発揮", "契約・規程の確認が中心です。次は代理店契約、アライアンス条件、責任分界、更新期限の比較へ広げられます。"],
    analysis: ["比較と意思決定支援で真価を発揮", "調査・分析が中心です。次は費用削減案、商品別の強み、提携候補、販売チャネルの比較整理へ広げられます。"],
    general: ["用途を具体化すると効果が見えます", "汎用利用が中心です。議事録・契約・分析のいずれかを選ぶと、用途別の効果と次の展開先を判断しやすくなります。"],
  };
  const useAdvice = adviceByUse[dominantUse?.[2] || "general"];
  $("#useCaseDetails").innerHTML = hasValueV2 ? `<div class="usecase-bars">${useCases.map(([label, value, key]) => `<div class="usecase-row ${key}"><span>${label}</span><div><i style="width:${value / maxUse * 100}%"></i></div><strong>${formatNumber(value)}件</strong></div>`).join("")}</div><div class="opportunity-callout"><small>活用アドバイス</small><strong>${escapeHtml(useAdvice[0])}</strong><p>${escapeHtml(useAdvice[1])}</p></div><div class="quality-chip"><span>回答品質比較</span><strong>${qualityAverage == null ? "未評価" : `${qualityAverage.toFixed(1)}%`}</strong><small>${qualitySamples}回の比較</small></div><p class="data-note">用途は出力時に選択した目的です。本文のテーマやAIで完成した成果物は追跡しません。</p>` : `<div class="empty-metric"><strong>用途別集計を開始しました</strong><p>最新版アプリから、議事録・契約・分析などの件数だけを収集します。</p></div>`;
  $("#impactDetails").innerHTML = `<div class="impact-hero ${impactTone}"><small>期間内の削減時間</small><strong>${savedHours.toFixed(1)}時間</strong><span>${savedDays.toFixed(1)}人日相当</span></div><div class="time-breakdown"><div><small>自動確認</small><strong>${formatNumber(counts.auto_reviewed_count || 0)}件</strong></div><div><small>1件の試算</small><strong>${settings.reviewSeconds}秒</strong></div><div><small>1文書あたり</small><strong>${savedMinutesPerDocument.toFixed(1)}分</strong></div></div><p class="data-note">自動確認${formatNumber(counts.auto_reviewed_count || 0)}件×${settings.reviewSeconds}秒で試算。実測工数ではありません。</p>`;
  const max = Math.max(1, ...rows.map(row => Number(row.counts?.packages_exported || 0)));
  $("#usageChart").innerHTML = rows.length ? rows.slice(-12).map(row => { const value = Number(row.counts?.packages_exported || 0); return `<div class="bar-column"><span class="bar-value">${value}</span><div class="bar" style="height:${Math.max(3, value / max * 88)}%"></div><span class="bar-label">${escapeHtml(row.period_end.slice(5).replace("-", "/"))}</span></div>`; }).join("") : "<p>まだ集計データがありません。</p>";
  $("#chartTotal").textContent = `合計 ${formatNumber(exported)}件`;
  const insights = [];
  if (seatUseRate != null && seatUseRate < 30) insights.push(["↗", "利用部門を広げる", `契約端末の利用率は${Math.round(seatUseRate)}%です。定型業務を1つ追加すると定着度を確認しやすくなります。`]);
  if ((counts.manual_added_count || 0) > exported * .25) insights.push(["＋", "辞書登録を確認", "手動追加が多いため、頻出語を企業辞書へ登録すると確認時間を減らせます。"]);
  if ((counts.disabled_count || 0) > 0) insights.push(["−", "除外候補を確認", "マスク解除された一般語を除外ルールへ追加すると過剰検出を抑えられます。"]);
  if ((counts.quality_comparisons || 0) < 3) insights.push(["◎", "回答品質を比較", "高頻度の議事録で原文版とマスク版を比較し、品質維持率を確認してください。"]);
  if (dominantUse?.[1] > 0) insights.push(["→", useAdvice[0], useAdvice[1]]);
  if (!insights.length) insights.push(["✓", "安定して運用中", "利用・安全・品質・削減時間に大きな注意点はありません。月次で傾向を確認してください。"]);
  $("#insightList").innerHTML = insights.slice(0, 3).map(([icon, title, copy]) => `<div class="insight"><span class="insight-icon">${icon}</span><div><strong>${escapeHtml(title)}</strong><small>${escapeHtml(copy)}</small></div></div>`).join("");
  $("#payloadPreview").textContent = JSON.stringify({ company_id: state.company.id, license_id_hash: "SHA-256…", device_hash: "SHA-256…", app_version: "0.38.0", counts, time_assumption_sent: false, contains: { raw_text: false, file_names: false, detected_terms: false, dictionary_values: false, mapping_values: false, ai_answers: false } }, null, 2);
}
$("#periodSelect").addEventListener("change", renderDashboard);
$("#openRoiSettings").addEventListener("click", () => {
  const settings = loadRoiSettings();
  $("#roiReviewSeconds").value = settings.reviewSeconds;
  $("#roiSettingsDialog").showModal();
});
$("#roiSettingsForm").addEventListener("submit", event => {
  event.preventDefault();
  localStorage.setItem(roiStorageKey(), JSON.stringify({
    reviewSeconds: Number($("#roiReviewSeconds").value),
  }));
  $("#roiSettingsDialog").close(); renderDashboard(); showNotice("削減時間の試算条件を反映しました。");
});
$("#resetRoiSettings").addEventListener("click", () => {
  const settings = defaultRoiSettings();
  $("#roiReviewSeconds").value = settings.reviewSeconds;
});

function formatFileSize(bytes) {
  const size = Number(bytes || 0);
  if (!size) return "—";
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
function renderDownloads() {
  const release = state.release;
  const button = $("#downloadWindowsButton");
  if (!release) {
    $("#releaseMeta").innerHTML = "<span>最新版を確認しています…</span>";
    $("#releaseHash").textContent = "確認中";
    $("#releaseSignature").textContent = "確認中";
    $("#downloadAvailability").textContent = "公開ファイルを確認しています。";
    $("#copyReleaseHash").disabled = true;
    button.disabled = true;
    return;
  }
  $("#releaseMeta").innerHTML = [
    `Version ${escapeHtml(release.version)}`,
    escapeHtml(formatFileSize(release.size_bytes)),
    escapeHtml(release.platform === "windows-x64" ? "Windows 64-bit" : release.platform),
    "ポータブル版",
  ].map(value => `<span>${value}</span>`).join("");
  $("#releaseOs").textContent = release.minimum_os || "Windows 10 / 11 64-bit";
  $("#releaseSignature").textContent = release.signed ? "コード署名済み" : "評価版・未署名";
  $("#releaseHash").textContent = release.sha256;
  $("#copyReleaseHash").disabled = false;
  $("#downloadAvailability").textContent = `公開日 ${formatDate(release.published_at)}・URLは発行後3分間だけ有効です。`;
  button.disabled = false;
}
async function loadReleaseMetadata() {
  if (state.release) { renderDownloads(); return; }
  renderDownloads();
  try {
    const result = await invoke("release-download", { action: "metadata" });
    state.release = result.release;
    renderDownloads();
  } catch (error) {
    $("#downloadAvailability").textContent = friendlyError(error);
    $("#releaseMeta").innerHTML = "<span>現在利用できません</span>";
  }
}
$("#downloadWindowsButton").addEventListener("click", async () => {
  const button = $("#downloadWindowsButton");
  const original = button.innerHTML;
  button.disabled = true;
  button.innerHTML = '<span class="download-button-icon">…</span><span><small>安全なURLを発行中</small><strong>ダウンロードを準備しています</strong></span><b>→</b>';
  try {
    if (state.demo) {
      showNotice("デモ画面ではEXEをダウンロードしません。企業登録後に利用できます。", "error");
      return;
    }
    const result = await invoke("release-download", { action: "download" });
    state.release = result.release;
    renderDownloads();
    const link = document.createElement("a");
    link.href = result.signed_url;
    link.rel = "noopener noreferrer";
    document.body.appendChild(link);
    link.click();
    link.remove();
    showNotice(`Windows版 v${result.release.version} のダウンロードを開始しました。`);
  } catch (error) {
    showNotice(`ダウンロードできません：${friendlyError(error)}`, "error");
  } finally {
    button.innerHTML = original;
    button.disabled = !state.release;
  }
});
$("#copyReleaseHash").addEventListener("click", async () => {
  if (!state.release?.sha256) return;
  await navigator.clipboard.writeText(state.release.sha256);
  showNotice("SHA-256をコピーしました。");
});

function renderLicenses() {
  const totalSeats = state.licenses.filter(item => item.status === "active").reduce((sum, item) => sum + Number(item.seats || 0), 0);
  const activeDevices = state.devices.filter(item => item.active).length;
  const activeExpiry = state.licenses.filter(item => item.status === "active").map(item => new Date(item.expires_at)).sort((a,b)=>a-b)[0];
  const trialDays = activeExpiry ? Math.max(0, Math.ceil((activeExpiry - new Date()) / 86400000)) : 0;
  const canManage = ["owner","admin"].includes(state.member?.role);
  $("#licenseSummary").innerHTML = [["有効ライセンス",state.licenses.filter(item=>item.status==="active").length],["端末上限",totalSeats],["利用中",activeDevices],[state.company.status === "trial" ? "評価版 残り" : "利用可能",state.company.status === "trial" ? `${trialDays}日` : Math.max(0,totalSeats-activeDevices)]].map(([label,value])=>`<div class="summary-cell"><small>${label}</small><strong>${typeof value === "number" ? formatNumber(value) : escapeHtml(value)}</strong></div>`).join("");
  $("#licenseRows").innerHTML = state.licenses.length ? state.licenses.map(item => {
    const used = state.devices.filter(device => device.license_id === item.id && device.active).length;
    const active = item.status === "active";
    const action = active ? "suspend" : "activate";
    const actionLabel = active ? "一時停止" : "再開";
    return `<tr><td><strong>${escapeHtml(item.label)}</strong><br><code>${escapeHtml(item.id.slice(0,8))}…</code></td><td>${escapeHtml(item.edition)}</td><td>${used} / ${item.seats}</td><td>${formatDate(item.expires_at)}</td><td><span class="status-badge ${active ? "" : "danger"}">${active ? "有効" : "停止"}</span></td><td>${canManage && !["expired","cancelled"].includes(item.status) ? `<button class="row-action ${active ? "danger-outline" : ""}" type="button" data-license-id="${escapeHtml(item.id)}" data-license-action="${action}">${actionLabel}</button>` : "—"}</td></tr>`;
  }).join("") : `<tr><td colspan="6">ライセンスはありません。</td></tr>`;
  $("#deviceRows").innerHTML = state.devices.length ? state.devices.map(item => {
    const action = item.active ? "deactivate" : "reactivate";
    return `<tr><td><code>${escapeHtml(item.device_hash.slice(0,18))}…</code><br><small>初回 ${formatDate(item.first_seen_at)}</small></td><td>${escapeHtml(item.app_version || "—")}</td><td>${formatDate(item.last_seen_at)}</td><td><span class="status-badge ${item.active ? "" : "danger"}">${item.active ? "利用中" : "解除済み"}</span></td><td>${canManage ? `<button class="row-action ${item.active ? "danger-outline" : ""}" type="button" data-device-id="${escapeHtml(item.id)}" data-device-action="${action}">${item.active ? "端末を解除" : "再登録"}</button>` : "—"}</td></tr>`;
  }).join("") : `<tr><td colspan="5">認証端末はありません。</td></tr>`;
}
function renderMyPage() {
  $("#myCompanyName").textContent = state.company.name; $("#companyEmblem").textContent = state.company.name.replace(/株式会社|有限会社/g, "").trim().slice(0,1) || "A";
  const status = $("#companyStatusBadge"); status.textContent = state.company.status === "active" ? "契約中" : "評価中"; status.className = `status-badge ${state.company.status === "active" ? "" : "warn"}`;
  $("#companyDetails").innerHTML = [["企業ID",state.company.company_code],["内部ID",state.company.id],["プラン",state.company.plan],["登録日",formatDate(state.company.created_at)]].map(([k,v])=>`<dt>${k}</dt><dd>${escapeHtml(v)}</dd>`).join("");
  $("#memberDetails").innerHTML = [["担当者",state.member.display_name],["メール",state.user.email],["権限",state.member.role === "owner" ? "企業所有者" : "管理者"]].map(([k,v])=>`<dt>${k}</dt><dd>${escapeHtml(v)}</dd>`).join("");
}

function showView(name) {
  $$(".view").forEach(view => view.classList.toggle("active", view.id === `${name}View`));
  $$(".nav-button").forEach(button => button.classList.toggle("active", button.dataset.view === name));
  $(".sidebar").classList.remove("open");
  if (name === "downloads") loadReleaseMetadata();
}
$$(".nav-button").forEach(button => button.addEventListener("click", () => showView(button.dataset.view)));
$$('[data-go]').forEach(button => button.addEventListener("click", () => showView(button.dataset.go)));
$("#menuButton").addEventListener("click", () => $(".sidebar").classList.toggle("open"));
$("#showPayloadButton").addEventListener("click", () => $("#payloadDialog").showModal());
$("#openLicenseModal").addEventListener("click", () => $("#licenseDialog").showModal());
$$('[data-close]').forEach(button => button.addEventListener("click", () => $(`#${button.dataset.close}`).close()));
$("#copyCompanyId").addEventListener("click", async () => { await navigator.clipboard.writeText(state.company.company_code); showNotice("企業IDをコピーしました。"); });
$("#refreshButton").addEventListener("click", async () => { try { if (!state.demo) await loadPortal(); else renderPortal(); showNotice("最新状態へ更新しました。"); } catch (error) { showNotice(error.message,"error"); } });

const MASK_DEMO_SAMPLE = "株式会社ミライ通信との提案会議を実施しました。営業担当の山田太郎が、案件コードPJ-2026-081の見積書を8月31日までに提出します。連絡先は03-1234-5678、sales@mirai.example.jpです。";
const MASK_DEMO_RULES = [
  { type: "企業名", role: "通信会社", replacement: "[通信会社A]", pattern: /株式会社ミライ通信/gu },
  { type: "人物名", role: "営業担当", replacement: "[営業担当A]", pattern: /山田太郎/gu },
  { type: "案件コード", role: "提案案件", replacement: "[案件A]", pattern: /PJ-\d{4}-\d{3}/gu },
  { type: "電話番号", role: "連絡先", replacement: "[電話番号A]", pattern: /(?<!\d)0\d{1,4}-\d{1,4}-\d{3,4}(?!\d)/gu },
  { type: "メール", role: "連絡先", replacement: "[メールA]", pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu },
];
let maskDemoCandidates = [];
let guardDemoMode = "text";

function detectDemoEntities(text) {
  const findings = [];
  MASK_DEMO_RULES.forEach(rule => {
    for (const match of text.matchAll(rule.pattern)) {
      findings.push({ ...rule, original: match[0], start: match.index, end: match.index + match[0].length, selected: true });
    }
  });
  return findings.sort((a, b) => a.start - b.start).filter((item, index, all) => !all.slice(0, index).some(other => item.start < other.end && item.end > other.start));
}

function replaceDemoEntities(text, findings) {
  return findings.filter(item => item.selected).sort((a, b) => b.start - a.start).reduce((result, item) => `${result.slice(0, item.start)}${item.replacement}${result.slice(item.end)}`, text);
}

function setMaskDemoStep(step) {
  const spans = $$("#maskDemoSteps span");
  const lines = $$("#maskDemoSteps i");
  spans.forEach((item, index) => item.classList.toggle("active", index === step - 1));
  lines.forEach((item, index) => item.classList.toggle("done", index < step - 1));
}

function renderMaskDemoCandidates() {
  const host = $("#maskDemoCandidates");
  $("#maskDemoCount").textContent = `${maskDemoCandidates.length}件を検出`;
  if (!maskDemoCandidates.length) {
    host.className = "demo-empty-state";
    host.innerHTML = "<span>✓</span><strong>保護対象は見つかりませんでした</strong><p>サンプルに戻して再度お試しください。</p>";
    $("#applyMaskDemo").disabled = true;
    return;
  }
  host.className = "candidate-list";
  host.innerHTML = maskDemoCandidates.map((item, index) => `<label class="candidate-item"><input type="checkbox" data-mask-demo-index="${index}" ${item.selected ? "checked" : ""}><span><strong>${escapeHtml(item.original)}</strong><small>${escapeHtml(item.type)} · ${escapeHtml(item.role)}として保護</small></span><span>${escapeHtml(item.replacement)}</span></label>`).join("");
  $("#applyMaskDemo").disabled = !maskDemoCandidates.some(item => item.selected);
}

$("#analyzeMaskDemo").addEventListener("click", () => {
  const text = $("#maskDemoInput").value.trim();
  if (!text) { showNotice("安全化する文章を入力してください。", "error"); return; }
  maskDemoCandidates = detectDemoEntities(text);
  renderMaskDemoCandidates();
  $("#maskDemoResult").hidden = true;
  setMaskDemoStep(2);
});

$("#maskDemoCandidates").addEventListener("change", event => {
  const input = event.target.closest("[data-mask-demo-index]");
  if (!input) return;
  maskDemoCandidates[Number(input.dataset.maskDemoIndex)].selected = input.checked;
  $("#applyMaskDemo").disabled = !maskDemoCandidates.some(item => item.selected);
});

$("#applyMaskDemo").addEventListener("click", () => {
  const selected = maskDemoCandidates.filter(item => item.selected);
  if (!selected.length) return;
  $("#maskDemoOutput").textContent = replaceDemoEntities($("#maskDemoInput").value, selected);
  $("#maskDemoMapping").innerHTML = selected.map(item => `<span>${escapeHtml(item.original)}<b>→ ${escapeHtml(item.replacement)}</b></span>`).join("");
  $("#maskDemoResult").hidden = false;
  setMaskDemoStep(3);
  $("#maskDemoResult").scrollIntoView({ behavior: "smooth", block: "nearest" });
});

$("#resetMaskDemo").addEventListener("click", () => {
  $("#maskDemoInput").value = MASK_DEMO_SAMPLE;
  maskDemoCandidates = [];
  $("#maskDemoCandidates").className = "demo-empty-state";
  $("#maskDemoCandidates").innerHTML = "<span>⌕</span><strong>左の文書を解析してください</strong><p>検出候補と置換後の意味がここに表示されます。</p>";
  $("#maskDemoCount").textContent = "解析待ち";
  $("#applyMaskDemo").disabled = true;
  $("#maskDemoResult").hidden = true;
  setMaskDemoStep(1);
});

$("#copyMaskDemo").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText($("#maskDemoOutput").textContent); showNotice("安全化済み文章をコピーしました。"); }
  catch { showNotice("コピーできませんでした。文章を選択してコピーしてください。", "error"); }
});

function updateGuardFlow(step) {
  $$(".guard-flow li").forEach((item, index) => {
    item.classList.toggle("active", index === step - 1);
    item.classList.toggle("done", index < step - 1 || step === 4);
  });
}

function openGuardIntervention(findings, mode = "text") {
  guardDemoMode = mode;
  const panel = $("#guardIntervention");
  panel.hidden = false;
  panel.classList.toggle("blocked-file", mode === "file");
  if (mode === "file") {
    $("#guardInterventionTitle").textContent = "安全確認できないファイルの添付を停止しました";
    $("#guardFindingList").innerHTML = '<span>顧客一覧.xlsx</span><span>ブラウザからの直接添付</span>';
    $("#guardSafeText").value = "ファイルはAI Safe Gateway Windows版で安全化してから添付してください。";
    $("#guardSafeText").readOnly = true;
    $("#guardApplyDemo").textContent = "Windows版デモを開く";
  } else {
    $("#guardInterventionTitle").textContent = "保護対象を検出したため送信を停止しました";
    $("#guardFindingList").innerHTML = findings.map(item => `<span>${escapeHtml(item.type)}：${escapeHtml(item.original)}</span>`).join("");
    $("#guardSafeText").value = replaceDemoEntities($("#guardDemoInput").value, findings);
    $("#guardSafeText").readOnly = false;
    $("#guardApplyDemo").textContent = "安全化した文章を反映";
  }
  updateGuardFlow(2);
  panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function completeGuardDemo() {
  const text = $("#guardDemoInput").value.trim();
  if (!text) { showNotice("送信する文章を入力してください。", "error"); return; }
  $("#guardChat").innerHTML = `<div class="chat-bubble">${escapeHtml(text)}</div>`;
  updateGuardFlow(4);
  showNotice("安全化済み文章だけを送信できる状態になりました。デモのため実送信はしていません。");
}

$("#guardSendDemo").addEventListener("click", () => {
  const findings = detectDemoEntities($("#guardDemoInput").value);
  if (findings.length) openGuardIntervention(findings);
  else completeGuardDemo();
});
$("#guardAttachmentDemo").addEventListener("click", () => openGuardIntervention([], "file"));
$("#guardCancelDemo").addEventListener("click", () => { $("#guardIntervention").hidden = true; updateGuardFlow(1); $("#guardDemoInput").focus(); });
$("#guardApplyDemo").addEventListener("click", () => {
  if (guardDemoMode === "file") { $("#guardIntervention").hidden = true; showView("windowsdemo"); return; }
  $("#guardDemoInput").value = $("#guardSafeText").value;
  $("#guardIntervention").hidden = true;
  updateGuardFlow(3);
  $("#guardSendDemo").focus();
  showNotice("安全化済み文章を入力欄へ反映しました。もう一度送信を試してください。");
});
$$('[data-ai-service]').forEach(button => button.addEventListener("click", () => {
  $$('[data-ai-service]').forEach(item => item.classList.toggle("active", item === button));
  $("#guardTargetLabel").textContent = button.dataset.aiService;
}));
$("#logoutButton").addEventListener("click", async () => {
  try { if (!state.demo && state.session) await fetch(`${config.supabaseUrl}/auth/v1/logout`, { method:"POST", headers:sessionHeaders() }); } catch {}
  clearStoredSession(); location.reload();
});

function downloadLicenseEnvelope(envelope, licenseId) {
  const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${licenseId}.asglicense`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

$("#licenseForm").addEventListener("submit", async event => {
  event.preventDefault();
  try {
    if (state.demo) { showNotice("デモモードではライセンスを発行しません。Supabase接続後に利用できます。", "error"); return; }
    const result = await invoke("admin-create-license", { label: $("#licenseLabel").value.trim(), seats: Number($("#licenseSeats").value), edition: $("#licenseEdition").value, valid_days: Number($("#licenseDays").value) });
    downloadLicenseEnvelope(result.license_envelope, result.license_id);
    $("#licenseDialog").close(); await loadPortal(); showNotice("署名済みライセンスを発行しました。");
  } catch (error) { showNotice(`発行できません：${friendlyError(error)}`, "error"); }
});

$("#licenseRows").addEventListener("click", async event => {
  const button = event.target.closest("[data-license-action]");
  if (!button || state.demo) return;
  const suspend = button.dataset.licenseAction === "suspend";
  if (!confirm(suspend ? "このライセンスを一時停止しますか？次回認証後に書込み機能が停止します。" : "このライセンスを再開しますか？")) return;
  button.disabled = true;
  try {
    await invoke("admin-license-action", { license_id: button.dataset.licenseId, action: button.dataset.licenseAction });
    await loadPortal();
    showNotice(suspend ? "ライセンスを一時停止しました。" : "ライセンスを再開しました。");
  } catch (error) { showNotice(`変更できません：${friendlyError(error)}`, "error"); }
  finally { button.disabled = false; }
});

$("#deviceRows").addEventListener("click", async event => {
  const button = event.target.closest("[data-device-action]");
  if (!button || state.demo) return;
  const deactivate = button.dataset.deviceAction === "deactivate";
  if (!confirm(deactivate ? "この端末の利用登録を解除しますか？再び使うにはオンライン認証が必要です。" : "この端末を再登録しますか？")) return;
  button.disabled = true;
  try {
    await invoke("admin-device-action", { device_id: button.dataset.deviceId, action: button.dataset.deviceAction });
    await loadPortal();
    showNotice(deactivate ? "端末登録を解除しました。" : "端末を再登録しました。");
  } catch (error) { showNotice(`変更できません：${friendlyError(error)}`, "error"); }
  finally { button.disabled = false; }
});

async function restoreSession() {
  $("#environmentBadge").textContent = state.demo ? "DEMO" : "SUPABASE";
  if (state.demo) return;
  try {
    const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
    if (hash.get("access_token")) {
      await restoreAuthenticatedSession({ access_token: hash.get("access_token"), refresh_token: hash.get("refresh_token") });
      if (hash.get("type") === "recovery") {
        $("#newPasswordDialog").showModal(); return;
      }
      history.replaceState(null, "", location.pathname);
      await completePendingCompany(); await loadPortal(); return;
    }
    $("#rememberLogin").checked = localStorage.getItem(REMEMBER_KEY) !== "false";
    const cached = JSON.parse(localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY) || "null"); if (!cached?.access_token) return;
    await restoreAuthenticatedSession(cached);
    await completePendingCompany(); await loadPortal();
  } catch { clearStoredSession(); }
}
restoreSession();
