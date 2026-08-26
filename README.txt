PROTOTIPO WEB — SISTEMA DE ALERTA TEMPRANA DE INUNDACIONES DE TUCUMÁN

Requisitos:
- Windows 10/11
- Python 3.10 o superior
- Internet para cargar el mapa base de OpenStreetMap

INSTALACIÓN:
1. Abrí CMD en esta carpeta.
2. Ejecutá:
   py -m pip install -r requirements.txt
3. Ejecutá:
   py app.py
4. Abrí Chrome en:
   http://localhost:8000

IMPORTANTE:
Los datos meteorológicos, hidrológicos y resultados de simulación de esta primera versión son DEMOSTRATIVOS.
No utilizar el prototipo para decisiones reales de evacuación.

Siguiente etapa:
- conectar EEAOC/SMN/INA
- incorporar capas GIS reales de IDET/RIDES
- incorporar DEM/topografía
- calibrar con inundaciones históricas
- desarrollar modelo hidrológico/hidráulico
