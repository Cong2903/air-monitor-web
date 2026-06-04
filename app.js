const dashboardConfig = window.dashboardConfig || {};
const appState = {
  latest: null,
  history: [],
  lastSyncText: "Chua dong bo cloud"
};

const metricColors = {
  temperature: "#ea7b1f",
  humidity: "#2e83dd",
  light: "#ddb113",
  pressure: "#8f99a6",
  mq9: "#db5858"
};

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value;
  }
}

function formatNumber(value, digits = 1) {
  return Number.isFinite(value) ? value.toFixed(digits) : "--";
}

function getTimestampMs(timestamp) {
  if (!timestamp) {
    return NaN;
  }

  const parsed = new Date(timestamp).getTime();
  return Number.isNaN(parsed) ? NaN : parsed;
}

function isPayloadFresh(latest) {
  const staleAfterMs = Number(dashboardConfig.staleAfterMs || 8000);
  const timestampMs = getTimestampMs(latest.serverTimestampIso || latest.receivedAt);

  if (!Number.isFinite(timestampMs)) {
    return false;
  }

  if (Date.now() - timestampMs > staleAfterMs) {
    return false;
  }

  return latest.packetFresh !== false;
}

function formatDateTime(timestamp) {
  if (!timestamp) {
    return "Chua dong bo Firebase";
  }

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }

  return `Cap nhat luc ${date.toLocaleString("vi-VN")}`;
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
  } else {
    pill.classList.add("pill-neutral");
  }
  pill.textContent = text;
}

function buildSparkline(values, color) {
  if (!values.length) {
    return "";
  }

  const width = 320;
  const height = 56;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = values.length > 1 ? width / (values.length - 1) : width;

  const points = values.map((value, index) => {
    const x = index * step;
    const y = height - ((value - min) / range) * (height - 8) - 4;
    return `${x},${y}`;
  });

  return `
    <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
      <path d="M ${points.join(" L ")}" style="color:${color}"></path>
    </svg>
  `;
}

function historyValues(key) {
  return appState.history
    .map((entry) => Number(entry[key]))
    .filter((value) => Number.isFinite(value));
}

function renderSparkline(id, key, color) {
  const container = document.getElementById(id);
  if (!container) {
    return;
  }

  container.innerHTML = buildSparkline(historyValues(key), color);
}

function renderSensorChips(latest) {
  const chipList = document.getElementById("sensor-chip-list");
  if (!chipList) {
    return;
  }

  const fresh = isPayloadFresh(latest);

  const chips = [
    { label: `BME680 ${fresh ? (latest.bme680Status || "ERROR") : "OFF"}`, good: fresh && latest.bme680Status === "OK" },
    { label: `BH1750 ${fresh ? (latest.bh1750Status || "ERROR") : "OFF"}`, good: fresh && latest.bh1750Status === "OK" },
    { label: `MQ9 ${fresh ? (latest.mq9Status || "ERROR") : "OFF"}`, good: fresh && latest.mq9Status === "OK" }
  ];

  chipList.innerHTML = chips
    .map((chip) => `<span class="chip ${chip.good ? "good" : "bad"}">${chip.label}</span>`)
    .join("");
}

function renderAlertBox(latest) {
  const alertBox = document.getElementById("alert-box");
  const fresh = isPayloadFresh(latest);
  const alertLevel = fresh ? (latest.alertLevel || "no_data") : "no_data";
  const alertText = fresh ? (latest.alertText || "CHO DU LIEU") : "MAT KET NOI";
  const alertSummary = fresh ? (latest.alertSummary || "Dang cho du lieu tu Node 1") : "Khong nhan duoc du lieu moi tu Node 2";
  const mq9Status = document.getElementById("mq9-health-text");
  const mq9Card = document.querySelector(".gas-card");

  if (alertBox) {
    alertBox.className = "alert-box";
    alertBox.classList.add(`state-${alertLevel === "stable" ? "stable" : alertLevel === "warning" ? "warning" : alertLevel === "danger" ? "danger" : "neutral"}`);
  }

  setText("alert-title", alertText);
  setText("alert-summary", alertSummary);
  setText("mq9-status-text", fresh ? (latest.mq9Status === "OK" ? "Du lieu MQ9 hop le" : "Dang cho/loi MQ9") : "Khong co du lieu moi");

  if (mq9Status) {
    mq9Status.textContent = alertText;
  }

  if (mq9Card) {
    mq9Card.classList.remove("mq9-sensor-warning", "mq9-sensor-danger");
    if (alertLevel === "warning") {
      mq9Card.classList.add("mq9-sensor-warning");
    }
    if (alertLevel === "danger") {
      mq9Card.classList.add("mq9-sensor-danger");
    }
  }
}

function renderActuators(latest) {
  const fresh = isPayloadFresh(latest);
  setText("fan-state", fresh && latest.fanOn ? "ON" : "OFF");
  setText("heater-state", fresh && latest.heaterOn ? "ON" : "OFF");
  setText("buzzer-state", fresh && latest.buzzerOn ? "ON" : "OFF");
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
  setText("device-name", latest.deviceName || dashboardConfig.deviceName || "HE THONG GIAM SAT NODE 2");
  setText("device-location", latest.location || dashboardConfig.locationLabel || "Ha Noi, VN");
  appState.lastSyncText = isPayloadFresh(latest)
    ? formatDateTime(latest.serverTimestampIso || latest.receivedAt)
    : "Mat dong bo du lieu";
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

  renderSparkline("temperature-sparkline", "temperatureC", metricColors.temperature);
  renderSparkline("humidity-sparkline", "humidityPct", metricColors.humidity);
  renderSparkline("light-sparkline", "lightLux", metricColors.light);
  renderSparkline("pressure-sparkline", "pressureHpa", metricColors.pressure);
  renderSparkline("mq9-sparkline", "mq9Ppm", metricColors.mq9);

  const fresh = isPayloadFresh(latest);
  const level = fresh ? (latest.alertLevel || "no_data") : "no_data";
  const connectionText = fresh
    ? (payload.ok ? "Firebase dang dong bo" : "Firebase tam mat ket noi")
    : "Mat ket noi Node 2";
  setConnectionPill(level, connectionText);
}

function showSetupState(message) {
  setConnectionPill("neutral", message);
  setText("last-sync", message);
}

function fetchDashboardData() {
  if (!dashboardConfig.dataUrl) {
    showSetupState("Chua cau hinh file JSON");
    return;
  }
  fetch(`${dashboardConfig.dataUrl}?t=${Date.now()}`, { cache: "no-store" })
    .then((response) => {
      if (!response.ok) {
        throw new Error("Khong doc duoc file JSON");
      }
      return response.json();
    })
    .then((payload) => {
      if (payload && payload.ok !== false) {
        renderDashboard(payload);
      } else {
        showSetupState("File JSON khong hop le");
      }
    })
    .catch(() => {
      showSetupState("Khong tai duoc du lieu JSON");
    });
}

function bootstrap() {
  renderClock();
  setInterval(renderClock, 1000);
  fetchDashboardData();
  setInterval(fetchDashboardData, dashboardConfig.refreshMs || 4000);
}

window.addEventListener("DOMContentLoaded", bootstrap);
