const dashboardConfig = window.dashboardConfig || {};

const ACCESS_PASSWORD = "MangCamBien123";
const AUTH_STORAGE_KEY = "air_monitor_web_auth";

const appState = {
  latest: null,
  history: [],
  lastSyncText: "Chưa đồng bộ dữ liệu",
  commandBusy: false,
  commandMessage: "Bấm để điều khiển quạt và sưởi từ web",
  refreshTimerId: null
};

const metricColors = {
  temperature: "#ea7b1f",
  humidity: "#2e83dd",
  light: "#ddb113",
  pressure: "#8f99a6",
  mq9: "#db5858"
};

const controlModes = [
  { value: "auto", label: "Tự động" },
  { value: "on", label: "Bật" },
  { value: "off", label: "Tắt" }
];

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value;
  }
}

function onOffText(value) {
  return value ? "BẬT" : "TẮT";
}

function sanitizeMode(value) {
  if (value === "on" || value === "off" || value === "auto") {
    return value;
  }
  return "auto";
}

function modeLabel(value) {
  const mode = sanitizeMode(value);
  if (mode === "on") {
    return "Đang ép bật";
  }
  if (mode === "off") {
    return "Đang ép tắt";
  }
  return "Đang tự động";
}

function vietnameseAlertText(level, fallbackText) {
  const map = {
    stable: "ỔN ĐỊNH",
    warning: "CẢNH BÁO",
    danger: "NGUY HIỂM",
    sensor_error: "LỖI CẢM BIẾN",
    no_data: "MẤT KẾT NỐI"
  };
  return map[level] || fallbackText || "CHỜ DỮ LIỆU";
}

function vietnameseAlertSummary(level, fallbackText) {
  const map = {
    stable: "Hệ thống hoạt động bình thường",
    warning: "Ngưỡng cảnh báo đang tăng",
    danger: "Cần xử lý khẩn cấp ngay",
    sensor_error: "Kiểm tra dây nối và cảm biến",
    no_data: "Không nhận được dữ liệu mới từ Node 2"
  };
  return map[level] || fallbackText || "Đang chờ dữ liệu từ Node 1";
}

function formatNumber(value, digits = 1) {
  return Number.isFinite(value) ? value.toFixed(digits) : "--";
}

function formatAxisValue(value) {
  if (!Number.isFinite(value)) {
    return "--";
  }
  if (Math.abs(value) >= 100) {
    return value.toFixed(0);
  }
  if (Math.abs(value) >= 10) {
    return value.toFixed(1);
  }
  return value.toFixed(2);
}

function getTimestampMs(timestamp) {
  if (!timestamp) {
    return NaN;
  }
  const parsed = new Date(timestamp).getTime();
  return Number.isNaN(parsed) ? NaN : parsed;
}

function isPayloadFresh(latest) {
  if (!latest) {
    return false;
  }
  const staleAfterMs = Number(dashboardConfig.staleAfterMs || 8000);
  const timestampMs = getTimestampMs(latest.serverTimestampIso || latest.receivedAt);
  return Number.isFinite(timestampMs) && Date.now() - timestampMs <= staleAfterMs && latest.packetFresh !== false;
}

function formatDateTime(timestamp) {
  if (!timestamp) {
    return "Chưa đồng bộ Firebase";
  }
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }
  return `Cập nhật lúc ${date.toLocaleString("vi-VN")}`;
}

function setConnectionPill(level, text) {
  const pill = document.getElementById("connection-pill");
  if (!pill) {
    return;
  }

  pill.className = "pill";
  if (level === "stable") {
    pill.classList.add("pill-stable");
  } else if (level === "warning") {
    pill.classList.add("pill-warning");
  } else if (level === "danger") {
    pill.classList.add("pill-danger");
  } else if (level === "no_data") {
    pill.classList.add("pill-disconnected");
  } else {
    pill.classList.add("pill-neutral");
  }
  pill.textContent = text;
}

