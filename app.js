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

function formatDateTime(timestamp) {
  if (!timestamp) {
    return "Chua dong bo GitHub";
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

  const chips = [
    { label: `BME680 ${latest.bme680Status || "ERROR"}`, good: latest.bme680Status === "OK" },
    { label: `BH1750 ${latest.bh1750Status || "ERROR"}`, good: latest.bh1750Status === "OK" },
    { label: `MQ9 ${latest.mq9Status || "ERROR"}`, good: latest.mq9Status === "OK" }
  ];

  chipList.innerHTML = chips
    .map((chip) => `<span class="chip ${chip.good ? "good" : "bad"}">${chip.label}</span>`)
    .join("");
}

function renderAlertBox(latest) {
  const alertBox = document.getElementById("alert-box");
  const alertLevel = latest.alertLevel || "no_data";
  const alertText = latest.alertText || "CHO DU LIEU";
  const alertSummary = latest.alertSummary || "Dang cho du lieu tu Node 1";
  const mq9Status = document.getElementById("mq9-health-text");
  const mq9Card = document.querySelector(".gas-card");

  if (alertBox) {
    alertBox.className = "alert-box";
    alertBox.classList.add(`state-${alertLevel === "stable" ? "stable" : alertLevel === "warning" ? "warning" : alertLevel === "danger" ? "danger" : "neutral"}`);
  }

  setText("alert-title", alertText);
  setText("alert-summary", alertSummary);
  setText("mq9-status-text", latest.mq9Status === "OK" ? "Du lieu MQ9 hop le" : "Dang cho/loi MQ9");

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
  setText("fan-state", latest.fanOn ? "ON" : "OFF");
  setText("heater-state", latest.heaterOn ? "ON" : "OFF");
  setText("buzzer-state", latest.buzzerOn ? "ON" : "OFF");
  setText("wifi-rssi", Number.isFinite(latest.wifiRssi) ? `${latest.wifiRssi} dBm` : "--");
}

function renderMetrics(latest) {
  setText("temperature-value", formatNumber(Number(latest.temperatureC), 1));
  setText("humidity-value", formatNumber(Number(latest.humidityPct), 0));
  setText("light-value", formatNumber(Number(latest.lightLux), 0));
  setText("pressure-value", formatNumber(Number(latest.pressureHpa), 1));
  setText("mq9-value", formatNumber(Number(latest.mq9Ppm), 0));
}

function renderMeta(latest) {
  setText("device-name", latest.deviceName || dashboardConfig.deviceName || "HE THONG GIAM SAT NODE 2");
  setText("device-location", latest.location || dashboardConfig.locationLabel || "Ha Noi, VN");
  appState.lastSyncText = formatDateTime(latest.serverTimestampIso || latest.receivedAt);
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

  const level = latest.alertLevel || "no_data";
  const connectionText = payload.ok ? "GitHub dang dong bo" : "GitHub tam mat ket noi";
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
