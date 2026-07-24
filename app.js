const config = window.ASG_PORTAL_CONFIG || {};
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

const state = {
  session: null,
  user: null,
  company: null,
  member: null,
  licenses: [],
  devices: [],
  usage: [],
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
    ], usage,
  };
})();

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}
function showNotice(message, type = "success") {
  const node = $("#notice"); node.textContent = message; node.className = `notice ${type}`; node.hidden = false;
  clearTimeout(showNotice.timer); showNotice.timer = setTimeout(() => { node.hidden = true; }, 5000);
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

function saveSession(session) {
  state.session = session;
  state.user = session?.user || state.user;
  state.portalBootstrap = null;
  sessionStorage.setItem("asg_session", JSON.stringify({ ...session, user: state.user }));
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
    await invoke("register-company", data);
    state.portalBootstrap = null;
    localStorage.removeItem("asg_pending_company");
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
    saveSession(result);
    await completePendingCompany(); await loadPortal();
  } catch (error) { showNotice(`ログインできません：${error.message}`, "error"); }
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
  } catch (error) { showNotice(`送信できません：${error.message}`, "error"); }
});
$("#newPasswordForm").addEventListener("submit", async event => {
  event.preventDefault();
  try {
    await fetchJson(`${config.supabaseUrl}/auth/v1/user`, { method: "PUT", headers: sessionHeaders(), body: JSON.stringify({ password: $("#newPassword").value }) });
    $("#newPasswordDialog").close(); history.replaceState(null, "", location.pathname); showNotice("パスワードを変更しました。ログインしてください。");
  } catch (error) { showNotice(`変更できません：${error.message}`, "error"); }
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
  } catch (error) { showNotice(`登録できません：${error.message}`, "error"); }
});

function enterDemo() {
  Object.assign(state, demoData, { demo: true, session: { access_token: "demo" } });
  renderPortal();
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
  renderPortal();
}
function renderPortal() {
  $("#authShell").hidden = true; $("#portalShell").hidden = false;
  $("#companyNameHeader").textContent = state.company.name; $("#companyCodeHeader").textContent = `企業ID ${state.company.company_code}`;
  $("#userAvatar").textContent = (state.member.display_name || state.user.email || "管").slice(0, 1);
  renderDashboard(); renderLicenses(); renderMyPage();
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
  $("#payloadPreview").textContent = JSON.stringify({ company_id: state.company.id, license_id_hash: "SHA-256…", device_hash: "SHA-256…", app_version: "0.36.0", counts, time_assumption_sent: false, contains: { raw_text: false, file_names: false, detected_terms: false, dictionary_values: false, mapping_values: false, ai_answers: false } }, null, 2);
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

function renderLicenses() {
  const totalSeats = state.licenses.reduce((sum, item) => sum + Number(item.seats || 0), 0); const activeDevices = state.devices.filter(item => item.active).length;
  $("#licenseSummary").innerHTML = [["契約ライセンス",state.licenses.length],["端末上限",totalSeats],["利用中",activeDevices],["残り",Math.max(0,totalSeats-activeDevices)]].map(([label,value])=>`<div class="summary-cell"><small>${label}</small><strong>${formatNumber(value)}</strong></div>`).join("");
  $("#licenseRows").innerHTML = state.licenses.length ? state.licenses.map(item => { const used = state.devices.filter(device => device.license_id === item.id && device.active).length; return `<tr><td><strong>${escapeHtml(item.label)}</strong><br><code>${escapeHtml(item.id.slice(0,8))}…</code></td><td>${escapeHtml(item.edition)}</td><td>${used} / ${item.seats}</td><td>${formatDate(item.expires_at)}</td><td><span class="status-badge ${item.status === "active" ? "" : "danger"}">${item.status === "active" ? "有効" : "停止"}</span></td></tr>`; }).join("") : `<tr><td colspan="5">ライセンスはありません。</td></tr>`;
  $("#deviceRows").innerHTML = state.devices.length ? state.devices.map(item => `<tr><td><code>${escapeHtml(item.device_hash.slice(0,18))}…</code></td><td>${escapeHtml(item.app_version || "—")}</td><td>${formatDate(item.last_seen_at)}</td><td><span class="status-badge ${item.active ? "" : "danger"}">${item.active ? "利用中" : "停止"}</span></td></tr>`).join("") : `<tr><td colspan="4">認証端末はありません。</td></tr>`;
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
}
$$(".nav-button").forEach(button => button.addEventListener("click", () => showView(button.dataset.view)));
$$('[data-go]').forEach(button => button.addEventListener("click", () => showView(button.dataset.go)));
$("#menuButton").addEventListener("click", () => $(".sidebar").classList.toggle("open"));
$("#showPayloadButton").addEventListener("click", () => $("#payloadDialog").showModal());
$("#openLicenseModal").addEventListener("click", () => $("#licenseDialog").showModal());
$$('[data-close]').forEach(button => button.addEventListener("click", () => $(`#${button.dataset.close}`).close()));
$("#copyCompanyId").addEventListener("click", async () => { await navigator.clipboard.writeText(state.company.company_code); showNotice("企業IDをコピーしました。"); });
$("#refreshButton").addEventListener("click", async () => { try { if (!state.demo) await loadPortal(); else renderPortal(); showNotice("最新状態へ更新しました。"); } catch (error) { showNotice(error.message,"error"); } });
$("#logoutButton").addEventListener("click", async () => {
  try { if (!state.demo && state.session) await fetch(`${config.supabaseUrl}/auth/v1/logout`, { method:"POST", headers:sessionHeaders() }); } catch {}
  sessionStorage.removeItem("asg_session"); location.reload();
});

$("#licenseForm").addEventListener("submit", async event => {
  event.preventDefault();
  try {
    if (state.demo) { showNotice("デモモードではライセンスを発行しません。Supabase接続後に利用できます。", "error"); return; }
    const result = await invoke("admin-create-license", { label: $("#licenseLabel").value.trim(), seats: Number($("#licenseSeats").value), edition: $("#licenseEdition").value, valid_days: Number($("#licenseDays").value) });
    const blob = new Blob([JSON.stringify(result.license_envelope, null, 2)], { type: "application/json" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `${result.license_id}.asglicense`; link.click(); URL.revokeObjectURL(link.href);
    $("#licenseDialog").close(); await loadPortal(); showNotice("署名済みライセンスを発行しました。");
  } catch (error) { showNotice(`発行できません：${error.message}`, "error"); }
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
    const cached = JSON.parse(sessionStorage.getItem("asg_session") || "null"); if (!cached?.access_token) return;
    await restoreAuthenticatedSession(cached);
    await completePendingCompany(); await loadPortal();
  } catch { sessionStorage.removeItem("asg_session"); }
}
restoreSession();
