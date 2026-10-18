"""
AI Agent Tools for Astrological Analysis
Each tool is a callable that the agent can invoke based on user intent.
"""
from typing import Dict, List, Any, Optional, Callable
from dataclasses import dataclass
import json

from app.models.schemas import ChartResponse, Citation


@dataclass
class ToolResult:
    """Result from a tool execution."""
    tool_name: str
    output: Any
    success: bool
    error: Optional[str] = None


class ChartTool:
    """Tool for querying specific chart data."""

    def __init__(self, chart_data: ChartResponse):
        self.chart = chart_data
        self.name = "chart_query"
        self.description = "Query specific planets, houses, or points from the birth chart"

    def execute(self, query: str) -> ToolResult:
        """Extract chart data based on natural language query."""
        query = query.lower()
        result = {}

        # Planet extraction
        planets = [p.name.lower() for p in self.chart.planets]
        for planet in planets:
            if planet in query:
                p_data = next((p for p in self.chart.planets if p.name.lower() == planet), None)
                if p_data:
                    result[planet] = p_data.dict()

        # House extraction
        if "house" in query:
            import re
            nums = re.findall(r'(\d+)(?:st|nd|rd|th)?\s+house', query)
            for n in nums:
                h_num = int(n)
                if 1 <= h_num <= 12:
                    h_data = self.chart.houses[h_num - 1]
                    result[f"house_{h_num}"] = h_data.dict()

        # Ascendant/MC
        if "ascendant" in query or "rising" in query:
            result["ascendant"] = self.chart.ascendant.dict()
        if "midheaven" in query or "mc" in query:
            result["mc"] = self.chart.mc.dict()

        return ToolResult(
            tool_name=self.name,
            output=result,
            success=True
        )


class AspectTool:
    """Tool for analyzing astrological aspects."""

    def __init__(self, chart_data: ChartResponse):
        self.chart = chart_data
        self.name = "aspect_analysis"
        self.description = "Analyze aspects between planets or points"

    def execute(self, query: str) -> ToolResult:
        """Find aspects relevant to the query."""
        query = query.lower()
        relevant_aspects = []

        for aspect in self.chart.aspects:
            p1 = aspect.planet1.lower()
            p2 = aspect.planet2.lower()
            if p1 in query or p2 in query:
                relevant_aspects.append(aspect.dict())

        return ToolResult(
            tool_name=self.name,
            output={
                "aspects": relevant_aspects,
                "count": len(relevant_aspects),
                "dominant_aspect": self._get_dominant_aspect()
            },
            success=True
        )

    def _get_dominant_aspect(self) -> Optional[str]:
        """Determine the most significant aspect in the chart."""
        if not self.chart.aspects:
            return None
        # Sort by tightest orb
        sorted_aspects = sorted(self.chart.aspects, key=lambda x: x.orb)
        top = sorted_aspects[0]
        return f"{top.planet1} {top.aspect} {top.planet2} (orb: {top.orb}°)"


class RAGSearchTool:
    """Tool for searching the astrology knowledge base."""

    def __init__(self, retriever=None):
        self.name = "rag_search"
        self.description = "Search astrology knowledge base for interpretations and concepts"
        self.retriever = retriever

    def execute(self, query: str) -> ToolResult:
        """Search RAG database for relevant passages."""
        if self.retriever is None:
            return ToolResult(
                tool_name=self.name,
                output={"results": [], "message": "RAG retriever not initialized"},
                success=False,
                error="RAG system unavailable"
            )

        try:
            results = self.retriever.retrieve(query)
            citations = [
                Citation(
                    text=r["chunk"]["text"],
                    source=r["chunk"]["source"],
                    chapter=r["chunk"]["chapter"],
                    page=r["chunk"]["page"],
                    score=r["score"]
                ) for r in results
            ]

            return ToolResult(
                tool_name=self.name,
                output={
                    "citations": [c.dict() for c in citations],
                    "query": query,
                    "results_found": len(citations)
                },
                success=True
            )
        except Exception as e:
            return ToolResult(
                tool_name=self.name,
                output={},
                success=False,
                error=str(e)
            )


