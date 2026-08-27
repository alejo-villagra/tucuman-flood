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
