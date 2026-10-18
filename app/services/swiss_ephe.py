"""
Swiss Ephemeris Integration Wrapper
Provides high-precision planetary calculations using pyswisseph.
Drop-in replacement for the fallback astronomical math methods.
"""
import os
from typing import Optional, Tuple
from datetime import datetime

try:
    import swisseph as swe
    SWISSEPH_AVAILABLE = True
except ImportError:
    SWISSEPH_AVAILABLE = False

from app.core.config import get_settings


class SwissEphemeris:
    """
    High-precision astronomical calculations using Swiss Ephemeris.
    Requires pyswisseph and ephemeris data files.
    """

    PLANET_MAP = {
        "Sun": swe.SUN,
        "Moon": swe.MOON,
        "Mercury": swe.MERCURY,
        "Venus": swe.VENUS,
        "Mars": swe.MARS,
        "Jupiter": swe.JUPITER,
        "Saturn": swe.SATURN,
        "Uranus": swe.URANUS,
        "Neptune": swe.NEPTUNE,
        "Pluto": swe.PLUTO,
        "Chiron": swe.CHIRON,
        "North Node": swe.MEAN_NODE,
        "Lilith": swe.MEAN_APOG,
    }

    def __init__(self, ephe_path: Optional[str] = None):
        if not SWISSEPH_AVAILABLE:
            raise ImportError(
                "pyswisseph not installed. "
                "Install with: pip install pyswisseph"
            )

        settings = get_settings()
        self.ephe_path = ephe_path or settings.EPHE_PATH or "data/ephemeris"

        if os.path.exists(self.ephe_path):
            swe.set_ephe_path(self.ephe_path)
        else:
            # Use built-in Moshier ephemeris (lower precision but no files needed)
            swe.set_jpl_file("de431.eph")  # Will fall back to Moshier if not found

    def calculate_planet(self, planet_name: str, julian_day: float) -> dict:
        """
        Calculate precise planet position using Swiss Ephemeris.

        Returns dict with:
        - longitude: ecliptic longitude (0-360)
        - latitude: ecliptic latitude
        - distance: AU from Earth
        - speed: degrees per day
        - retrograde: boolean
        """
        swe_planet = self.PLANET_MAP.get(planet_name)
        if swe_planet is None:
            raise ValueError(f"Unknown planet: {planet_name}")

        # Calculate using Swiss Ephemeris
        result = swe.calc_ut(julian_day, swe_planet, swe.FLG_EQUATORIAL)

        longitude = result[0][0]  # Longitude
        latitude = result[0][1]   # Latitude
        distance = result[0][2]   # Distance in AU
        speed_long = result[0][3] # Speed in longitude (deg/day)

        return {
            "longitude": longitude,
            "latitude": latitude,
            "distance": distance,
            "speed": speed_long,
            "retrograde": speed_long < 0
        }

    def calculate_houses(self, julian_day: float, latitude: float, 
                         longitude: float, house_system: bytes = b'P') -> list:
        """
        Calculate house cusps using Swiss Ephemeris.

        Args:
            house_system: b'P' = Placidus (default), b'K' = Koch, b'O' = Porphyry, etc.

        Returns list of 12 cusp longitudes.
        """
        houses = swe.houses_ex(julian_day, latitude, longitude, house_system)
        return [houses[1][i] for i in range(12)]

    def get_planet_name(self, swe_id: int) -> str:
        """Get human-readable planet name from Swiss Ephemeris ID."""
        reverse_map = {v: k for k, v in self.PLANET_MAP.items()}
        return reverse_map.get(swe_id, f"Body_{swe_id}")

    @staticmethod
    def julian_day(year: int, month: int, day: int, hour: float = 0.0) -> float:
        """Calculate Julian Day using Swiss Ephemeris."""
        return swe.julday(year, month, day, hour)

    @staticmethod
    def get_available_house_systems() -> dict:
        """Return available house systems."""
        return {
            b'P': "Placidus",
            b'K': "Koch",
            b'O': "Porphyrius",
            b'R': "Regiomontanus",
            b'C': "Campanus",
            b'E': "Equal",
            b'W': "Whole Sign",
        }


def check_ephemeris_files(path: str) -> bool:
    """Check if Swiss Ephemeris data files are available."""
    required_files = [
        "sepl_18.se1",  # Planets
        "semo_18.se1",  # Moon
        "seas_18.se1",  # Asteroids
    ]
    return all(os.path.exists(os.path.join(path, f)) for f in required_files)
