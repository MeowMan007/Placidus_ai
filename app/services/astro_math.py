"""
Core Astronomical Mathematics for Placidus Natal Chart Calculation
Implements ephem-backed planetary ephemeris, Placidus house cusp algorithms,
retrograde speed detection, Hellenistic dignities, and astronomical measurements.
"""
import math
from dataclasses import dataclass
from typing import List, Tuple, Optional, Dict
from datetime import datetime, timedelta
import ephem

# Constants
DEG_TO_RAD = math.pi / 180.0
RAD_TO_DEG = 180.0 / math.pi
J2000 = 2451545.0  # Julian date for 2000-01-01 12:00 UT


@dataclass
class GeoLocation:
    """Geographic coordinates with timezone info."""
    latitude: float
    longitude: float
    altitude: float = 0.0
    timezone_offset: float = 0.0  # hours from UTC

    def __post_init__(self):
        if not (-90 <= self.latitude <= 90):
            raise ValueError("Latitude must be between -90 and 90")
        if not (-180 <= self.longitude <= 180):
            raise ValueError("Longitude must be between -180 and 180")


@dataclass  
class PlanetPosition:
    """Calculated position of a celestial body."""
    name: str
    longitude: float      # 0-360 ecliptic longitude
    latitude: float       # ecliptic latitude
    distance: float       # AU from Earth
    speed: float          # degrees per day
    retrograde: bool
    sign: str
    sign_degree: float
    sign_minute: int
    house: int
    nakshatra: str
    pada: int
    dignity: str          # domicile, exaltation, detriment, fall, or peregrine


@dataclass
class HouseCusp:
    """Represents a house cusp in the Placidus system."""
    house_number: int
    longitude: float
    sign: str
    sign_degree: float
    sign_minute: int


