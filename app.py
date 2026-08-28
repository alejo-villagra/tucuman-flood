from flask import Flask, render_template, jsonify, request
import json, math, random
import os
from pathlib import Path
import psycopg

DATABASE_URL = os.environ.get("DATABASE_URL")

app = Flask(__name__)
BASE = Path(__file__).parent

with open(BASE/"data"/"stations.json", encoding="utf-8") as f:
    STATIONS = json.load(f)

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/stations")
def stations():
    return jsonify(STATIONS)

@app.route("/api/test-db")
def test_db():
    try:
        with psycopg.connect(DATABASE_URL) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
                result = cur.fetchone()

        return jsonify({
            "status": "ok",
            "database": result[0]
        })

    except Exception as e:
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500

@app.route("/api/create-tables")
def create_tables():
    try:
        with psycopg.connect(DATABASE_URL) as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS stations (
                        id SERIAL PRIMARY KEY,
                        station_id VARCHAR(50) UNIQUE NOT NULL,
                        name VARCHAR(100) NOT NULL,
                        latitude DOUBLE PRECISION,
                        longitude DOUBLE PRECISION,
                        station_type VARCHAR(50),
                        river VARCHAR(100),
                        active BOOLEAN DEFAULT TRUE
                    )
                """)

                cur.execute("""
                    CREATE TABLE IF NOT EXISTS measurements (
                        id SERIAL PRIMARY KEY,
                        station_id VARCHAR(50) NOT NULL,
                        timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        water_level DOUBLE PRECISION,
                        rainfall DOUBLE PRECISION,
                        temperature DOUBLE PRECISION,
                        source VARCHAR(20) NOT NULL DEFAULT 'simulated',
                        CONSTRAINT measurements_source_check
                            CHECK (source IN ('real', 'simulated'))
                    )
                """)

            conn.commit()

        return jsonify({
            "status": "ok",
            "message": "Tablas stations y measurements creadas correctamente"
        })

    except Exception as e:
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500

@app.route("/api/measurements", methods=["POST"])
def create_measurement():
    try:
        d = request.get_json(force=True)

        station_id = d.get("station_id")
        source = d.get("source", "simulated")

        if not station_id:
            return jsonify({
                "status": "error",
                "message": "station_id es obligatorio"
            }), 400

        if source not in ("real", "simulated"):
            return jsonify({
                "status": "error",
                "message": "source debe ser 'real' o 'simulated'"
            }), 400

        water_level = d.get("water_level")
        rainfall = d.get("rainfall")
        temperature = d.get("temperature")

        if water_level is not None:
            water_level = float(water_level)

        if rainfall is not None:
            rainfall = float(rainfall)

        if temperature is not None:
            temperature = float(temperature)

        with psycopg.connect(DATABASE_URL) as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO measurements (
                        station_id,
                        water_level,
                        rainfall,
                        temperature,
                        source
                    )
                    VALUES (%s, %s, %s, %s, %s)
                    RETURNING id, timestamp
                """, (
                    station_id,
                    water_level,
                    rainfall,
                    temperature,
                    source
                ))

                measurement_id, timestamp = cur.fetchone()

            conn.commit()

        return jsonify({
            "status": "ok",
            "message": "Medición guardada correctamente",
            "measurement": {
                "id": measurement_id,
                "station_id": station_id,
                "timestamp": timestamp.isoformat(),
                "water_level": water_level,
                "rainfall": rainfall,
                "temperature": temperature,
                "source": source
            }
        })

    except ValueError:
        return jsonify({
            "status": "error",
            "message": "Los valores de los sensores deben ser numéricos"
        }), 400

    except Exception as e:
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500

@app.route("/api/simulate", methods=["POST"])
def simulate():
    d = request.get_json(force=True)
    rain = float(d.get("rain", 150))
    duration = float(d.get("duration", 6))
    river = float(d.get("river", 4.2))
    forecast = float(d.get("forecast", 80))
    # Educational prototype only: deliberately simple scoring model.
    intensity = rain / max(duration, 1)
    score = 0.25*min(rain/250,1) + 0.20*min(forecast/150,1) + 0.35*min(max(river-3.5,0)/2.5,1) + 0.20*min(intensity/30,1)
    risk = round(min(score,1)*100)
    if risk < 25: level, label = "normal", "NORMAL"
    elif risk < 50: level, label = "watch", "VIGILANCIA"
    elif risk < 75: level, label = "alert", "ALERTA"
    else: level, label = "critical", "CRÍTICO"
    # illustrative estimate, not an operational evacuation calculation
    if risk >= 75:
        hours = max(1.0, 5.5 - risk/35)
    elif risk >= 50:
        hours = max(2.0, 8.0 - risk/20)
    else:
        hours = None
    affected = round(800 + risk*58)
    return jsonify({
        "risk": risk, "level": level, "label": label,
        "time_hours": round(hours,1) if hours else None,
        "affected": affected,
        "message": "Simulación educativa. No usar para decisiones reales de evacuación."
    })

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8000)), debug=False)
