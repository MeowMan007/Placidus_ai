# Placidus AI — Classical Astrological Observatory & Counselor

A high-precision **Placidus Natal Chart Observatory** and **Hellenistic Astrological Counselor**, engineered purely in **Python & FastAPI**.

Zero TypeScript/Node runtime dependencies. Direct Python server hosting a hand-crafted astronomical workstation inspired by 17th-century celestial cartography, Keplerian ephemerides, and Demetra George's authentic self counseling framework.

---

## Key Capabilities

### 1. Automatic Land & Coordinate Resolution
- Debounced geocoding query interface powered by OpenStreetMap Nominatim with local fallback for major global cities.
- Automatic UTC timezone offset detection based on latitude and longitude coordinates.

### 2. High-Precision Astrological Calculations
- **Placidus House System**: Solves Placidus semi-arc transcendental equations to compute exact house cusps.
- **Hellenistic Sect Analysis**: Evaluates solar placement relative to the Ascendant-Descendant axis to determine **Diurnal (Day)** or **Nocturnal (Night)** status.
- **Lord of the Chart (*Oikodespotes*)**: Automatically resolves the traditional planetary ruler of the rising sign and locates its natal station.
- **Sect Benefic & Malefic**: Identifies the primary in-sect ally (Jupiter for Day, Venus for Night) and the contrary malefic (Mars for Day, Saturn for Night).
- **Hermetic Lots**: Calculates the **Lot of Fortune (*Tyche*)** and **Lot of Spirit (*Daimon*)** with sect-sensitive formulas.
- **Essential Dignities**: Evaluates classical rulership, exaltation, detriment, and fall.
- **Complete Aspect Matrix**: Exact orbs for Conjunctions, Sextiles, Squares, Trines, and Oppositions.

### 3. Demetra George AI Counselor (RAG Knowledge Engine)
- Integrated retrieval-augmented generation engine citing classical Hellenistic doctrine and Demetra George's *Astrology and the Authentic Self*.
- Intent detector supporting multi-mode analysis: Sect, Lord of the Chart, Arabic Lots, Nodal Axis, Luminaries, and House Interpretations.

### 4. Hand-Crafted Observatory UI
- **Zero AI-Template Clichés**: Built with deep obsidian (`#080B11`), slate (`#0E131E`), aged celestial brass (`#C5A059`), and classical serif typography (`Cinzel`, `Plus Jakarta Sans`, `JetBrains Mono`).
- Interactive SVG Placidus Wheel with responsive hover chords that dynamically highlight planetary aspects.
- Planetary Ephemeris, House Cusps, Aspect Grid Matrix, and Elemental/Modality distribution tabs.

---

## Architecture

```
Placidus_ai/
├── app/
│   ├── agent/             # Astrology AI Agent & tools
│   │   ├── orchestrator.py
│   │   └── tools.py
│   ├── models/            # Pydantic schemas & response models
│   │   └── schemas.py
│   ├── rag/               # Ingestion & retrieval pipeline
│   │   └── ingest.py
│   ├── services/          # Pure Python astronomical math & geocoding
│   │   ├── astro_math.py
│   │   ├── chart.py
│   │   ├── geo.py
│   │   └── vectorstore.py
│   ├── static/            # Observatory UI (HTML5, CSS3, Vanilla JS)
│   │   ├── app.js
│   │   ├── index.html
│   │   └── style.css
│   └── main.py            # FastAPI application & API endpoints
├── data/
│   ├── vectorstore/       # Pre-computed RAG knowledge chunks & embedder
│   └── pdf_text.txt       # Source astrological corpus
├── requirements.txt       # Python dependencies
├── start.bat              # One-click Windows launcher
├── start.sh               # One-click Linux/macOS launcher
└── README.md
```

---

## Getting Started

### Prerequisites
- Python 3.10+ (tested up to Python 3.13)

### One-Click Launch (Windows)
Double-click `start.bat` or run:
```cmd
start.bat
```
This automatically initializes the virtual environment, installs dependencies, and launches the Observatory at `http://127.0.0.1:8000`.

### One-Click Launch (Linux / macOS)
```bash
chmod +x start.sh
./start.sh
```

### Manual Installation
```bash
# 1. Create and activate virtual environment
python -m venv venv
source venv/bin/activate       # Linux/macOS
# or: .\venv\Scripts\activate   # Windows

# 2. Install dependencies
pip install -r requirements.txt

# 3. Launch server
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```
Open your browser to: **`http://127.0.0.1:8000`**

---

## API Endpoints

Interactive Swagger documentation is available at `http://127.0.0.1:8000/api/docs`.

- `GET /` — Serves the Astrological Observatory Workstation.
- `GET /api/geocode?q={city}` — City search & automatic coordinate detection.
- `GET /api/timezone?lat={lat}&lon={lon}` — Automatic UTC offset resolution.
- `POST /api/calculate-chart` — Generates complete Placidus chart data.
- `POST /api/ai-astrologer` — Demetra George counselor inquiry & analysis.
- `GET /health` — Health status of mathematical engines and vectorstore.

---

## License
MIT License.