function hexToRgba(hex, alpha) {
  const clean = hex.replace("#", "");
  const expanded = clean.length === 3
    ? clean.split("").map((part) => part + part).join("")
    : clean;
  const numeric = Number.parseInt(expanded, 16);
  const r = (numeric >> 16) & 255;
  const g = (numeric >> 8) & 255;
  const b = numeric & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function buildSmoothLinePath(points) {
  if (points.length === 1) {
    return `M ${points[0].x} ${points[0].y}`;
  }

  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const midX = (current.x + next.x) / 2;
    const midY = (current.y + next.y) / 2;
    path += ` Q ${current.x} ${current.y} ${midX} ${midY}`;
  }
  const last = points[points.length - 1];
  path += ` T ${last.x} ${last.y}`;
  return path;
}

function buildAreaPath(points, baselineY) {
  const linePath = buildSmoothLinePath(points);
  const first = points[0];
  const last = points[points.length - 1];
  return `${linePath} L ${last.x} ${baselineY} L ${first.x} ${baselineY} Z`;
}

function formatTimeLabel(timestampMs) {
  return new Date(timestampMs).toLocaleTimeString("vi-VN", {
    minute: "2-digit",
    second: "2-digit"
  });
}

function historySeries(key) {
  const rawHistory = appState.history.length ? appState.history : (appState.latest ? [appState.latest] : []);
  const latestTimestamp = getTimestampMs(appState.latest?.serverTimestampIso || appState.latest?.receivedAt) || Date.now();
  const sampleIntervalMs = Number(dashboardConfig.sampleIntervalMs || 2000);

  return rawHistory
    .map((entry, index, array) => {
      const value = Number(entry[key]);
      if (!Number.isFinite(value)) {
        return null;
      }

      const explicitTimestamp = getTimestampMs(entry.serverTimestampIso || entry.receivedAt || entry.timestampIso);
      const timestamp = Number.isFinite(explicitTimestamp)
        ? explicitTimestamp
        : latestTimestamp - (array.length - 1 - index) * sampleIntervalMs;

      return { value, timestamp };
    })
    .filter(Boolean);
}

