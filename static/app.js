let map, stations = [];
let stationStatus = [];

const riskClass = (risk) =>
  risk < 25 ? "normal" :
  risk < 50 ? "watch" :
  risk < 75 ? "alert" : "critical";

const riskLabel = (risk) =>
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
  let score = Math.min(
    100,
    s.rain24h / 2 +
    Math.max(0, s.river - 3.2) * 20 +
    s.trend * 80
  );
  return Math.round(score);
}

function formatSensorValue(value, unit = "") {
  if (value === null || value === undefined) {
    return "Sin datos";
  }
  return value + unit;
}

function formatTimestamp(timestamp) {
  if (!timestamp) {
    return "Sin datos";
  }
  
  const date = new Date(timestamp);
  
  return date.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function selectStation(s) {
  document.getElementById("stationName").textContent = s.name;
  
  // Datos originales del prototipo
  document.getElementById("rain1").textContent =
    s.rain1h + " mm";
  document.getElementById("rain24").textContent = s.rain24h + " mm";
  document.getElementById("river").textContent = s.river.toFixed(1) + " m";
  document.getElementById("trend").textContent = "+" + (s.trend * 100).toFixed(0) + " cm/h";
  
  // Datos provenientes de PostgreSQL 
  document.getElementById("sensorWaterLevel").textContent =
    formatSensorValue(s.sensorWaterLevel, " m");
  document.getElementById("sensorRainfall").textContent = formatSensorValue(s.sensorRainfall, " mm");
  document.getElementById("sensorTemperature").textContent = formatSensorValue(s.sensorTemperature, " °C");
  document.getElementById("sensorSource").textContent = s.sensorSource ? s.sensorSource.toUpperCase() : "Sin datos";
  document.getElementById("sensorTimestamp").textContent = formatTimestamp(s.sensorTimestamp);
  
  // Riesgo original del prototipo 
  const r = stationRisk(s);
  const el = document.getElementById("stationRisk");
  
  el.textContent = riskLabel(r);
  el.className = "risk " + riskClass(r);
}

async function load() {
  try {
    // Información original de las estaciones 
    const stationsRes = await fetch("/api/stations");
    stations = await stationsRes.json();
    
    // Últimas mediciones desde PostgreSQL 
    const statusRes = await fetch("/api/stations-status");
    const statusData = await statusRes.json();
    stationStatus = statusData.stations || [];
    
    // Unimos los datos utilizando 
    station_id stations = stations.map((station, index) => {
      const status = stationStatus.find(
        s => s.station_id === `ST${String(index + 1).padStart(3, "0")}`
      );
      
      return { ...station, station_id: status?.station_id || `ST${String(index + 1).padStart(3, "0")}`,
              sensorWaterLevel: status?.water_level ?? null,
              sensorRainfall: status?.rainfall ?? null,
              sensorTemperature: status?.temperature ?? null,
              sensorSource: status?.source ?? null,
              sensorTimestamp: status?.timestamp ?? null
             };
    });
    
    map = L.map("map").setView([-27.05, -65.35], 8);
    L.tileLayer(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        attribution: "© OpenStreetMap"
      }
    ).addTo(map);
    stations.forEach(s => {
      const r = stationRisk(s);
      const icon = L.divIcon({
        className: "custom-marker",
       html: ` 
        <div style="
          width:18px;
          height:18px;
          border-radius:50%;
          background:${markerColor(r)};
          border:3px solid white;
          box-shadow:0 1px 6px #0006
        "></div>
       `,
        iconSize: [18, 18],
        iconAnchor: [9, 9]
      });
      
      L.marker([s.lat, s.lon], { icon })
        .addTo(map)
        .bindTooltip(s.name)
        .on("click", () => selectStation(s));
    });
    
    if (stations.length > 0) {
      selectStation(stations[0]);
    }
  } catch (error) {
    console.error("Error cargando estaciones:", error);
  }
}

async function simulate() {
  const payload = {
    rain: +rain.value,
    duration: +duration.value,
    river: +riverInput.value,
    forecast: +forecast.value
  };
  
  const res = await fetch("/api/simulate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  
  const d = await res.json();
  result.classList.remove("hidden");
  resultLabel.textContent = d.label;
  resultLabel.style.color = markerColor(d.risk);
  resultRisk.textContent = d.risk + "%";
  resultTime.textContent = d.time_hours ? d.time_hours + " h" : "No calculado";
  resultPeople.textContent = d.affected.toLocaleString("es-AR");
  resultMessage.textContent = d.message;
}

window.addEventListener("load", load);
