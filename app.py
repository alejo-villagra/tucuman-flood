from flask import Flask, render_template, jsonify, request
import os
import random
import json
from pathlib import Path
from datetime import datetime

import psycopg
from psycopg.rows import dict_row

app = Flask(__name__)
BASE = Path(__file__).parent
DATABASE_URL = os.environ.get("DATABASE_URL")

with open(BASE / "data" / "stations.json", encoding="utf-8") as f:
    STATIONS = json.load(f)


def db_connect():
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL no está configurada en Render")
    return psycopg.connect(DATABASE_URL, row_factory=dict_row)


def ensure_tables():
    with db_connect() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS stations (
                    station_id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    latitude DOUBLE PRECISION NOT NULL,
                    longitude DOUBLE PRECISION NOT NULL,
                    station_type TEXT DEFAULT 'sensor',
                    active BOOLEAN DEFAULT TRUE
                )
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS measurements (
                    id BIGSERIAL PRIMARY KEY,
                    station_id TEXT NOT NULL REFERENCES stations(station_id) ON DELETE CASCADE,
                    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    water_level DOUBLE PRECISION,
                    rainfall DOUBLE PRECISION,
                    temperature DOUBLE PRECISION,
                    source TEXT DEFAULT 'simulated'
                )
            """)
            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_measurements_station_time
                ON measurements(station_id, timestamp DESC)
            """)

            for s in STATIONS:
                cur.execute("""
                    INSERT INTO stations
                        (station_id, name, latitude, longitude, station_type, active)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    ON CONFLICT (station_id) DO UPDATE SET
                        name = EXCLUDED.name,
                        latitude = EXCLUDED.latitude,
                        longitude = EXCLUDED.longitude,
                        station_type = EXCLUDED.station_type,
                        active = EXCLUDED.active
                """, (
                    s["station_id"], s["name"], s["lat"], s["lon"],
                    "sensor", True
                ))
        conn.commit()



def serialize_measurement(row):
    if not row:
        return None
    item = dict(row)
    if item.get("timestamp"):
        item["timestamp"] = item["timestamp"].isoformat()
    return item

def station_defaults():
    return {s["station_id"]: s for s in STATIONS}


def generate_measurement(station_id):
    # Datos simulados para demostración. En producción se reemplazan
    # por las lecturas recibidas desde los sensores/gateway.
    rainfall = round(random.uniform(0, 60), 2)
    water_level = round(random.uniform(1.0, 5.5), 2)
    temperature = round(random.uniform(15.0, 35.0), 1)

    with db_connect() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO measurements
                    (station_id, water_level, rainfall, temperature, source)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id, station_id, timestamp, water_level,
                          rainfall, temperature, source
            """, (
                station_id, water_level, rainfall, temperature, "simulated"
            ))
            row = cur.fetchone()
        conn.commit()
    return row


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/stations")
def stations():
    return jsonify(STATIONS)


@app.route("/api/test-db")
def test_db():
    try:
        with db_connect() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1 AS ok")
                result = cur.fetchone()
        return jsonify({"status": "ok", "database": result["ok"]})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/create-tables")
def create_tables():
    try:
        ensure_tables()
        return jsonify({
            "status": "ok",
            "message": "Tablas creadas, estaciones cargadas y relación establecida correctamente"
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/measurements", methods=["POST"])
def add_measurement():
    try:
        data = request.get_json(force=True) or {}
        station_id = data.get("station_id")
        if not station_id:
            return jsonify({"status": "error", "message": "station_id es obligatorio"}), 400

        ensure_tables()

        with db_connect() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO measurements
                        (station_id, water_level, rainfall, temperature, source)
                    VALUES (%s, %s, %s, %s, %s)
                    RETURNING id, station_id, timestamp, water_level,
                              rainfall, temperature, source
                """, (
                    station_id,
                    data.get("water_level"),
                    data.get("rainfall"),
                    data.get("temperature"),
                    data.get("source", "sensor")
                ))
                row = cur.fetchone()
            conn.commit()

        return jsonify({"status": "ok", "measurement": serialize_measurement(row)})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/measurements/<station_id>")
def station_measurements(station_id):
    try:
        with db_connect() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT id, station_id, timestamp, water_level,
                           rainfall, temperature, source
                    FROM measurements
                    WHERE station_id = %s
                    ORDER BY timestamp DESC
                    LIMIT 30
                """, (station_id,))
                rows = cur.fetchall()

        return jsonify({
            "status": "ok",
            "station_id": station_id,
            "measurements": [serialize_measurement(r) for r in rows]
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/stations-status")
def stations_status():
    try:
        with db_connect() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT DISTINCT ON (station_id)
                        station_id, timestamp, water_level,
                        rainfall, temperature, source
                    FROM measurements
                    ORDER BY station_id, timestamp DESC
                """)
                rows = cur.fetchall()

        latest = {r["station_id"]: r for r in rows}
        result = []

        for s in STATIONS:
            m = latest.get(s["station_id"])
            item = {
                "station_id": s["station_id"],
                "name": s["name"],
                "latitude": s["lat"],
                "longitude": s["lon"],
                "station_type": "sensor",
                "active": True,
                "water_level": m["water_level"] if m else None,
                "rainfall": m["rainfall"] if m else None,
                "temperature": m["temperature"] if m else None,
                "source": m["source"] if m else None,
                "timestamp": m["timestamp"].isoformat() if m and m["timestamp"] else None
            }
            result.append(item)

        return jsonify({"status": "ok", "stations": result})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/simulate-sensors", methods=["POST"])
def simulate_sensors():
    try:
        ensure_tables()
        measurements = [serialize_measurement(generate_measurement(s["station_id"])) for s in STATIONS]
        return jsonify({
            "status": "ok",
            "message": "Mediciones simuladas generadas para todas las estaciones",
            "measurements": measurements
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/simulate", methods=["POST"])
def simulate():
    try:
        data = request.get_json(force=True) or {}
        rain = float(data.get("rain", 0))
        duration = max(float(data.get("duration", 1)), 1)
        river = float(data.get("river", 0))
        forecast = float(data.get("forecast", 0))

        intensity = rain / duration

        score = (
            0.25 * min(rain / 250, 1) +
            0.20 * min(forecast / 150, 1) +
            0.35 * min(max(river - 3.5, 0) / 2.5, 1) +
            0.20 * min(intensity / 50, 1)
        )
        risk = round(min(100, score * 100))

        if risk < 25:
            label = "NORMAL"
            message = "Condiciones experimentales dentro de parámetros normales."
        elif risk < 50:
            label = "VIGILANCIA"
            message = "Se recomienda mantener monitoreo de las condiciones."
        elif risk < 75:
            label = "ALERTA"
            message = "Condiciones potencialmente peligrosas. Aumentar el monitoreo."
        else:
            label = "CRÍTICO"
            message = "Condiciones críticas en el modelo experimental. Evaluar medidas preventivas."

        # Estimación demostrativa, no operativa.
        time_hours = round(max(0.5, 8 - risk / 15), 1) if risk >= 50 else None
        affected = round(max(0, risk - 35) * 120)

        return jsonify({
            "status": "ok",
            "risk": risk,
            "label": label,
            "message": message,
            "time_hours": time_hours,
            "affected": affected
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 400


@app.route("/health")
def health():
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