function buildChartSvg(series, color, options = {}) {
  if (!series.length) {
    return "";
  }

  const width = options.width || 320;
  const height = options.height || 118;
  const padding = options.padding || { top: 10, right: 10, bottom: 28, left: 42 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  const values = series.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || Math.max(Math.abs(max) * 0.05, 1);
  const adjustedMin = min - range * 0.08;
  const adjustedMax = max + range * 0.08;
  const adjustedRange = adjustedMax - adjustedMin || 1;

  const points = series.map((point, index) => {
    const x = padding.left + (series.length === 1 ? innerWidth / 2 : (index / (series.length - 1)) * innerWidth);
    const y = padding.top + innerHeight - ((point.value - adjustedMin) / adjustedRange) * innerHeight;
    return { x, y };
  });

  const linePath = buildSmoothLinePath(points);
  const areaPath = buildAreaPath(points, padding.top + innerHeight);
  const yTicks = [adjustedMax, adjustedMin + adjustedRange / 2, adjustedMin];
  const xTickIndices = Array.from(new Set([
    0,
    Math.floor((series.length - 1) / 2),
    series.length - 1
  ])).sort((left, right) => left - right);

  const backdrop = `<rect class="chart-backdrop" x="${padding.left}" y="${padding.top}" width="${innerWidth}" height="${innerHeight}" rx="10"></rect>`;
  const gridLines = yTicks.map((tickValue) => {
    const y = padding.top + innerHeight - ((tickValue - adjustedMin) / adjustedRange) * innerHeight;
    return `<line class="chart-grid-line" x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}"></line>
      <text class="chart-axis-text" x="${padding.left - 6}" y="${y + 4}" text-anchor="end">${formatAxisValue(tickValue)}</text>`;
  }).join("");

  const xTicks = xTickIndices.map((tickIndex) => {
    const tick = series[tickIndex];
    const x = points[tickIndex].x;
    return `<line class="chart-axis-line" x1="${x}" y1="${height - padding.bottom}" x2="${x}" y2="${height - padding.bottom + 4}"></line>
      <text class="chart-time-text" x="${x}" y="${height - 6}" text-anchor="middle">${formatTimeLabel(tick.timestamp)}</text>`;
  }).join("");

  return `
    <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
      ${backdrop}
      ${gridLines}
      <line class="chart-axis-line" x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}"></line>
      <path class="chart-area" d="${areaPath}" style="fill:${hexToRgba(color, 0.16)}"></path>
      <path class="chart-line" d="${linePath}" style="stroke:${color}"></path>
      ${xTicks}
    </svg>
  `;
}

function renderChart(id, key, color, options = {}) {
  const container = document.getElementById(id);
  if (!container) {
    return;
  }
  container.innerHTML = buildChartSvg(historySeries(key), color, options);
}

function renderSensorChips(latest) {
  const chipList = document.getElementById("sensor-chip-list");
  if (!chipList) {
    return;
  }

  const fresh = isPayloadFresh(latest);
  const chips = [
    { label: `BME680 ${fresh ? (latest.bme680Status === "OK" ? "TỐT" : "LỖI") : "TẮT"}`, good: fresh && latest.bme680Status === "OK" },
    { label: `BH1750 ${fresh ? (latest.bh1750Status === "OK" ? "TỐT" : "LỖI") : "TẮT"}`, good: fresh && latest.bh1750Status === "OK" },
    { label: `MQ9 ${fresh ? (latest.mq9Status === "OK" ? "TỐT" : "LỖI") : "TẮT"}`, good: fresh && latest.mq9Status === "OK" }
  ];

  chipList.innerHTML = chips
    .map((chip) => `<span class="chip ${chip.good ? "good" : "bad"}">${chip.label}</span>`)
    .join("");
}

function renderAlertBox(latest) {
  const alertBox = document.getElementById("alert-box");
  const fresh = isPayloadFresh(latest);
  const alertLevel = fresh ? (latest.alertLevel || "no_data") : "no_data";
  const alertText = fresh ? vietnameseAlertText(alertLevel, latest.alertText) : "MẤT KẾT NỐI";
  const alertSummary = fresh ? vietnameseAlertSummary(alertLevel, latest.alertSummary) : "Không nhận được dữ liệu mới từ Node 2";
  const mq9Card = document.querySelector(".gas-card");

  if (alertBox) {
    alertBox.className = "alert-box";
    const alertClass = alertLevel === "stable"
      ? "state-stable"
      : alertLevel === "warning"
        ? "state-warning"
        : alertLevel === "danger"
          ? "state-danger"
          : "state-neutral";
    alertBox.classList.add(alertClass);
  }

  setText("alert-title", alertText);
  setText("alert-summary", alertSummary);
  setText("mq9-status-text", fresh ? (latest.mq9Status === "OK" ? "Dữ liệu MQ9 hợp lệ" : "Đang chờ hoặc lỗi MQ9") : "Không có dữ liệu mới");

  if (mq9Card) {
    mq9Card.classList.remove("mq9-sensor-warning", "mq9-sensor-danger", "mq9-no-data");
    if (!fresh) {
      mq9Card.classList.add("mq9-no-data");
    } else if (alertLevel === "warning") {
      mq9Card.classList.add("mq9-sensor-warning");
    } else if (alertLevel === "danger") {
      mq9Card.classList.add("mq9-sensor-danger");
    }
  }
}

function renderActuators(latest) {
  const fresh = isPayloadFresh(latest);
  setText("fan-state", onOffText(fresh && latest.fanOn));
  setText("heater-state", onOffText(fresh && latest.heaterOn));
  setText("buzzer-state", onOffText(fresh && latest.buzzerOn));
  setText("wifi-rssi", fresh && Number.isFinite(latest.wifiRssi) ? `${latest.wifiRssi} dBm` : "--");
}

function renderMetrics(latest) {
  const fresh = isPayloadFresh(latest);
  setText("temperature-value", fresh ? formatNumber(Number(latest.temperatureC), 1) : "--");
  setText("humidity-value", fresh ? formatNumber(Number(latest.humidityPct), 0) : "--");
  setText("light-value", fresh ? formatNumber(Number(latest.lightLux), 0) : "--");
  setText("pressure-value", fresh ? formatNumber(Number(latest.pressureHpa), 1) : "--");
  setText("mq9-value", fresh ? formatNumber(Number(latest.mq9Ppm), 0) : "--");
}

function renderMeta(latest) {
  setText("device-name", latest.deviceName || dashboardConfig.deviceName || "TRẠNG THÁI MÔI TRƯỜNG");
  setText("device-location", latest.location || dashboardConfig.locationLabel || "Hà Nội, VN");
  appState.lastSyncText = isPayloadFresh(latest)
    ? formatDateTime(latest.serverTimestampIso || latest.receivedAt)
    : "Mất đồng bộ dữ liệu";
  setText("last-sync", appState.lastSyncText);
}

function renderClock() {
  const now = new Date();
  setText("clock-value", now.toLocaleTimeString("vi-VN"));
  setText("clock-date", now.toLocaleDateString("vi-VN", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }));
}