class PlanetInterpretationTool:
    """Tool for generating planet-specific interpretations."""

    def __init__(self, chart_data: ChartResponse):
        self.chart = chart_data
        self.name = "planet_interpretation"
        self.description = "Generate detailed interpretation for a specific planet"

    def execute(self, planet_name: str) -> ToolResult:
        """Generate structured interpretation for a planet."""
        planet = next(
            (p for p in self.chart.planets if p.name.lower() == planet_name.lower()),
            None
        )

        if not planet:
            return ToolResult(
                tool_name=self.name,
                output={},
                success=False,
                error=f"Planet {planet_name} not found in chart"
            )

        # Generate interpretation structure
        interpretation = {
            "planet": planet.name,
            "position": f"{planet.sign} {planet.sign_degree}°{planet.sign_minute}'",
            "house": planet.house,
            "dignity": planet.dignity,
            "retrograde": planet.retrograde,
            "nakshatra": f"{planet.nakshatra} ({planet.pada})",
            "core_meaning": self._get_core_meaning(planet.name),
            "house_significance": self._get_house_significance(planet.house),
            "sign_expression": self._get_sign_expression(planet.sign),
            "dignity_assessment": self._assess_dignity(planet.dignity),
            "aspects_to_planet": self._get_aspects_to_planet(planet.name)
        }

        return ToolResult(
            tool_name=self.name,
            output=interpretation,
            success=True
        )

    def _get_core_meaning(self, planet: str) -> str:
        meanings = {
            "Sun": "Core identity, life purpose, vitality, conscious will",
            "Moon": "Emotions, instincts, nurturing, subconscious patterns",
            "Mercury": "Communication, intellect, learning, reasoning",
            "Venus": "Love, values, attraction, harmony, aesthetics",
            "Mars": "Action, desire, aggression, courage, drive",
            "Jupiter": "Expansion, wisdom, luck, philosophy, growth",
            "Saturn": "Discipline, structure, limitation, maturity, karma",
            "Uranus": "Innovation, rebellion, sudden change, individuality",
            "Neptune": "Dreams, illusion, spirituality, transcendence",
            "Pluto": "Transformation, power, death/rebirth, depth"
        }
        return meanings.get(planet, "Archetypal planetary energy")

    def _get_house_significance(self, house: int) -> str:
        significations = {
            1: "Self, body, appearance, personality, life approach",
            2: "Resources, values, money, self-worth, possessions",
            3: "Communication, siblings, short trips, learning",
            4: "Home, family, roots, emotional foundation, parents",
            5: "Creativity, romance, children, pleasure, self-expression",
            6: "Health, service, daily routine, work, habits",
            7: "Partnerships, marriage, contracts, open enemies",
            8: "Transformation, shared resources, death, occult",
            9: "Higher learning, travel, philosophy, spirituality",
            10: "Career, reputation, public standing, authority",
            11: "Friends, groups, hopes, humanitarian causes",
            12: "Unconscious, secrets, isolation, spirituality, karma"
        }
        return significations.get(house, "Life domain")

    def _get_sign_expression(self, sign: str) -> str:
        expressions = {
            "Aries": "Direct, pioneering, assertive, impulsive",
            "Taurus": "Steady, sensual, persistent, material",
            "Gemini": "Curious, adaptable, communicative, dualistic",
            "Cancer": "Nurturing, protective, emotional, tenacious",
            "Leo": "Creative, proud, generous, dramatic",
            "Virgo": "Analytical, service-oriented, meticulous, health-conscious",
            "Libra": "Harmonious, diplomatic, relationship-focused, aesthetic",
            "Scorpio": "Intense, transformative, secretive, powerful",
            "Sagittarius": "Expansive, philosophical, adventurous, optimistic",
            "Capricorn": "Ambitious, disciplined, structured, authoritative",
            "Aquarius": "Innovative, detached, humanitarian, unconventional",
            "Pisces": "Compassionate, mystical, boundary-dissolving, artistic"
        }
        return expressions.get(sign, "Zodiacal quality")

    def _assess_dignity(self, dignity: str) -> str:
        assessments = {
            "domicile": "Strongest position - planet operates with full power and natural expression",
            "exaltation": "Honored position - planet expresses its highest virtues",
            "detriment": "Challenged position - planet must work against the sign's nature",
            "fall": "Weakened position - planet struggles to express positively",
            "peregrine": "Neutral position - planet relies on aspects and house placement"
        }
        return assessments.get(dignity, "Mixed influences")

    def _get_aspects_to_planet(self, planet_name: str) -> List[Dict]:
        """Get all aspects involving this planet."""
        return [
            a.dict() for a in self.chart.aspects 
            if a.planet1 == planet_name or a.planet2 == planet_name
        ]


