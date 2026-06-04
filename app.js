const dashboardConfig = window.dashboardConfig || {};
const appState = {
  latest: null,
  history: [],
  lastSyncText: "Chưa đồng bộ dữ liệu"
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

function onOffText(value) {
  return value ? "BẬT" : "TẮT";
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
  const alertText = fresh
    ? vietnameseAlertText(alertLevel, latest.alertText)
    : "MẤT KẾT NỐI";
  const alertSummary = fresh
    ? vietnameseAlertSummary(alertLevel, latest.alertSummary)
    : "Không nhận được dữ liệu mới từ Node 2";
  const mq9Status = document.getElementById("mq9-health-text");
  const mq9Card = document.querySelector(".gas-card");

  if (alertBox) {
    alertBox.className = "alert-box";
    alertBox.classList.add(`state-${alertLevel === "stable" ? "stable" : alertLevel === "warning" ? "warning" : alertLevel === "danger" ? "danger" : "neutral"}`);
  }

  setText("alert-title", alertText);
  setText("alert-summary", alertSummary);
  setText("mq9-status-text", fresh ? (latest.mq9Status === "OK" ? "Dữ liệu MQ9 hợp lệ" : "Đang chờ hoặc lỗi MQ9") : "Không có dữ liệu mới");

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
  setText("device-name", latest.deviceName || dashboardConfig.deviceName || "HỆ THỐNG GIÁM SÁT NODE 2");
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
    ? (payload.ok ? "Firebase đang đồng bộ" : "Firebase tạm mất kết nối")
    : "Mất kết nối Node 2";
  setConnectionPill(level, connectionText);
}

function showSetupState(message) {
  setConnectionPill("neutral", message);
  setText("last-sync", message);
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
  setInterval(renderClock, 1000);
  fetchDashboardData();
  setInterval(fetchDashboardData, dashboardConfig.refreshMs || 4000);
}

window.addEventListener("DOMContentLoaded", bootstrap);
