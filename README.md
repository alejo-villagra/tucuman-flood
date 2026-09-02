# Sistema de Alerta Temprana de Inundaciones — Tucumán

Prototipo Flask + PostgreSQL + Leaflet + Chart.js.

## Deploy en Render

1. Subir todos los archivos a GitHub.
2. En Render usar el repositorio existente.
3. Build Command:
   `pip install -r requirements.txt`
4. Start Command:
   `gunicorn app:app`
5. Configurar `DATABASE_URL` con la URL de PostgreSQL de Render.
6. Una vez desplegado, abrir:
   `https://tucuman-flood.onrender.com`
7. Para crear tablas y cargar estaciones, abrir:
   `/api/create-tables`

## Funcionalidades

- Mapa Leaflet con 6 estaciones.
- Datos simulados cada 30 segundos.
- PostgreSQL para almacenar mediciones.
- API de ingreso y consulta de mediciones.
- Historial de las últimas 30 mediciones.
- Gráfica de nivel de agua y lluvia.
- Tendencia del nivel en m/h.
- Clasificación NORMAL / VIGILANCIA / ALERTA / CRÍTICO.
- Simulador experimental de riesgo.

Este proyecto es demostrativo y no constituye un sistema oficial de alerta ni una orden de evacuación.