class ComparisonTool:
    """Tool for comparing two chart factors."""

    def __init__(self, chart_data: ChartResponse):
        self.chart = chart_data
        self.name = "comparison"
        self.description = "Compare two planets, houses, or points in the chart"

    def execute(self, factor1: str, factor2: str) -> ToolResult:
        """Generate comparison analysis."""
        f1_data = self._get_factor(factor1)
        f2_data = self._get_factor(factor2)

        if not f1_data or not f2_data:
            return ToolResult(
                tool_name=self.name,
                output={},
                success=False,
                error="One or both factors not found"
            )

        # Find aspect between them if any
        aspect = None
        for a in self.chart.aspects:
            if (a.planet1.lower() == factor1.lower() and a.planet2.lower() == factor2.lower()) or                (a.planet1.lower() == factor2.lower() and a.planet2.lower() == factor1.lower()):
                aspect = a.dict()
                break

        comparison = {
            "factor1": f1_data,
            "factor2": f2_data,
            "aspect_between": aspect,
            "element_compatibility": self._check_elements(f1_data, f2_data),
            "modality_compatibility": self._check_modalities(f1_data, f2_data),
            "house_relationship": self._house_relationship(f1_data, f2_data),
            "synthesis": self._synthesize(factor1, factor2, aspect)
        }

        return ToolResult(
            tool_name=self.name,
            output=comparison,
            success=True
        )

    def _get_factor(self, name: str) -> Optional[Dict]:
        for p in self.chart.planets:
            if p.name.lower() == name.lower():
                return p.dict()
        return None

    def _check_elements(self, f1: Dict, f2: Dict) -> str:
        elements = {"fire": "hot/dry", "earth": "cold/dry", "air": "hot/wet", "water": "cold/wet"}
        e1 = elements.get(f1.get("element", ""), "")
        e2 = elements.get(f2.get("element", ""), "")
        if e1 == e2:
            return f"Same element ({f1.get('element')}) - harmonious, supportive energy"
        elif e1.split("/")[0] == e2.split("/")[0]:
            return f"Same polarity - active and compatible"
        else:
            return f"Different elements - complementary but may require integration"

    def _check_modalities(self, f1: Dict, f2: Dict) -> str:
        m1, m2 = f1.get("modality", ""), f2.get("modality", "")
        if m1 == m2:
            return f"Same modality ({m1}) - similar approach to action"
        return f"Different modalities - {m1} meets {m2}, different rhythms of expression"

    def _house_relationship(self, f1: Dict, f2: Dict) -> str:
        h1, h2 = f1.get("house", 0), f2.get("house", 0)
        diff = abs(h1 - h2)
        if diff == 0:
            return "Same house - deeply intertwined life areas"
        elif diff == 6:
            return "Opposing houses - polarity to be integrated"
        elif diff in [4, 8]:
            return "Trine relationship by house - supportive flow"
        return f"{h1}th house meets {h2}th house - distinct but connected life domains"

    def _synthesize(self, f1: str, f2: str, aspect: Optional[Dict]) -> str:
        if aspect:
            return f"{f1.title()} and {f2.title()} are in {aspect['aspect']} (orb {aspect['orb']}°), creating a dynamic {aspect['aspect']} relationship"
        return f"{f1.title()} and {f2.title()} operate in different spheres without major aspect"


class StrengthAnalysisTool:
    """Tool for analyzing planetary strengths and chart emphasis."""

    def __init__(self, chart_data: ChartResponse):
        self.chart = chart_data
        self.name = "strength_analysis"
        self.description = "Analyze strongest and weakest placements in the chart"

    def execute(self, query: str = "") -> ToolResult:
        """Rank planets by strength and identify chart emphasis."""

        # Calculate strength scores
        strengths = []
        for p in self.chart.planets:
            score = 0.0

            # Dignity score
            dignity_scores = {
                "domicile": 5.0, "exaltation": 4.0,
                "peregrine": 2.0, "detriment": 1.0, "fall": 0.5
            }
            score += dignity_scores.get(p.dignity, 2.0)

            # Angular house bonus
            if p.house in [1, 4, 7, 10]:
                score += 3.0
            elif p.house in [2, 5, 8, 11]:
                score += 1.5

            # Retrograde penalty (traditional view)
            if p.retrograde:
                score -= 0.5

            # Aspect richness
            aspect_count = sum(1 for a in self.chart.aspects 
                             if a.planet1 == p.name or a.planet2 == p.name)
            score += min(aspect_count * 0.3, 2.0)

            strengths.append({
                "planet": p.name,
                "score": round(score, 2),
                "position": f"{p.sign} {p.sign_degree}° (House {p.house})",
                "key_factors": self._strength_factors(p, aspect_count)
            })

        strengths.sort(key=lambda x: x["score"], reverse=True)

        # Identify dominant element and modality
        dominant_element = max(self.chart.element_balance.items(), key=lambda x: x[1])
        dominant_modality = max(self.chart.modality_balance.items(), key=lambda x: x[1])

        return ToolResult(
            tool_name=self.name,
            output={
                "ranked_planets": strengths,
                "strongest": strengths[0] if strengths else None,
                "weakest": strengths[-1] if strengths else None,
                "dominant_element": dominant_element,
                "dominant_modality": dominant_modality,
                "chart_patterns": self.chart.chart_patterns
            },
            success=True
        )

    def _strength_factors(self, planet, aspect_count: int) -> List[str]:
        factors = []
        if planet.dignity in ["domicile", "exaltation"]:
            factors.append(f"Strong dignity ({planet.dignity})")
        if planet.house in [1, 4, 7, 10]:
            factors.append(f"Angular house ({planet.house})")
        if aspect_count > 3:
            factors.append(f"Many aspects ({aspect_count})")
        if planet.retrograde:
            factors.append("Retrograde (internalized energy)")
        return factors