function renderControlButtons(device, mode) {
  const container = document.getElementById(`${device}-controls`);
  if (!container) {
    return;
  }

  container.innerHTML = controlModes.map((item) => `
    <button
      type="button"
      class="control-button ${mode === item.value ? "active" : ""}"
      data-device="${device}"
      data-mode="${item.value}"
      ${appState.commandBusy ? "disabled" : ""}
    >
      ${item.label}
    </button>
  `).join("");
}

function renderControls(latest) {
  const fanMode = sanitizeMode(latest?.fanMode);
  const heaterMode = sanitizeMode(latest?.heaterMode);

  renderControlButtons("fan", fanMode);
  renderControlButtons("heater", heaterMode);
  setText("fan-mode-text", modeLabel(fanMode));
  setText("heater-mode-text", modeLabel(heaterMode));
  setText("control-note", appState.commandMessage);
}

function renderDashboard(payload) {
  const latest = payload.latest || payload;
  const history = Array.isArray(payload.history) ? payload.history : [];

  appState.latest = latest;
  appState.history = history.length ? history : [latest];

  renderMetrics(latest);
  renderAlertBox(latest);
  renderActuators(latest);
  renderSensorChips(latest);
  renderMeta(latest);
  renderControls(latest);

  renderChart("temperature-sparkline", "temperatureC", metricColors.temperature);
  renderChart("humidity-sparkline", "humidityPct", metricColors.humidity);
  renderChart("light-sparkline", "lightLux", metricColors.light);
  renderChart("pressure-sparkline", "pressureHpa", metricColors.pressure);
  renderChart("mq9-sparkline", "mq9Ppm", metricColors.mq9, {
    height: 136,
    padding: { top: 12, right: 16, bottom: 30, left: 46 }
  });

  const fresh = isPayloadFresh(latest);
  const level = fresh ? (latest.alertLevel || "no_data") : "no_data";
  const connectionText = fresh
    ? (payload.ok ? "Firebase đang đồng bộ" : "Firebase tạm mất kết nối")
    : "Mất kết nối Node 2";
  setConnectionPill(level, connectionText);
}

function showSetupState(message) {
  setConnectionPill("no_data", message);
  setText("last-sync", message);
  setText("control-note", message);
}

function buildCommandPayload(nextFanMode, nextHeaterMode) {
  return {
    seq: Date.now(),
    requestedAt: new Date().toISOString(),
    source: "web",
    fanMode: sanitizeMode(nextFanMode),
    heaterMode: sanitizeMode(nextHeaterMode)
  };
}

function sendCommand(nextFanMode, nextHeaterMode) {
  if (!dashboardConfig.commandUrl) {
    appState.commandMessage = "Chưa cấu hình đường dẫn lệnh Firebase";
    renderControls(appState.latest);
    return;
  }

  const payload = buildCommandPayload(nextFanMode, nextHeaterMode);
  appState.commandBusy = true;
  appState.commandMessage = "Đang gửi lệnh điều khiển...";
  renderControls(appState.latest);

  fetch(`${dashboardConfig.commandUrl}?t=${payload.seq}`, {
    method: "PUT",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error("Không gửi được lệnh");
      }
      return response.json().catch(() => ({}));
    })
    .then(() => {
      if (appState.latest) {
        appState.latest.fanMode = payload.fanMode;
        appState.latest.heaterMode = payload.heaterMode;
        appState.latest.commandSeq = payload.seq;
      }
      appState.commandMessage = "Đã gửi lệnh, Node 2 sẽ áp dụng ngay";
      renderControls(appState.latest);
      fetchDashboardData();
    })
    .catch(() => {
      appState.commandMessage = "Gửi lệnh thất bại, hãy thử lại";
      renderControls(appState.latest);
    })
    .finally(() => {
      appState.commandBusy = false;
      renderControls(appState.latest);
    });
}

