let map;
let stations = [];
let currentStation = null;
let historyChart = null;
let refreshTimer = null;
let simulationTimer = null;

const riskClass = risk =>
  risk < 25 ? "normal" :
  risk < 50 ? "watch" :
  risk < 75 ? "alert" : "critical";

const riskLabel = risk =>
  risk < 25 ? "NORMAL" :
  risk < 50 ? "VIGILANCIA" :
  risk < 75 ? "ALERTA" : "CRÍTICO";

function markerColor(r) {
  if (r < 25) return "#16a34a";
  if (r < 50) return "#ca8a04";
  if (r < 75) return "#ea580c";
  return "#dc2626";
}

function stationRisk(s) {
  const rain = Number(s.rainfall) || 0;
  const river = Number(s.water_level) || 0;
  const trend = Number(s.trendRate) || 0;

  const score = Math.min(
    100,
    rain / 2 +
    Math.max(0, river - 3.2) * 20 +
    Math.max(0, trend) * 8
  );

  return Math.round(score);
}

function calculateTrend(measurements) {
  if (!measurements || measurements.length < 2) {
    return { direction: "stable", label: "ESTABLE", icon: "→", rate: 0 };
  }

  const ordered = [...measurements].sort(
    (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
  );

  // Usamos una ventana reciente para evitar que una medición vieja
  // domine la tendencia. Con 30 s entre lecturas, 10 mediciones ≈ 5 min.
  const recent = ordered.slice(-10);
  const oldest = recent[0];
  const newest = recent[recent.length - 1];

  const oldLevel = Number(oldest.water_level);
  const newLevel = Number(newest.water_level);
  const oldTime = new Date(oldest.timestamp).getTime();
  const newTime = new Date(newest.timestamp).getTime();
  const hours = (newTime - oldTime) / 3600000;

  if (!Number.isFinite(oldLevel) || !Number.isFinite(newLevel) ||
      !Number.isFinite(hours) || hours <= 0) {
    return { direction: "stable", label: "ESTABLE", icon: "→", rate: 0 };
  }

  const rate = (newLevel - oldLevel) / hours;

  if (rate >= 0.30)
    return { direction: "rising-fast", label: "SUBIENDO RÁPIDAMENTE", icon: "↗", rate: Number(rate.toFixed(2)) };

  if (rate >= 0.05)
    return { direction: "rising", label: "SUBIENDO", icon: "↗", rate: Number(rate.toFixed(2)) };

  if (rate <= -0.05)
    return { direction: "falling", label: "DESCENDIENDO", icon: "↘", rate: Number(rate.toFixed(2)) };

  return { direction: "stable", label: "ESTABLE", icon: "→", rate: Number(rate.toFixed(2)) };
}

function formatTime(timestamp) {
  if (!timestamp) return "—";
  const d = new Date(timestamp);
  return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function selectStation(s) {
  currentStation = s;

  document.getElementById("stationName").textContent = s.name;
  document.getElementById("rain1").textContent =
    s.rainfall == null ? "—" : `${Number(s.rainfall).toFixed(2)} mm`;
  document.getElementById("river").textContent =
    s.water_level == null ? "—" : `${Number(s.water_level).toFixed(2)} m`;
  document.getElementById("temperature").textContent =
    s.temperature == null ? "—" : `${Number(s.temperature).toFixed(1)} °C`;
  document.getElementById("readingTime").textContent = formatTime(s.timestamp);

  const r = stationRisk(s);
  const el = document.getElementById("stationRisk");
  el.textContent = riskLabel(r);
  el.className = `risk ${riskClass(r)}`;

  loadHistory(s.station_id);
}

function buildMarkers() {
  stations.forEach(s => {
    const risk = stationRisk(s);
    const icon = L.divIcon({
      className: "custom-marker",
      html: `<div style="
        width:20px;height:20px;border-radius:50%;
        background:${markerColor(risk)};
        border:3px solid white;
        box-shadow:0 1px 7px #0006"></div>`,
      iconSize: [20, 20],
      iconAnchor: [10, 10]
    });

    s.marker = L.marker([s.latitude, s.longitude], { icon })
      .addTo(map)
      .bindTooltip(s.name)
      .on("click", () => selectStation(s));
  });
}

async function loadHistory(stationId) {
  try {
    const res = await fetch(`/api/measurements/${stationId}?t=${Date.now()}`, {
      cache: "no-store"
    });
    if (!res.ok) throw new Error("No se pudo obtener el historial");

    const data = await res.json();
    const measurements = data.measurements || [];
    const trend = calculateTrend(measurements);

    if (currentStation && currentStation.station_id === stationId) {
      document.getElementById("trend").textContent =
        `${trend.icon} ${trend.label}`;
      document.getElementById("trendRate").textContent =
        `${trend.rate >= 0 ? "+" : ""}${trend.rate.toFixed(2)} m/h`;

      // El cálculo de riesgo también considera la tendencia ascendente.
      currentStation.trendRate = trend.rate;

      const r = stationRisk(currentStation);
      const riskEl = document.getElementById("stationRisk");
      riskEl.textContent = riskLabel(r);
      riskEl.className = `risk ${riskClass(r)}`;
    }

    measurements.sort(
      (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
    );

    const labels = measurements.map(m =>
      new Date(m.timestamp).toLocaleTimeString("es-AR", {
        hour: "2-digit", minute: "2-digit", second: "2-digit"
      })
    );

    const waterLevels = measurements.map(m => Number(m.water_level));
    const rainfall = measurements.map(m => Number(m.rainfall));

    const canvas = document.getElementById("historyChart");
    if (!canvas) return;

    if (historyChart) historyChart.destroy();

    historyChart = new Chart(canvas, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Nivel del agua (m)",
            data: waterLevels,
            tension: 0.25,
            yAxisID: "water"
          },
          {
            label: "Lluvia (mm)",
            data: rainfall,
            tension: 0.25,
            yAxisID: "rain"
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        scales: {
          water: {
            type: "linear",
            position: "left",
            title: { display: true, text: "Nivel (m)" }
          },
          rain: {
            type: "linear",
            position: "right",
            title: { display: true, text: "Lluvia (mm)" },
            grid: { drawOnChartArea: false }
          }
        },
        plugins: {
          legend: { display: true }
        }
      }
    });
  } catch (error) {
    console.error("Error cargando historial:", error);
  }
}

async function updateSensorData() {
  try {
    const res = await fetch(`/api/stations-status?t=${Date.now()}`, {
      cache: "no-store"
    });
    if (!res.ok) throw new Error("No se pudo actualizar el estado");

    const data = await res.json();

    data.stations.forEach(updated => {
      const s = stations.find(x => x.station_id === updated.station_id);
      if (!s) return;

      Object.assign(s, {
        rainfall: updated.rainfall,
        water_level: updated.water_level,
        temperature: updated.temperature,
        timestamp: updated.timestamp,
        source: updated.source
      });

      const risk = stationRisk(s);

      if (s.marker) {
        const icon = L.divIcon({
          className: "custom-marker",
          html: `<div style="
            width:20px;height:20px;border-radius:50%;
            background:${markerColor(risk)};
            border:3px solid white;
            box-shadow:0 1px 7px #0006"></div>`,
          iconSize: [20, 20],
          iconAnchor: [10, 10]
        });
        s.marker.setIcon(icon);
      }
    });

    if (currentStation) {
      const updatedCurrent = stations.find(
        s => s.station_id === currentStation.station_id
      );

      if (updatedCurrent) {
        currentStation = updatedCurrent;
        selectStation(updatedCurrent);
        await loadHistory(updatedCurrent.station_id);
      }
    }

    console.log("Datos de sensores actualizados:", new Date().toString());
  } catch (error) {
    console.error("Error actualizando sensores:", error);
  }
}

async function generateAutomaticMeasurements() {
  try {
    console.log("Generando nuevas mediciones...");

    const res = await fetch("/api/simulate-sensors", {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    console.log("Nuevas mediciones generadas:", data);

    await updateSensorData();
  } catch (error) {
    console.error("Error en la simulación automática:", error);
  }
}

async function simulate() {
  try {
    const payload = {
      rain: Number(document.getElementById("rain").value),
      duration: Number(document.getElementById("duration").value),
      river: Number(document.getElementById("riverInput").value),
      forecast: Number(document.getElementById("forecast").value)
    };

    const res = await fetch("/api/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const d = await res.json();

    if (!res.ok) throw new Error(d.message || "Error en simulación");

    const result = document.getElementById("result");
    result.classList.remove("hidden");

    document.getElementById("resultLabel").textContent = d.label;
    document.getElementById("resultLabel").style.color = markerColor(d.risk);
    document.getElementById("resultRisk").textContent = `${d.risk}%`;
    document.getElementById("resultTime").textContent =
      d.time_hours ? `${d.time_hours} h` : "No calculado";
    document.getElementById("resultPeople").textContent =
      Number(d.affected || 0).toLocaleString("es-AR");
    document.getElementById("resultMessage").textContent = d.message;
  } catch (error) {
    console.error("Error en simulación:", error);
  }
}

async function load() {
  try {
    const res = await fetch(`/api/stations-status?t=${Date.now()}`, {
      cache: "no-store"
    });

    const statusData = await res.json();

    stations = statusData.stations || [];

    if (!stations.length) {
      const base = await fetch("/api/stations");
      stations = await base.json();
    }

    map = L.map("map").setView([-27.05, -65.35], 8);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors"
    }).addTo(map);

    buildMarkers();

    selectStation(stations[0]);

    // Actualización cada 30 segundos, como en el prototipo.
    refreshTimer = setInterval(updateSensorData, 30000);
    simulationTimer = setInterval(generateAutomaticMeasurements, 30000);

    // Primera actualización automática tras cargar.
    setTimeout(generateAutomaticMeasurements, 3000);
  } catch (error) {
    console.error("Error inicializando aplicación:", error);
  }
}

window.addEventListener("load", load);
