"""
Pydantic models for request/response validation and serialization.
"""
from pydantic import BaseModel, Field, validator
from typing import List, Dict, Optional, Any
from datetime import datetime


class BirthDataRequest(BaseModel):
    """Request model for natal chart generation."""
    name: Optional[str] = Field(default="Seeker", max_length=100, description="Person's full name")
    date_of_birth: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$", description="YYYY-MM-DD")
    time_of_birth: Optional[str] = Field(default="12:00", description="HH:MM or HH:MM:SS")
    city: Optional[str] = Field(default="Location", description="Birth city name")
    country: Optional[str] = Field(default="", description="Birth country name")
    latitude: float = Field(default=0.0, ge=-90, le=90, description="Decimal latitude")
    longitude: float = Field(default=0.0, ge=-180, le=180, description="Decimal longitude")
    timezone_offset: float = Field(default=0.0, ge=-14, le=14, description="Hours from UTC")

    class Config:
        json_schema_extra = {
            "example": {
                "name": "Jane Doe",
                "date_of_birth": "1990-06-15",
                "time_of_birth": "14:30",
                "city": "New York",
                "country": "USA",
                "latitude": 40.7128,
                "longitude": -74.0060,
                "timezone_offset": -5.0
            }
        }


class PlanetResponse(BaseModel):
    """Planet position response."""
    name: str
    longitude: float
    sign: str
    sign_degree: float = 0.0
    sign_minute: int = 0
    house: int = 1
    retrograde: bool = False
    nakshatra: Optional[str] = ""
    pada: Optional[int] = 1
    dignity: Optional[str] = "peregrine"
    speed: Optional[float] = 0.0
    element: Optional[str] = "fire"
    modality: Optional[str] = "cardinal"


class HouseResponse(BaseModel):
    """House cusp response."""
    house_number: int
    longitude: float
    sign: str
    sign_degree: float = 0.0
    sign_minute: int = 0
    ruler: Optional[str] = "Unknown"


class AspectResponse(BaseModel):
    """Aspect response."""
    planet1: str
    planet2: str
    aspect: str
    angle: float
    orb: float
    applying: bool = False


class ChartResponse(BaseModel):
    """Complete natal chart response."""
    name: str = "Seeker"
    birth_date: str = ""
    birth_time: str = ""
    location: Dict[str, Any] = {}
    julian_day: Optional[float] = 0.0
    ascendant: Optional[HouseResponse] = None
    mc: Optional[HouseResponse] = None
    ic: Optional[HouseResponse] = None
    descendant: Optional[HouseResponse] = None
    houses: List[HouseResponse] = []
    planets: List[PlanetResponse] = []
    aspects: List[AspectResponse] = []
    element_balance: Dict[str, int] = {}
    modality_balance: Dict[str, int] = {}
    chart_patterns: List[str] = []
    strengths: Dict[str, float] = {}
    sect: Optional[str] = "Diurnal (Day Chart)"
    ascendant_ruler: Optional[str] = None
    benefic_of_sect: Optional[str] = None
    malefic_of_sect: Optional[str] = None
    part_of_fortune: Optional[Dict[str, Any]] = None
    part_of_spirit: Optional[Dict[str, Any]] = None


class ChatMessage(BaseModel):
    """Single chat message."""
    role: str = Field(..., pattern="^(user|assistant|system)$")
    content: str
    timestamp: Optional[datetime] = None


class ChatRequest(BaseModel):
    """Request for AI astrology chat."""
    message: str = Field(..., min_length=1, max_length=4000)
    chart_data: Optional[Any] = None
    conversation_id: Optional[str] = None
    response_mode: Optional[str] = "auto"
    history: Optional[List[Dict[str, Any]]] = None


class Citation(BaseModel):
    """Source citation for RAG retrieval."""
    text: str
    source: str
    chapter: str
    page: int
    score: float


class ChatResponse(BaseModel):
    """Response from AI astrology assistant."""
    message: str
    response_mode: str
    citations: List[Citation]
    tools_used: List[str]
    chart_insights: Optional[Dict[str, Any]] = None
    confidence: float = Field(..., ge=0.0, le=1.0)


class PlanetQueryRequest(BaseModel):
    """Request for specific planet interpretation."""
    planet_name: str
    chart_data: ChartResponse
    include_transits: bool = False


class ComparisonRequest(BaseModel):
    """Request to compare two chart factors."""
    factor1: str
    factor2: str
    chart_data: ChartResponse


class HealthCheck(BaseModel):
    """Health check response."""
    status: str
    version: str
    services: Dict[str, str]