function handleControlClick(event) {
  const button = event.target.closest(".control-button");
  if (!button || appState.commandBusy || !appState.latest) {
    return;
  }

  const device = button.dataset.device;
  const mode = sanitizeMode(button.dataset.mode);
  const nextFanMode = device === "fan" ? mode : sanitizeMode(appState.latest.fanMode);
  const nextHeaterMode = device === "heater" ? mode : sanitizeMode(appState.latest.heaterMode);
  sendCommand(nextFanMode, nextHeaterMode);
}

function normalizeUserName(value) {
  return String(value || "").trim();
}

function setLoginError(message = "") {
  setText("login-error", message);
  const errorElement = document.getElementById("login-error");
  if (errorElement) {
    errorElement.hidden = !message;
  }
}

function persistAuthSession(userName) {
  sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({
    userName,
    authenticatedAt: Date.now()
  }));
}

function restoreAuthSession() {
  try {
    const raw = sessionStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) {
      return "";
    }
    const parsed = JSON.parse(raw);
    return normalizeUserName(parsed.userName);
  } catch {
    return "";
  }
}

function clearAuthSession() {
  sessionStorage.removeItem(AUTH_STORAGE_KEY);
}

function showDashboard() {
  const loginScreen = document.getElementById("login-screen");
  const dashboardShell = document.getElementById("dashboard-shell");
  if (loginScreen) {
    loginScreen.classList.add("is-hidden");
  }
  if (dashboardShell) {
    dashboardShell.classList.remove("is-locked");
  }
}

function showLoginScreen() {
  const loginScreen = document.getElementById("login-screen");
  const dashboardShell = document.getElementById("dashboard-shell");
  if (loginScreen) {
    loginScreen.classList.remove("is-hidden");
  }
  if (dashboardShell) {
    dashboardShell.classList.add("is-locked");
  }
}

function startDataRefresh() {
  if (appState.refreshTimerId !== null) {
    return;
  }
  fetchDashboardData();
  appState.refreshTimerId = window.setInterval(fetchDashboardData, dashboardConfig.refreshMs || 4000);
}

function stopDataRefresh() {
  if (appState.refreshTimerId !== null) {
    window.clearInterval(appState.refreshTimerId);
    appState.refreshTimerId = null;
  }
}

function finishLogin(userName) {
  persistAuthSession(userName);
  setLoginError("");
  showDashboard();
  startDataRefresh();
}

function handleLoginSubmit(event) {
  event.preventDefault();

  const userNameInput = document.getElementById("login-username");
  const passwordInput = document.getElementById("login-password");
  const userName = normalizeUserName(userNameInput?.value);
  const password = String(passwordInput?.value || "");

  if (!userName) {
    setLoginError("Vui lòng nhập tên người dùng.");
    userNameInput?.focus();
    return;
  }

  if (password !== ACCESS_PASSWORD) {
    setLoginError("Mật khẩu chưa đúng. Hãy thử lại.");
    passwordInput?.focus();
    passwordInput?.select();
    return;
  }

  finishLogin(userName);
}

function initAuth() {
  const loginForm = document.getElementById("login-form");
  loginForm?.addEventListener("submit", handleLoginSubmit);

  const restoredUser = restoreAuthSession();
  if (restoredUser) {
    finishLogin(restoredUser);
    return;
  }

  showLoginScreen();
  setConnectionPill("neutral", "Vui lòng đăng nhập");
  setText("last-sync", "Chưa đăng nhập");
  document.getElementById("login-username")?.focus();
}

function fetchDashboardData() {
  if (!dashboardConfig.dataUrl) {
    showSetupState("Chưa cấu hình tệp dữ liệu");
    return;
  }

  fetch(`${dashboardConfig.dataUrl}?t=${Date.now()}`, { cache: "no-store" })
    .then((response) => {
      if (!response.ok) {
        throw new Error("Không đọc được dữ liệu JSON");
      }
      return response.json();
    })
    .then((payload) => {
      if (payload && payload.ok !== false) {
        renderDashboard(payload);
      } else {
        showSetupState("Tệp JSON không hợp lệ");
      }
    })
    .catch(() => {
      showSetupState("Không tải được dữ liệu JSON");
    });
}

function bootstrap() {
  renderClock();
  window.setInterval(renderClock, 1000);
  document.addEventListener("click", handleControlClick);
  initAuth();
}

window.addEventListener("DOMContentLoaded", bootstrap);
