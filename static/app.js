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
  // Si no hay datos del sensor, usamos el cálculo
  // original del prototipo.
  if (
    s.sensorWaterLevel === null ||
    s.sensorWaterLevel === undefined
  ) {
    let score = Math.min(
      100,
      s.rain24h / 2 +
      Math.max(0, s.river - 3.2) * 20 +
      s.trend * 80
    );

    return Math.round(score);
  }

  // -----------------------------
  // RIESGO EXPERIMENTAL DEL SENSOR
  // -----------------------------

  let levelScore = 0;
  let rainScore = 0;

  // Nivel de agua
  if (s.sensorWaterLevel < 2.5) {
    levelScore = 0;
  } else if (s.sensorWaterLevel < 3.5) {
    levelScore = 35;
  } else if (s.sensorWaterLevel < 4.5) {
    levelScore = 70;
  } else {
    levelScore = 100;
  }

  // Lluvia
  if (s.sensorRainfall < 20) {
    rainScore = 0;
  } else if (s.sensorRainfall < 40) {
    rainScore = 30;
  } else if (s.sensorRainfall < 60) {
    rainScore = 70;
  } else {
    rainScore = 100;
  }

  // Combinación experimental
  const score =
    levelScore * 0.70 +
    rainScore * 0.30;

  return Math.round(Math.min(score, 100));
}

function formatSensorValue(value, unit) {
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

  document.getElementById("rain24").textContent =
    s.rain24h + " mm";

  document.getElementById("river").textContent =
    s.river.toFixed(1) + " m";

  document.getElementById("trend").textContent =
    "+" + (s.trend * 100).toFixed(0) + " cm/h";

  // Datos del sensor / PostgreSQL
  document.getElementById("sensorWaterLevel").textContent =
    formatSensorValue(s.sensorWaterLevel, " m");

  document.getElementById("sensorRainfall").textContent =
    formatSensorValue(s.sensorRainfall, " mm");

  document.getElementById("sensorTemperature").textContent =
    formatSensorValue(s.sensorTemperature, " °C");

  document.getElementById("sensorSource").textContent =
    s.sensorSource
      ? s.sensorSource.toUpperCase()
      : "Sin datos";

  document.getElementById("sensorTimestamp").textContent =
    formatTimestamp(s.sensorTimestamp);

  // Riesgo actual del prototipo
  const r = stationRisk(s);
  const el = document.getElementById("stationRisk");

  el.textContent = riskLabel(r);
  el.className = "risk " + riskClass(r);
}

async function load() {
  try {
    // 1. Cargar estaciones originales
    const stationsRes = await fetch("/api/stations");

    if (!stationsRes.ok) {
      throw new Error("No se pudieron cargar las estaciones");
    }

    stations = await stationsRes.json();

    // 2. Cargar últimas mediciones desde PostgreSQL
    const statusRes = await fetch("/api/stations-status");

    if (!statusRes.ok) {
      throw new Error("No se pudieron cargar los datos de sensores");
    }

    const statusData = await statusRes.json();

    stationStatus = statusData.stations || [];

    // 3. Combinar estaciones con sus mediciones
    stations = stations.map((station, index) => {
      const stationId =
        "ST" + String(index + 1).padStart(3, "0");

      const status = stationStatus.find(
        item => item.station_id === stationId
      );

      return {
        ...station,
        station_id: stationId,

        sensorWaterLevel:
          status ? status.water_level : null,

        sensorRainfall:
          status ? status.rainfall : null,

        sensorTemperature:
          status ? status.temperature : null,

        sensorSource:
          status ? status.source : null,

        sensorTimestamp:
          status ? status.timestamp : null
      };
    });

    // 4. Crear mapa
    map = L.map("map").setView(
      [-27.05, -65.35],
      8
    );

    L.tileLayer(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        attribution: "© OpenStreetMap"
      }
    ).addTo(map);

    // 5. Crear marcadores
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
            box-shadow:0 1px 6px #0006;
          "></div>
        `,

        iconSize: [18, 18],
        iconAnchor: [9, 9]
      });

      L.marker(
        [s.lat, s.lon],
        { icon: icon }
      )
        .addTo(map)
        .bindTooltip(s.name)
        .on("click", () => selectStation(s));
    });

    // 6. Seleccionar primera estación
    if (stations.length > 0) {
      selectStation(stations[0]);
    }

  } catch (error) {
    console.error(
      "Error cargando el mapa:",
      error
    );
  }
}

async function simulate() {
  const payload = {
    rain: +document.getElementById("rain").value,
    duration: +document.getElementById("duration").value,
    river: +document.getElementById("riverInput").value,
    forecast: +document.getElementById("forecast").value
  };

  const res = await fetch("/api/simulate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const d = await res.json();

  document.getElementById("result").classList.remove("hidden");

  document.getElementById("resultLabel").textContent =
    d.label;

  document.getElementById("resultLabel").style.color =
    markerColor(d.risk);

  document.getElementById("resultRisk").textContent =
    d.risk + "%";

  document.getElementById("resultTime").textContent =
    d.time_hours
      ? d.time_hours + " h"
      : "No calculado";

  document.getElementById("resultPeople").textContent =
    d.affected.toLocaleString("es-AR");

  document.getElementById("resultMessage").textContent =
    d.message;
}

async function updateSensorData() {
  try {
    const statusRes = await fetch("/api/stations-status");

    if (!statusRes.ok) {
      throw new Error("No se pudieron actualizar los datos de sensores");
    }

    const statusData = await statusRes.json();

    stationStatus = statusData.stations || [];

    stations = stations.map((station) => {
      const status = stationStatus.find(
        item => item.station_id === station.station_id
      );

      return {
        ...station,

        sensorWaterLevel:
          status ? status.water_level : null,

        sensorRainfall:
          status ? status.rainfall : null,

        sensorTemperature:
          status ? status.temperature : null,

        sensorSource:
          status ? status.source : null,

        sensorTimestamp:
          status ? status.timestamp : null
      };
    });

    // Actualizar la estación actualmente seleccionada
    const currentStationName =
      document.getElementById("stationName").textContent;

    const currentStation = stations.find(
      station => station.name === currentStationName
    );

    if (currentStation) {
      selectStation(currentStation);
    }

    console.log("Datos de sensores actualizados:", new Date());

  } catch (error) {
    console.error(
      "Error actualizando datos de sensores:",
      error
    );
  }
}

setInterval(updateSensorData, 30000);

window.addEventListener("load", load);
