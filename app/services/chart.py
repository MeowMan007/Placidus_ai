"""
Natal Chart Service
High-level service for generating complete Placidus natal charts.
"""
from typing import List, Dict, Optional, Any
from dataclasses import dataclass, asdict
from datetime import datetime
import math

from app.services.astro_math import (
    AstronomicalMath, GeoLocation, PlanetPosition, 
    HouseCusp, DEG_TO_RAD
)


@dataclass
class ChartData:
    """Complete natal chart data structure."""
    name: str
    birth_date: str
    birth_time: str
    location: GeoLocation
    julian_day: float
    local_sidereal_time: float
    ascendant: HouseCusp
    mc: HouseCusp
    ic: HouseCusp
    descendant: HouseCusp
    houses: List[HouseCusp]
    planets: List[PlanetPosition]
    aspects: List[Dict]
    element_balance: Dict[str, int]
    modality_balance: Dict[str, int]
    chart_patterns: List[str]
    sect: str = "Diurnal"
    ascendant_ruler: str = "Sun"
    benefic_of_sect: str = "Jupiter"
    malefic_of_sect: str = "Saturn"
    part_of_fortune: Optional[Dict[str, Any]] = None
    part_of_spirit: Optional[Dict[str, Any]] = None


class ChartEngine:
    """
    Main engine for generating Placidus natal charts.
    """

    PLANET_ORDER = [
        "Sun", "Moon", "Mercury", "Venus", "Mars",
        "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto",
        "Chiron", "North Node", "South Node", "Lilith", "Fortune"
    ]

    ELEMENTS = {
        "fire": ["Aries", "Leo", "Sagittarius"],
        "earth": ["Taurus", "Virgo", "Capricorn"],
        "air": ["Gemini", "Libra", "Aquarius"],
        "water": ["Cancer", "Scorpio", "Pisces"]
    }

    MODALITIES = {
        "cardinal": ["Aries", "Cancer", "Libra", "Capricorn"],
        "fixed": ["Taurus", "Leo", "Scorpio", "Aquarius"],
        "mutable": ["Gemini", "Virgo", "Sagittarius", "Pisces"]
    }

    def __init__(self):
        self.math = AstronomicalMath()

    def generate_chart(self, name: str, birth_datetime: datetime, 
                       geo: GeoLocation) -> ChartData:
        """
        Generate a complete natal chart.

        Args:
            name: Person's name
            birth_datetime: Local birth datetime (naive, assumed to be local time)
            geo: Geographic location with timezone

        Returns:
            Complete ChartData object
        """
        # Convert local time to UT
        ut_hour = birth_datetime.hour + birth_datetime.minute/60.0 + birth_datetime.second/3600.0
        ut_hour -= geo.timezone_offset

        # Julian Day in UT
        jd = self.math.julian_day(
            birth_datetime.year, birth_datetime.month, birth_datetime.day, ut_hour
        )

        # Local Sidereal Time
        lst = self.math.sidereal_time(jd, geo.longitude)

        # House cusps (Placidus)
        cusp_longitudes = self.math.placidus_house_cusps(lst, geo.latitude)

        houses = []
        for i, long in enumerate(cusp_longitudes):
            sign, deg, minute = self.math.longitude_to_sign(long)
            houses.append(HouseCusp(
                house_number=i+1,
                longitude=long,
                sign=sign,
                sign_degree=deg,
                sign_minute=minute
            ))

        # Calculate planets
        planets = []
        for planet_name in self.PLANET_ORDER[:10]:  # Classical + modern
            planet = self.math.calculate_planet(planet_name, jd, geo)
            planets.append(planet)

        # Add North Node (simplified calculation)
        moon = next(p for p in planets if p.name == "Moon")
        sun = next(p for p in planets if p.name == "Sun")
        # Mean node approximation: opposite of Moon's ascending node
        node_long = (moon.longitude - 180.0) % 360.0  # Simplified
        sign, deg, minute = self.math.longitude_to_sign(node_long)
        nakshatra, pada = self.math.get_nakshatra(node_long)
        planets.append(PlanetPosition(
            name="North Node", longitude=node_long, latitude=0.0,
            distance=1.0, speed=0.05, retrograde=True,
            sign=sign, sign_degree=deg, sign_minute=minute,
            house=0, nakshatra=nakshatra, pada=pada, dignity="peregrine"
        ))

        # South Node
        south_long = (node_long + 180.0) % 360.0
        sign, deg, minute = self.math.longitude_to_sign(south_long)
        nakshatra, pada = self.math.get_nakshatra(south_long)
        planets.append(PlanetPosition(
            name="South Node", longitude=south_long, latitude=0.0,
            distance=1.0, speed=0.05, retrograde=True,
            sign=sign, sign_degree=deg, sign_minute=minute,
            house=0, nakshatra=nakshatra, pada=pada, dignity="peregrine"
        ))

        # Assign houses
        self.math.assign_houses(planets, cusp_longitudes)

        # Calculate aspects
        aspects = self.math.calculate_aspects(planets)

        # Element and modality analysis
        element_balance = self._calculate_elements(planets)
        modality_balance = self._calculate_modalities(planets)

        # Detect chart patterns
        patterns = self._detect_patterns(planets, aspects, cusp_longitudes)

        # Hellenistic Sect & Lord of Chart
        is_diurnal = sun.house in [7, 8, 9, 10, 11, 12]
        sect = "Diurnal (Day Chart)" if is_diurnal else "Nocturnal (Night Chart)"
        asc_sign = houses[0].sign
        asc_ruler = {
            "Aries": "Mars", "Taurus": "Venus", "Gemini": "Mercury",
            "Cancer": "Moon", "Leo": "Sun", "Virgo": "Mercury",
            "Libra": "Venus", "Scorpio": "Mars", "Sagittarius": "Jupiter",
            "Capricorn": "Saturn", "Aquarius": "Saturn", "Pisces": "Jupiter"
        }.get(asc_sign, "Mercury")

        benefic_of_sect = "Jupiter" if is_diurnal else "Venus"
        malefic_of_sect = "Saturn" if is_diurnal else "Mars"

        # Lots (Fortune & Spirit)
        asc_lon = houses[0].longitude
        sun_lon = sun.longitude
        moon_lon = moon.longitude

        if is_diurnal:
            fortune_lon = (asc_lon + moon_lon - sun_lon) % 360.0
            spirit_lon = (asc_lon + sun_lon - moon_lon) % 360.0
        else:
            fortune_lon = (asc_lon + sun_lon - moon_lon) % 360.0
            spirit_lon = (asc_lon + moon_lon - sun_lon) % 360.0

        f_sign, f_deg, f_min = self.math.longitude_to_sign(fortune_lon)
        s_sign, s_deg, s_min = self.math.longitude_to_sign(spirit_lon)

        part_of_fortune = {
            "name": "Part of Fortune",
            "longitude": round(fortune_lon, 4),
            "sign": f_sign,
            "degree": f_deg,
            "minute": f_min,
            "formatted": f"{f_deg}° {f_sign} {f_min:02d}'"
        }
        part_of_spirit = {
            "name": "Part of Spirit",
            "longitude": round(spirit_lon, 4),
            "sign": s_sign,
            "degree": s_deg,
            "minute": s_min,
            "formatted": f"{s_deg}° {s_sign} {s_min:02d}'"
        }

        return ChartData(
            name=name,
            birth_date=birth_datetime.strftime("%Y-%m-%d"),
            birth_time=birth_datetime.strftime("%H:%M:%S"),
            location=geo,
            julian_day=jd,
            local_sidereal_time=lst,
            ascendant=houses[0],
            mc=houses[9],
            ic=houses[3],
            descendant=houses[6],
            houses=houses,
            planets=planets,
            aspects=aspects,
            element_balance=element_balance,
            modality_balance=modality_balance,
            chart_patterns=patterns,
            sect=sect,
            ascendant_ruler=asc_ruler,
            benefic_of_sect=benefic_of_sect,
            malefic_of_sect=malefic_of_sect,
            part_of_fortune=part_of_fortune,
            part_of_spirit=part_of_spirit
        )

    def _calculate_elements(self, planets: List[PlanetPosition]) -> Dict[str, int]:
        """Count planets in each element."""
        counts = {"fire": 0, "earth": 0, "air": 0, "water": 0}
        for p in planets:
            for elem, signs in self.ELEMENTS.items():
                if p.sign in signs:
                    counts[elem] += 1
                    break
        return counts

    def _calculate_modalities(self, planets: List[PlanetPosition]) -> Dict[str, int]:
        """Count planets in each modality."""
        counts = {"cardinal": 0, "fixed": 0, "mutable": 0}
        for p in planets:
            for mod, signs in self.MODALITIES.items():
                if p.sign in signs:
                    counts[mod] += 1
                    break
        return counts

    def _detect_patterns(self, planets: List[PlanetPosition], 
                        aspects: List[Dict], cusps: List[float]) -> List[str]:
        """Detect major chart patterns (stelliums, T-squares, grand trines, etc.)."""
        patterns = []

        # Check for stelliums (3+ planets in same sign)
        sign_counts = {}
        for p in planets:
            sign_counts[p.sign] = sign_counts.get(p.sign, 0) + 1

        for sign, count in sign_counts.items():
            if count >= 3:
                patterns.append(f"Stellium in {sign} ({count} planets)")

        # Check for stelliums in houses
        house_counts = {}
        for p in planets:
            house_counts[p.house] = house_counts.get(p.house, 0) + 1

        for house, count in house_counts.items():
            if count >= 3:
                patterns.append(f"Stellium in {house}th House ({count} planets)")

        # Check for grand trines (simplified - would need full aspect graph)
        # Check for T-squares
        oppositions = [a for a in aspects if a["aspect"] == "opposition"]
        squares = [a for a in aspects if a["aspect"] == "square"]

        for opp in oppositions:
            p1, p2 = opp["planet1"], opp["planet2"]
            # Look for planet squaring both
            for sq in squares:
                if (sq["planet1"] == p1 and sq["planet2"] not in [p1, p2]) or                    (sq["planet1"] == p2 and sq["planet2"] not in [p1, p2]):
                    apex = sq["planet2"]
                    # Check if apex also squares the other opposition planet
                    for sq2 in squares:
                        if sq2["planet1"] == apex and sq2["planet2"] == (p2 if sq["planet1"] == p1 else p1):
                            patterns.append(f"T-square: {p1} opp {p2}, apex {apex}")

        return patterns

    def get_planet_by_name(self, chart: ChartData, name: str) -> Optional[PlanetPosition]:
        """Retrieve a specific planet from the chart."""
        for p in chart.planets:
            if p.name.lower() == name.lower():
                return p
        return None

    def get_house_ruler(self, chart: ChartData, house_number: int) -> Optional[str]:
        """Get the traditional ruler of a house based on its cusp sign."""
        house = chart.houses[house_number - 1]
        sign = house.sign

        rulerships = {
            "Aries": "Mars", "Taurus": "Venus", "Gemini": "Mercury",
            "Cancer": "Moon", "Leo": "Sun", "Virgo": "Mercury",
            "Libra": "Venus", "Scorpio": "Mars", "Sagittarius": "Jupiter",
            "Capricorn": "Saturn", "Aquarius": "Saturn", "Pisces": "Jupiter"
        }
        return rulerships.get(sign)