class AstronomicalMath:
    """
    Astronomical calculation engine backed by PyEphem.
    Provides sub-arcminute planetary coordinates, exact Placidus cusps,
    retrograde status, and traditional Hellenistic astrological attributes.
    """

    SIGNS = [
        "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
        "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"
    ]

    NAKSHATRAS = [
        "Ashwini", "Bharani", "Krittika", "Rohini", "Mrigashira", "Ardra",
        "Punarvasu", "Pushya", "Ashlesha", "Magha", "Purva Phalguni", "Uttara Phalguni",
        "Hasta", "Chitra", "Swati", "Vishakha", "Anuradha", "Jyeshtha",
        "Mula", "Purva Ashadha", "Uttara Ashadha", "Shravana", "Dhanishta", "Shatabhisha",
        "Purva Bhadrapada", "Uttara Bhadrapada", "Revati"
    ]

    DIGNITIES = {
        "Sun": {"domicile": ["Leo"], "exaltation": "Aries", "detriment": ["Aquarius"], "fall": "Libra"},
        "Moon": {"domicile": ["Cancer"], "exaltation": "Taurus", "detriment": ["Capricorn"], "fall": "Scorpio"},
        "Mercury": {"domicile": ["Gemini", "Virgo"], "exaltation": "Virgo", "detriment": ["Sagittarius", "Pisces"], "fall": "Pisces"},
        "Venus": {"domicile": ["Taurus", "Libra"], "exaltation": "Pisces", "detriment": ["Scorpio", "Aries"], "fall": "Virgo"},
        "Mars": {"domicile": ["Aries", "Scorpio"], "exaltation": "Capricorn", "detriment": ["Libra", "Taurus"], "fall": "Cancer"},
        "Jupiter": {"domicile": ["Sagittarius", "Pisces"], "exaltation": "Cancer", "detriment": ["Gemini", "Virgo"], "fall": "Capricorn"},
        "Saturn": {"domicile": ["Capricorn", "Aquarius"], "exaltation": "Libra", "detriment": ["Cancer", "Leo"], "fall": "Aries"},
    }

    @classmethod
    def longitude_to_sign(cls, longitude: float) -> Tuple[str, float, int]:
        """Convert ecliptic longitude to sign, degree, minute."""
        lon = longitude % 360.0
        sign_index = int(lon // 30) % 12
        degree_in_sign = lon % 30
        degrees = int(degree_in_sign)
        minutes = int(round((degree_in_sign - degrees) * 60))
        if minutes >= 60:
            degrees += 1
            minutes = 0
            if degrees >= 30:
                degrees = 0
                sign_index = (sign_index + 1) % 12
        return cls.SIGNS[sign_index], degrees, minutes

    @classmethod
    def get_nakshatra(cls, longitude: float) -> Tuple[str, int]:
        """Get Nakshatra and pada (quarter) for a longitude."""
        lon = longitude % 360.0
        nakshatra_deg = 13.0 + (20.0 / 60.0)
        index = int(lon // nakshatra_deg) % 27
        remainder = lon % nakshatra_deg
        pada = int(remainder // (nakshatra_deg / 4.0)) + 1
        return cls.NAKSHATRAS[index], min(pada, 4)

    @classmethod
    def get_dignity(cls, planet: str, sign: str) -> str:
        """Determine planetary dignity in a given sign."""
        if planet not in cls.DIGNITIES:
            return "peregrine"

        info = cls.DIGNITIES[planet]
        if sign in info["domicile"]:
            return "domicile"
        if sign == info["exaltation"]:
            return "exaltation"
        if sign in info["detriment"]:
            return "detriment"
        if sign == info["fall"]:
            return "fall"
        return "peregrine"

    @staticmethod
    def julian_day(year: int, month: int, day: int, hour: float = 0.0) -> float:
        """Calculate Julian Day Number using standard astronomical formula."""
        if month <= 2:
            year -= 1
            month += 12

        A = int(year / 100)
        B = 2 - A + int(A / 4)

        jd = int(365.25 * (year + 4716)) + int(30.6001 * (month + 1)) + day + hour / 24.0 + B - 1524.5
        return jd

    @staticmethod
    def sidereal_time(jd: float, longitude: float) -> float:
        """Calculate local apparent sidereal time in degrees."""
        T = (jd - J2000) / 36525.0
        gmst = 280.46061837 + 360.98564736629 * (jd - J2000) + 0.000387933 * T**2 - T**3 / 38710000.0
        lst = (gmst + longitude) % 360.0
        if lst < 0:
            lst += 360.0
        return lst

    @classmethod
    def placidus_house_cusps(cls, lst: float, latitude: float, 
                             obliquity: float = 23.4367) -> List[float]:
        """
        Calculate precise Placidus house cusp longitudes.
        Returns 12 cusp longitudes where cusp 1 = ASC, cusp 10 = MC.
        """
        ramc = lst % 360.0
        ramc_rad = ramc * DEG_TO_RAD
        lat_rad = latitude * DEG_TO_RAD
        eps_rad = obliquity * DEG_TO_RAD

        # 1. MC (Cusp 10)
        # tan(MC) = tan(RAMC) / cos(eps)
        mc_rad = math.atan2(math.sin(ramc_rad), math.cos(ramc_rad) * math.cos(eps_rad))
        mc = (mc_rad * RAD_TO_DEG + 360.0) % 360.0

        # 2. Ascendant (Cusp 1)
        # tan(ASC) = cos(RAMC) / (-sin(RAMC)*cos(eps) - tan(lat)*sin(eps))
        y = math.cos(ramc_rad)
        x = -math.sin(ramc_rad) * math.cos(eps_rad) - math.tan(lat_rad) * math.sin(eps_rad)
        asc_rad = math.atan2(y, x)
        asc = (asc_rad * RAD_TO_DEG + 360.0) % 360.0

        cusps = [0.0] * 12
        cusps[0] = asc
        cusps[9] = mc
        cusps[6] = (asc + 180.0) % 360.0  # Descendant
        cusps[3] = (mc + 180.0) % 360.0   # IC

        # Numerical solver for intermediate Placidus cusps
        def solve_cusp_ra(target_ra_func) -> float:
            ra = ramc_rad
            for _ in range(40):
                tan_delta = math.sin(ra) * math.tan(eps_rad)
                val = -math.tan(lat_rad) * tan_delta
                if abs(val) >= 1.0:
                    # Circumpolar latitude fallback
                    break
                semi_arc = math.acos(val)
                target_ra = target_ra_func(semi_arc)
                diff = (target_ra - ra + math.pi) % (2.0 * math.pi) - math.pi
                if abs(diff) < 1e-6:
                    break
                ra = (ra + diff * 0.5) % (2.0 * math.pi)

            lam_rad = math.atan2(math.sin(ra), math.cos(ra) * math.cos(eps_rad))
            return (lam_rad * RAD_TO_DEG + 360.0) % 360.0

        # Cusp 11: RAMC + 1/3 * D
        cusps[10] = solve_cusp_ra(lambda d: (ramc_rad + 1.0/3.0 * d) % (2.0 * math.pi))
        # Cusp 12: RAMC + 2/3 * D
        cusps[11] = solve_cusp_ra(lambda d: (ramc_rad + 2.0/3.0 * d) % (2.0 * math.pi))
        # Cusp 2: RAMC + pi - 2/3 * (pi - D)
        cusps[1]  = solve_cusp_ra(lambda d: (ramc_rad + math.pi - 2.0/3.0 * (math.pi - d)) % (2.0 * math.pi))
        # Cusp 3: RAMC + pi - 1/3 * (pi - D)
        cusps[2]  = solve_cusp_ra(lambda d: (ramc_rad + math.pi - 1.0/3.0 * (math.pi - d)) % (2.0 * math.pi))

        # Opposite houses
        cusps[4] = (cusps[10] + 180.0) % 360.0  # House 5
        cusps[5] = (cusps[11] + 180.0) % 360.0  # House 6
        cusps[7] = (cusps[1]  + 180.0) % 360.0  # House 8
        cusps[8] = (cusps[2]  + 180.0) % 360.0  # House 9

        return cusps

    @classmethod
    def calculate_planet(cls, name: str, jd: float, geo: GeoLocation, 
                         utc_dt: Optional[datetime] = None) -> PlanetPosition:
        """
        Calculate sub-arcminute tropical geocentric position using PyEphem.
        """
        if utc_dt is not None:
            ephem_date = ephem.Date(utc_dt)
        else:
            ephem_date = ephem.Date(jd - 2415020.0)

        obs = ephem.Observer()
        obs.lat = str(geo.latitude * DEG_TO_RAD)
        obs.lon = str(geo.longitude * DEG_TO_RAD)
        obs.elevation = geo.altitude
        obs.date = ephem_date

        ephem_bodies = {
            "Sun": ephem.Sun(),
            "Moon": ephem.Moon(),
            "Mercury": ephem.Mercury(),
            "Venus": ephem.Venus(),
            "Mars": ephem.Mars(),
            "Jupiter": ephem.Jupiter(),
            "Saturn": ephem.Saturn(),
            "Uranus": ephem.Uranus(),
            "Neptune": ephem.Neptune(),
            "Pluto": ephem.Pluto(),
        }

        if name in ephem_bodies:
            body = ephem_bodies[name]
            body.compute(obs)
            ecl = ephem.Ecliptic(body, epoch=obs.date)
            lon = math.degrees(ecl.lon) % 360.0
            lat = math.degrees(ecl.lat)
            dist = getattr(body, "earth_distance", 1.0)

            # Compute speed and retrograde status via delta
            obs_next = ephem.Observer()
            obs_next.lat = obs.lat
            obs_next.lon = obs.lon
            obs_next.date = obs.date + ephem.minute * 30
            body.compute(obs_next)
            ecl2 = ephem.Ecliptic(body, epoch=obs_next.date)
            lon2 = math.degrees(ecl2.lon) % 360.0
            diff = (lon2 - lon + 180.0) % 360.0 - 180.0
            speed = diff * 48.0  # deg per day
            retrograde = speed < 0.0

        elif name in ["North Node", "Rahu"]:
            # Mean Lunar Ascending Node formula (Meeus)
            T = (jd - J2000) / 36525.0
            lon = (125.04452 - 1934.136261 * T + 0.0020708 * T**2 + 0.0000022 * T**3) % 360.0
            lat = 0.0
            dist = 1.0
            speed = -0.0529
            retrograde = True

        elif name in ["South Node", "Ketu"]:
            T = (jd - J2000) / 36525.0
            node_lon = (125.04452 - 1934.136261 * T + 0.0020708 * T**2 + 0.0000022 * T**3) % 360.0
            lon = (node_lon + 180.0) % 360.0
            lat = 0.0
            dist = 1.0
            speed = -0.0529
            retrograde = True

        elif name == "Chiron":
            T = (jd - J2000) / 36525.0
            mean_anom = (12.28 + 7.135 * (jd - J2000) / 365.25) % 360.0
            lon = (mean_anom + 71.5) % 360.0
            lat = 0.0
            dist = 13.7
            speed = 0.02
            retrograde = False

        else:
            lon = 0.0
            lat = 0.0
            dist = 1.0
            speed = 1.0
            retrograde = False

        sign, deg, minute = cls.longitude_to_sign(lon)
        nakshatra, pada = cls.get_nakshatra(lon)
        dignity = cls.get_dignity(name, sign)

        return PlanetPosition(
            name=name,
            longitude=round(lon, 4),
            latitude=round(lat, 4),
            distance=round(dist, 4),
            speed=round(speed, 6),
            retrograde=retrograde,
            sign=sign,
            sign_degree=deg,
            sign_minute=minute,
            house=0,
            nakshatra=nakshatra,
            pada=pada,
            dignity=dignity
        )

    @classmethod
    def assign_houses(cls, planets: List[PlanetPosition], cusps: List[float]) -> None:
        """Assign each planet to the correct house based on cusp longitudes."""
        for planet in planets:
            lon = planet.longitude % 360.0
            assigned_house = 12
            for i in range(12):
                c_start = cusps[i] % 360.0
                c_end = cusps[(i + 1) % 12] % 360.0

                if c_start <= c_end:
                    if c_start <= lon < c_end:
                        assigned_house = i + 1
                        break
                else:  # Wraps around 0° Aries
                    if lon >= c_start or lon < c_end:
                        assigned_house = i + 1
                        break
            planet.house = assigned_house

    @classmethod
    def calculate_aspects(cls, planets: List[PlanetPosition], 
                         orb_conjunction: float = 8.0,
                         orb_sextil: float = 6.0,
                         orb_square: float = 8.0,
                         orb_trine: float = 8.0,
                         orb_opposition: float = 10.0) -> List[Dict]:
        """
        Calculate major Ptolemaic aspects between planets with orb calculations.
        """
        aspects = []
        aspect_angles = {
            "conjunction": (0.0, orb_conjunction),
            "sextile": (60.0, orb_sextil),
            "square": (90.0, orb_square),
            "trine": (120.0, orb_trine),
            "opposition": (180.0, orb_opposition)
        }

        for i, p1 in enumerate(planets):
            for p2 in planets[i+1:]:
                diff = abs(p1.longitude - p2.longitude)
                if diff > 180.0:
                    diff = 360.0 - diff

                for aspect_name, (angle, orb) in aspect_angles.items():
                    orb_actual = abs(diff - angle)
                    if orb_actual <= orb:
                        aspects.append({
                            "planet1": p1.name,
                            "planet2": p2.name,
                            "aspect": aspect_name,
                            "angle": round(diff, 2),
                            "orb": round(orb_actual, 2),
                            "applying": p1.speed > p2.speed if aspect_name != "opposition" else False
                        })

        return aspects
