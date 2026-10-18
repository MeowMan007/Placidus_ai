"""
AstroAI Platform - Main FastAPI Application
Production-ready API for Placidus natal chart generation and AI astrological analysis.
"""
import os
import sys
import uuid
from datetime import datetime
from typing import Optional, List
from contextlib import asynccontextmanager

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
if sys.stderr and hasattr(sys.stderr, "reconfigure"):
    try:
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.models.schemas import (
    BirthDataRequest, ChartResponse, ChatRequest, ChatResponse,
    PlanetResponse, HouseResponse, AspectResponse, HealthCheck
)
from app.services.chart import ChartEngine, GeoLocation
from app.services.geo import geocode_query, detect_timezone
from app.agent.orchestrator import AstrologyAgent
from app.core.llm_client import get_llm_client

# Security
security = HTTPBearer(auto_error=False)

# Global instances
chart_engine = ChartEngine()
rag_retriever = None  # Initialized on startup if vector store exists


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager - startup and shutdown events."""
    # Startup
    global rag_retriever

    # Try to load RAG vector store
    vectorstore_path = os.getenv("VECTORSTORE_PATH", "data/vectorstore")
    if not os.path.exists(vectorstore_path) and os.path.exists(os.path.join("..", vectorstore_path)):
        vectorstore_path = os.path.join("..", vectorstore_path)
    chunks_path = os.path.join(vectorstore_path, "chunks.json")
    embedder_path = os.path.join(vectorstore_path, "embedder.pkl")

    if os.path.exists(chunks_path) and os.path.exists(embedder_path):
        try:
            from app.rag.ingest import DocumentIngestion, EmbeddingEngine, RAGRetriever

            ingest = DocumentIngestion()
            ingest.load_chunks(chunks_path)

            embedder = EmbeddingEngine()
            embedder.load(embedder_path)

            rag_retriever = RAGRetriever(ingest.chunks, embedder, top_k=5)
            print(f"[OK] Loaded RAG vector store with {len(ingest.chunks)} chunks")
        except Exception as e:
            print(f"[WARN] Could not load RAG vector store: {e}")
    else:
        print("[WARN] No RAG vector store found. Run ingestion pipeline first.")

    yield

    # Shutdown
    print("Shutting down AstroAI Platform...")


app = FastAPI(
    title="AstroAI Platform API",
    description="AI-Powered Placidus Astrology Platform with RAG Knowledge System",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Helper: Convert internal chart data to response schema
def _chart_to_response(chart_data) -> ChartResponse:
    """Transform internal ChartData to API response model."""

    def _planet_to_response(p):
        # Determine element and modality
        elements = {
            "fire": ["Aries", "Leo", "Sagittarius"],
            "earth": ["Taurus", "Virgo", "Capricorn"],
            "air": ["Gemini", "Libra", "Aquarius"],
            "water": ["Cancer", "Scorpio", "Pisces"]
        }
        modalities = {
            "cardinal": ["Aries", "Cancer", "Libra", "Capricorn"],
            "fixed": ["Taurus", "Leo", "Scorpio", "Aquarius"],
            "mutable": ["Gemini", "Virgo", "Sagittarius", "Pisces"]
        }

        element = next((e for e, signs in elements.items() if p.sign in signs), "fire")
        modality = next((m for m, signs in modalities.items() if p.sign in signs), "cardinal")

        return PlanetResponse(
            name=p.name,
            longitude=round(p.longitude, 4),
            sign=p.sign,
            sign_degree=p.sign_degree,
            sign_minute=p.sign_minute,
            house=p.house,
            retrograde=p.retrograde,
            nakshatra=p.nakshatra,
            pada=p.pada,
            dignity=p.dignity,
            speed=round(p.speed, 6),
            element=element,
            modality=modality
        )

    def _house_to_response(h):
        rulerships = {
            "Aries": "Mars", "Taurus": "Venus", "Gemini": "Mercury",
            "Cancer": "Moon", "Leo": "Sun", "Virgo": "Mercury",
            "Libra": "Venus", "Scorpio": "Mars", "Sagittarius": "Jupiter",
            "Capricorn": "Saturn", "Aquarius": "Saturn", "Pisces": "Jupiter"
        }
        return HouseResponse(
            house_number=h.house_number,
            longitude=round(h.longitude, 4),
            sign=h.sign,
            sign_degree=h.sign_degree,
            sign_minute=h.sign_minute,
            ruler=rulerships.get(h.sign, "Unknown")
        )

    planets = [_planet_to_response(p) for p in chart_data.planets]
    houses = [_house_to_response(h) for h in chart_data.houses]

    # Calculate strengths
    strengths = {}
    for p in planets:
        score = 0.0
        if p.dignity in ["domicile", "exaltation"]:
            score += 5.0
        elif p.dignity == "peregrine":
            score += 2.5
        else:
            score += 1.0

        if p.house in [1, 4, 7, 10]:
            score += 3.0
        elif p.house in [2, 5, 8, 11]:
            score += 1.5

        aspect_count = sum(1 for a in chart_data.aspects 
                          if a["planet1"] == p.name or a["planet2"] == p.name)
        score += min(aspect_count * 0.3, 2.0)

        if p.retrograde:
            score -= 0.5

        strengths[p.name] = round(score, 2)

    return ChartResponse(
        name=chart_data.name,
        birth_date=chart_data.birth_date,
        birth_time=chart_data.birth_time,
        location={
            "latitude": chart_data.location.latitude,
            "longitude": chart_data.location.longitude,
            "timezone_offset": chart_data.location.timezone_offset
        },
        julian_day=round(chart_data.julian_day, 6),
        ascendant=houses[0],
        mc=houses[9],
        ic=houses[3],
        descendant=houses[6],
        houses=houses,
        planets=planets,
        aspects=[AspectResponse(**a) for a in chart_data.aspects],
        element_balance=chart_data.element_balance,
        modality_balance=chart_data.modality_balance,
        chart_patterns=chart_data.chart_patterns,
        strengths=strengths,
        sect=getattr(chart_data, "sect", "Diurnal (Day Chart)"),
        ascendant_ruler=getattr(chart_data, "ascendant_ruler", "Sun"),
        benefic_of_sect=getattr(chart_data, "benefic_of_sect", "Jupiter"),
        malefic_of_sect=getattr(chart_data, "malefic_of_sect", "Saturn"),
        part_of_fortune=getattr(chart_data, "part_of_fortune", None),
        part_of_spirit=getattr(chart_data, "part_of_spirit", None)
    )


static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.exists(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")


@app.get("/", tags=["UI"])
@app.get("/chart", tags=["UI"])
async def root():
    """Serve observatory workstation UI."""
    index_file = os.path.join(static_dir, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file)
    return {
        "name": "Placidus AI Astrological Platform",
        "version": "1.0.0",
        "status": "operational",
        "documentation": "/api/docs"
    }


@app.get("/health", response_model=HealthCheck, tags=["Health"])
async def health_check():
    """Comprehensive health check endpoint."""
    services = {
        "chart_engine": "healthy",
        "api_gateway": "healthy",
        "rag_system": "healthy" if rag_retriever else "unavailable"
    }

    return HealthCheck(
        status="healthy",
        version="1.0.0",
        services=services
    )


@app.post("/api/v1/chart/generate", response_model=ChartResponse, tags=["Charts"])
async def generate_chart(request: BirthDataRequest):
    """
    Generate a complete Placidus natal chart from birth data.

    Returns planetary positions, house cusps, aspects, element/modality analysis,
    and detected chart patterns.
    """
    try:
        # Parse datetime
        date_parts = request.date_of_birth.split("-")
        time_parts = request.time_of_birth.split(":")

        birth_datetime = datetime(
            int(date_parts[0]), int(date_parts[1]), int(date_parts[2]),
            int(time_parts[0]), int(time_parts[1]),
            int(time_parts[2]) if len(time_parts) > 2 else 0
        )

        geo = GeoLocation(
            latitude=request.latitude,
            longitude=request.longitude,
            timezone_offset=request.timezone_offset
        )

        chart_data = chart_engine.generate_chart(
            name=request.name,
            birth_datetime=birth_datetime,
            geo=geo
        )

        return _chart_to_response(chart_data)

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid birth data: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Chart calculation error: {str(e)}"
        )


@app.post("/api/v1/chat", response_model=ChatResponse, tags=["AI Assistant"])
async def chat(request: ChatRequest):
    """
    AI Astrology Assistant endpoint.

    Accepts a natural language question and optional chart data.
    Returns intelligent interpretations with citations from the knowledge base.

    Response modes: auto, table, detailed, report, summary, comparison, cards
    """
    try:
        agent = AstrologyAgent(
            chart_data=request.chart_data,
            rag_retriever=rag_retriever,
            llm_client=get_llm_client()
        )

        response = agent.process(
            message=request.message,
            response_mode=request.response_mode
        )

        return response

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"AI processing error: {str(e)}"
        )


@app.post("/api/v1/chart/planet/{planet_name}", response_model=PlanetResponse, tags=["Charts"])
async def get_planet(planet_name: str, chart: ChartResponse):
    """Get specific planet data from a chart."""
    for p in chart.planets:
        if p.name.lower() == planet_name.lower():
            return p
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Planet {planet_name} not found in chart"
    )


@app.post("/api/v1/chart/aspects", response_model=List[AspectResponse], tags=["Charts"])
async def get_aspects(chart: ChartResponse, planet: Optional[str] = None):
    """Get aspects, optionally filtered by planet."""
    if planet:
        return [a for a in chart.aspects 
                if a.planet1.lower() == planet.lower() or a.planet2.lower() == planet.lower()]
    return chart.aspects


@app.post("/api/v1/chart/strengths", tags=["Charts"])
async def get_strengths(chart: ChartResponse):
    """Get ranked planetary strengths."""
    ranked = sorted(chart.strengths.items(), key=lambda x: x[1], reverse=True)
    return {
        "rankings": [{"planet": p, "strength": s} for p, s in ranked],
        "dominant_element": max(chart.element_balance.items(), key=lambda x: x[1]),
        "dominant_modality": max(chart.modality_balance.items(), key=lambda x: x[1]),
        "patterns": chart.chart_patterns
    }


# ─── Geolocation & Timezone (Placidus AI Auto-Detection) ─────────────────────────

@app.get("/api/geocode", tags=["Geocoding"])
async def geocode_endpoint(q: str = ""):
    """Search cities and auto-detect coordinates."""
    results = await geocode_query(q)
    return {"success": True, "results": results}


@app.get("/api/timezone", tags=["Geocoding"])
async def timezone_endpoint(lat: float, lon: float):
    """Auto-detect timezone offset for given coordinates."""
    offset = await detect_timezone(lat, lon)
    return {"success": True, "offset": offset}


# ─── Placidus AI Compatible Endpoints ──────────────────────────────────────────

@app.post("/api/calculate-chart", tags=["Charts"])
async def calculate_chart_compat(payload: dict):
    """Compatibility endpoint accepting Placidus AI frontend requests."""
    birth_date = payload.get("birthDate") or payload.get("date_of_birth")
    if not birth_date:
        raise HTTPException(status_code=400, detail="birthDate is required")

    birth_time = payload.get("birthTime") or payload.get("time_of_birth") or "12:00"
    lat = float(payload.get("latitude") if payload.get("latitude") is not None else payload.get("lat") or 28.6139)
    lon = float(payload.get("longitude") if payload.get("longitude") is not None else payload.get("lon") or 77.2090)
    city = payload.get("cityName") or payload.get("city") or "Selected Location"
    tz = float(payload.get("timezoneOffset") if payload.get("timezoneOffset") is not None else payload.get("timezone_offset") or 0.0)

    req = BirthDataRequest(
        name=payload.get("name") or "Seeker",
        date_of_birth=birth_date,
        time_of_birth=birth_time,
        city=city,
        country=payload.get("country") or "",
        latitude=lat,
        longitude=lon,
        timezone_offset=tz
    )
    chart = await generate_chart(req)
    return {"success": True, "chartData": chart}


@app.post("/api/ai-astrologer", tags=["AI Assistant"])
async def ai_astrologer_compat(payload: dict):
    """Compatibility endpoint for Placidus AI chat."""
    prompt = payload.get("prompt") or payload.get("message") or "Analyze my Ascendant Ruler and Sect."
    chart_data = payload.get("chartData") or payload.get("chart_data")
    history = payload.get("history") or []

    req = ChatRequest(
        message=prompt,
        chart_data=chart_data,
        history=history,
        response_mode=payload.get("response_mode", "auto")
    )
    resp = await chat(req)
    return {
        "success": True,
        "response": resp.message,
        "mode": resp.response_mode,
        "citations": [c.model_dump() for c in resp.citations],
        "tools_used": resp.tools_used
    }


# Error handlers
@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.detail, "status_code": exc.status_code}
    )

@app.exception_handler(Exception)
async def general_exception_handler(request, exc):
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error", "detail": str(exc)}
    )
