"""
Geographic Geocoding and Timezone Detection Service
Provides city search, coordinates resolution, and timezone offset estimation.
"""
import math
from typing import List, Dict, Any, Optional
import httpx

POPULAR_CITIES = [
    {"city": "New Delhi", "fullName": "New Delhi, Delhi, India", "country": "India", "lat": 28.6139, "lon": 77.2090, "tz": 5.5},
    {"city": "Mumbai", "fullName": "Mumbai, Maharashtra, India", "country": "India", "lat": 19.0760, "lon": 72.8777, "tz": 5.5},
    {"city": "Bengaluru", "fullName": "Bengaluru, Karnataka, India", "country": "India", "lat": 12.9716, "lon": 77.5946, "tz": 5.5},
    {"city": "London", "fullName": "London, Greater London, United Kingdom", "country": "United Kingdom", "lat": 51.5074, "lon": -0.1278, "tz": 0.0},
    {"city": "New York", "fullName": "New York, NY, United States", "country": "United States", "lat": 40.7128, "lon": -74.0060, "tz": -5.0},
    {"city": "Los Angeles", "fullName": "Los Angeles, CA, United States", "country": "United States", "lat": 34.0522, "lon": -118.2437, "tz": -8.0},
    {"city": "Chicago", "fullName": "Chicago, IL, United States", "country": "United States", "lat": 41.8781, "lon": -87.6298, "tz": -6.0},
    {"city": "Toronto", "fullName": "Toronto, Ontario, Canada", "country": "Canada", "lat": 43.6532, "lon": -79.3832, "tz": -5.0},
    {"city": "Paris", "fullName": "Paris, Île-de-France, France", "country": "France", "lat": 48.8566, "lon": 2.3522, "tz": 1.0},
    {"city": "Berlin", "fullName": "Berlin, Germany", "country": "Germany", "lat": 52.5200, "lon": 13.4050, "tz": 1.0},
    {"city": "Tokyo", "fullName": "Tokyo, Japan", "country": "Japan", "lat": 35.6762, "lon": 139.6503, "tz": 9.0},
    {"city": "Sydney", "fullName": "Sydney, NSW, Australia", "country": "Australia", "lat": -33.8688, "lon": 151.2093, "tz": 10.0},
    {"city": "Melbourne", "fullName": "Melbourne, Victoria, Australia", "country": "Australia", "lat": -37.8136, "lon": 144.9631, "tz": 10.0},
    {"city": "Dubai", "fullName": "Dubai, United Arab Emirates", "country": "United Arab Emirates", "lat": 25.2048, "lon": 55.2708, "tz": 4.0},
    {"city": "Singapore", "fullName": "Singapore", "country": "Singapore", "lat": 1.3521, "lon": 103.8198, "tz": 8.0},
    {"city": "Hong Kong", "fullName": "Hong Kong", "country": "Hong Kong", "lat": 22.3193, "lon": 114.1694, "tz": 8.0},
    {"city": "São Paulo", "fullName": "São Paulo, Brazil", "country": "Brazil", "lat": -23.5505, "lon": -46.6333, "tz": -3.0},
    {"city": "Cairo", "fullName": "Cairo, Egypt", "country": "Egypt", "lat": 30.0444, "lon": 31.2357, "tz": 2.0},
    {"city": "Istanbul", "fullName": "Istanbul, Turkey", "country": "Turkey", "lat": 41.0082, "lon": 28.9784, "tz": 3.0},
    {"city": "Hapur", "fullName": "Hapur, Uttar Pradesh, India", "country": "India", "lat": 28.7307, "lon": 77.7787, "tz": 5.5},
    {"city": "Athens", "fullName": "Athens, Attica, Greece", "country": "Greece", "lat": 37.9838, "lon": 23.7275, "tz": 2.0},
    {"city": "Rome", "fullName": "Rome, Lazio, Italy", "country": "Italy", "lat": 41.9028, "lon": 12.4964, "tz": 1.0},
    {"city": "Alexandria", "fullName": "Alexandria, Egypt", "country": "Egypt", "lat": 31.2001, "lon": 29.9187, "tz": 2.0},
]


def estimate_fallback_offset(lon: float) -> float:
    """Approximate UTC offset from longitude."""
    return round(lon / 15.0 * 2.0) / 2.0


async def detect_timezone(lat: float, lon: float) -> float:
    """
    Detect UTC timezone offset for given coordinates.
    Checks major national borders first, then online API with longitude fallback.
    """
    # India, Pakistan, Nepal, Bangladesh political borders check
    if 6.0 <= lat <= 36.0 and 68.0 <= lon <= 97.0:
        return 5.5

    # Nepal
    if 26.0 <= lat <= 31.0 and 80.0 <= lon <= 89.0 and lon > 84.0 and lat > 27.5:
        return 5.75

    # Sri Lanka
    if 5.5 <= lat <= 10.0 and 79.5 <= lon <= 82.0:
        return 5.5

    try:
        url = f"https://timeapi.io/api/timezone/coordinate?latitude={lat}&longitude={lon}"
        async with httpx.AsyncClient(timeout=2.5) as client:
            resp = await client.get(url, headers={"User-Agent": "PlacidusAI/1.0"})
            if resp.status_code == 200:
                data = resp.json()
                if "currentUtcOffset" in data and isinstance(data["currentUtcOffset"].get("seconds"), (int, float)):
                    return data["currentUtcOffset"]["seconds"] / 3600.0
    except Exception:
        pass

    return estimate_fallback_offset(lon)


async def geocode_query(query: str) -> List[Dict[str, Any]]:
    """
    Geocode search for city/region name.
    Merges local instant matches with Nominatim OpenStreetMap results.
    """
    q = (query or "").strip().lower()
    if not q:
        return POPULAR_CITIES[:10]

    # Check local database first
    local_matches = [
        c for c in POPULAR_CITIES
        if q in c["city"].lower() or q in c["fullName"].lower() or q in c["country"].lower()
    ]

    # Query Nominatim
    results = list(local_matches)
    try:
        url = f"https://nominatim.openstreetmap.org/search?format=json&q={httpx.URL(q)}&limit=6&addressdetails=1"
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(url, headers={"User-Agent": "PlacidusAI-Observatory/1.0"})
            if resp.status_code == 200:
                data = resp.json()
                for item in data:
                    lat = float(item["lat"])
                    lon = float(item["lon"])
                    display_name = item.get("display_name", "")
                    parts = [p.strip() for p in display_name.split(",")]
                    city_name = parts[0] if parts else q.title()
                    country_name = parts[-1] if len(parts) > 1 else ""

                    # Avoid duplicate coordinates
                    if not any(abs(r["lat"] - lat) < 0.05 and abs(r["lon"] - lon) < 0.05 for r in results):
                        results.append({
                            "city": city_name,
                            "fullName": display_name,
                            "country": country_name,
                            "lat": lat,
                            "lon": lon,
                            "tz": estimate_fallback_offset(lon)
                        })
    except Exception:
        pass

    if not results:
        # Fallback default
        results.append({
            "city": query.title(),
            "fullName": f"{query.title()} (Estimated Coordinates)",
            "country": "",
            "lat": 28.6139,
            "lon": 77.2090,
            "tz": 5.5
        })

    return results[:8]
