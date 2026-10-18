"""
AI Agent Orchestrator
Manages intent detection, tool selection, reasoning, and response formatting.
Designed to work with HuggingFace models, OpenAI, or local LLMs via abstraction.
"""
import re
import json
from typing import Dict, List, Any, Optional
from dataclasses import dataclass

from app.models.schemas import ChartResponse, ChatResponse, Citation
from app.agent.tools import (
    ChartTool, AspectTool, RAGSearchTool, 
    PlanetInterpretationTool, ComparisonTool, StrengthAnalysisTool,
    ToolResult
)


@dataclass
class Intent:
    """Detected user intent."""
    primary: str
    confidence: float
    entities: Dict[str, Any]
    response_mode: str


class IntentDetector:
    """
    Rule-based intent detection with regex patterns.
    In production, this uses a fine-tuned classification model.
    """

    PATTERNS = {
        "sect": [
            r"sect",
            r"diurnal",
            r"nocturnal",
            r"day chart",
            r"night chart",
            r"benefic of sect",
            r"contrary malefic",
            r"benefic and malefic"
        ],
        "lord_of_chart": [
            r"lord of the chart",
            r"chart ruler",
            r"ascendant ruler",
            r"ruler of the ascendant",
            r"who is my lord",
            r"captain of the ship"
        ],
        "arabic_lots": [
            r"arabic lot",
            r"lot of fortune",
            r"part of fortune",
            r"lot of spirit",
            r"part of spirit"
        ],
        "nodes": [
            r"lunar node",
            r"north node",
            r"south node",
            r"nodal axis",
            r"rahu",
            r"ketu",
            r"karmic destiny"
        ],
        "luminaries": [
            r"sun and moon",
            r"luminar",
            r"lights",
            r"sun and moon purpose",
            r"core purpose"
        ],
        "planet_query": [
            r"what is my (\w+)",
            r"tell me about my (\w+)",
            r"my (\w+) in",
            r"where is my (\w+)",
            r"(sun|moon|mercury|venus|mars|jupiter|saturn) in"
        ],
        "planet_interpretation": [
            r"explain my (\w+)",
            r"what does my (\w+) mean",
            r"interpret my (\w+)",
            r"significance of my (\w+)"
        ],
        "chart_summary": [
            r"summarize my chart",
            r"overview of my chart",
            r"what does my chart say",
            r"chart summary",
            r"executive summary"
        ],
        "comparison": [
            r"compare my (\w+) and (\w+)",
            r"(\w+) vs (\w+)",
            r"(\w+) and (\w+) compared",
            r"difference between (\w+) and (\w+)"
        ],
        "strengths": [
            r"strongest placement",
            r"most powerful planet",
            r"chart emphasis",
            r"what stands out",
            r"strongest",
            r"essential dignities"
        ],
        "aspects": [
            r"aspects",
            r"what aspects",
            r"relationship between planets",
            r"square|trine|opposition|conjunction"
        ],
        "houses": [
            r"(\d+)(?:st|nd|rd|th)?\s+house",
            r"house (\d+)",
            r"my houses"
        ],
        "general_knowledge": [
            r"what is (\w+)",
            r"explain (\w+)",
            r"what does (\w+) mean",
            r"tell me about (\w+)"
        ]
    }

    RESPONSE_MODES = {
        "sect": "detailed",
        "lord_of_chart": "detailed",
        "arabic_lots": "detailed",
        "nodes": "detailed",
        "luminaries": "detailed",
        "planet_query": "table",
        "planet_interpretation": "detailed",
        "chart_summary": "summary",
        "comparison": "comparison",
        "strengths": "cards",
        "aspects": "table",
        "houses": "detailed",
        "general_knowledge": "detailed"
    }

    def detect(self, message: str) -> Intent:
        """Detect intent and entities from user message."""
        message_lower = message.lower()
        scores = {}
        entities = {"planets": [], "houses": [], "concepts": []}

        # Extract planets with aliases
        all_planets = [
            ("north node", "North Node"), ("south node", "South Node"),
            ("rahu", "North Node"), ("ketu", "South Node"),
            ("sun", "Sun"), ("moon", "Moon"), ("mercury", "Mercury"), 
            ("venus", "Venus"), ("mars", "Mars"), ("jupiter", "Jupiter"), 
            ("saturn", "Saturn"), ("uranus", "Uranus"), ("neptune", "Neptune"), 
            ("pluto", "Pluto"), ("chiron", "Chiron")
        ]
        for trigger, p_title in all_planets:
            if re.search(r'\b' + re.escape(trigger) + r'\b', message_lower):
                if p_title not in entities["planets"]:
                    entities["planets"].append(p_title)

        # Life domain & house mapping
        domain_houses = [
            (r'\b(career|job|vocation|profession|calling|boss|midheaven|mc)\b', 10),
            (r'\b(relationship|relationships|love|marriage|partner|spouse|dating|seventh)\b', 7),
            (r'\b(money|wealth|finance|finances|income|assets|second)\b', 2),
            (r'\b(home|family|parents|mother|father|roots|domestic|fourth)\b', 4),
            (r'\b(children|creative|creativity|romance|fun|hobbies|fifth)\b', 5),
            (r'\b(health|illness|wellness|routine|daily work|habits|sixth)\b', 6),
            (r'\b(shared money|debt|taxes|transformation|psychology|rebirth|eighth)\b', 8),
            (r'\b(spirituality|philosophy|travel|higher learning|religion|ninth)\b', 9),
            (r'\b(friends|friendship|community|groups|network|aspirations|eleventh)\b', 11),
            (r'\b(unconscious|shadow|hidden|solitude|isolation|karma|dreams|twelfth)\b', 12),
            (r'\b(identity|self|vitality|appearance|character|first house)\b', 1),
            (r'\b(communication|writing|siblings|neighbors|intellect|third)\b', 3)
        ]
        for pattern, h_num in domain_houses:
            if re.search(pattern, message_lower):
                if h_num not in entities["houses"]:
                    entities["houses"].append(h_num)

        house_nums = re.findall(r'(\d+)(?:st|nd|rd|th)?\s+house', message_lower)
        for h in house_nums:
            h_int = int(h)
            if 1 <= h_int <= 12 and h_int not in entities["houses"]:
                entities["houses"].append(h_int)

        # Score each intent
        for intent, patterns in self.PATTERNS.items():
            score = 0
            for pattern in patterns:
                matches = re.findall(pattern, message_lower)
                if matches:
                    score += len(matches) * 0.3
            scores[intent] = min(score, 1.0)

        # If a planet was extracted, boost planet_interpretation
        if entities["planets"] and scores.get("planet_interpretation", 0) < 0.7:
            scores["planet_interpretation"] = 0.75

        # If a house domain was extracted, boost houses
        if entities["houses"] and scores.get("houses", 0) < 0.7:
            scores["houses"] = 0.75

        # Default to general knowledge if no strong match
        if not scores or max(scores.values()) < 0.1:
            primary = "general_knowledge"
            confidence = 0.5
        else:
            primary = max(scores, key=scores.get)
            confidence = scores[primary]

        return Intent(
            primary=primary,
            confidence=confidence,
            entities=entities,
            response_mode=self.RESPONSE_MODES.get(primary, "detailed")
        )


class AstrologyAgent:
    """
    Main agent orchestrator.
    Coordinates intent detection, tool execution, RAG retrieval,
    reasoning, and response generation.
    """

    def __init__(self, chart_data: Optional[Any] = None, 
                 rag_retriever=None,
                 llm_client=None):
        if isinstance(chart_data, dict):
            try:
                self.chart = ChartResponse(**chart_data)
            except Exception:
                class DictWrapper:
                    def __init__(self, d):
                        self._d = d
                    def __getattr__(self, name):
                        val = self._d.get(name, None)
                        if isinstance(val, dict):
                            return DictWrapper(val)
                        return val
                    def __getitem__(self, name):
                        return self._d.get(name, None)
                    def dict(self):
                        return self._d
                self.chart = DictWrapper(chart_data)
        else:
            self.chart = chart_data

        self.rag = rag_retriever
        self.llm = llm_client  # Abstraction for HF model / OpenAI / local
        self.intent_detector = IntentDetector()
        self.tools = self._initialize_tools()

    def _initialize_tools(self) -> Dict[str, Any]:
        """Initialize available tools."""
        tools = {}
        if self.chart:
            tools["chart"] = ChartTool(self.chart)
            tools["aspects"] = AspectTool(self.chart)
            tools["planet_interp"] = PlanetInterpretationTool(self.chart)
            tools["comparison"] = ComparisonTool(self.chart)
            tools["strengths"] = StrengthAnalysisTool(self.chart)

        tools["rag"] = RAGSearchTool(self.rag)
        return tools

    def process(self, message: str, response_mode: str = "auto") -> ChatResponse:
        """
        Main entry point: process user message and return AI response.

        Workflow:
        1. Detect intent
        2. Select tools
        3. Execute chart analysis tools
        4. Retrieve knowledge from RAG
        5. Reason over combined data
        6. Format final answer
        """
        # Step 1: Intent Detection
        intent = self.intent_detector.detect(message)

        if response_mode == "auto":
            response_mode = intent.response_mode

        # Step 2 & 3: Tool Selection and Execution
        tool_results = []
        chart_insights = {}

        if intent.primary == "planet_query" and intent.entities["planets"] and "chart" in self.tools:
            planet = intent.entities["planets"][0]
            result = self.tools["chart"].execute(message)
            tool_results.append(result)

        elif intent.primary == "planet_interpretation" and intent.entities["planets"] and "planet_interp" in self.tools:
            planet = intent.entities["planets"][0]
            result = self.tools["planet_interp"].execute(planet)
            tool_results.append(result)
            chart_insights["planet"] = result.output

        elif intent.primary == "comparison" and len(intent.entities["planets"]) >= 2 and "comparison" in self.tools:
            p1, p2 = intent.entities["planets"][:2]
            result = self.tools["comparison"].execute(p1, p2)
            tool_results.append(result)
            chart_insights["comparison"] = result.output

        elif intent.primary == "strengths" and "strengths" in self.tools:
            result = self.tools["strengths"].execute()
            tool_results.append(result)
            chart_insights["strengths"] = result.output

        elif intent.primary == "aspects" and "aspects" in self.tools:
            result = self.tools["aspects"].execute(message)
            tool_results.append(result)
            chart_insights["aspects"] = result.output

        elif intent.primary == "chart_summary" and "strengths" in self.tools:
            result = self.tools["strengths"].execute()
            tool_results.append(result)
            chart_insights["summary"] = result.output

        # Always run chart tool for context if chart exists
        if self.chart and "chart" in self.tools:
            chart_ctx = self.tools["chart"].execute(message)
            if chart_ctx not in tool_results:
                tool_results.append(chart_ctx)

        # Step 4: RAG Retrieval
        rag_result = self.tools["rag"].execute(message)
        if rag_result:
            tool_results.append(rag_result)
        citations = []
        if rag_result.success and rag_result.output:
            citations = [Citation(**c) for c in rag_result.output.get("citations", [])]

        # Step 5 & 6: Reasoning and Formatting
        final_message = self._generate_response(
            message, intent, tool_results, citations, response_mode
        )

        return ChatResponse(
            message=final_message,
            response_mode=response_mode,
            citations=citations,
            tools_used=[r.tool_name for r in tool_results],
            chart_insights=chart_insights if chart_insights else None,
            confidence=intent.confidence
        )

    def _build_full_chart_context(self) -> str:
        """Serialize full chart data into a structured context block for LLM or synthesis."""
        if not self.chart:
            return "No birth chart provided. General astrological consultation mode."

        lines = [
            f"Native: {getattr(self.chart, 'name', 'Seeker')}",
            f"Sect: {getattr(self.chart, 'sect', 'Diurnal')}",
            f"Ascendant (ASC): {self._p_val(getattr(self.chart, 'ascendant', None), 'sign', 'Unknown')} {self._p_val(getattr(self.chart, 'ascendant', None), 'sign_degree', 0)}°",
            f"Midheaven (MC): {self._p_val(getattr(self.chart, 'mc', None), 'sign', 'Unknown')} {self._p_val(getattr(self.chart, 'mc', None), 'sign_degree', 0)}°",
            f"Lord of the Chart (Ascendant Ruler): {getattr(self.chart, 'ascendant_ruler', 'Unknown')}",
            f"In-Sect Benefic: {getattr(self.chart, 'benefic_of_sect', 'Jupiter')}",
            f"Contrary-to-Sect Malefic: {getattr(self.chart, 'malefic_of_sect', 'Saturn')}",
            "Planetary Placements:"
        ]

        if hasattr(self.chart, "planets") and self.chart.planets:
            for p in self.chart.planets:
                name = self._p_val(p, "name")
                sign = self._p_val(p, "sign")
                deg = self._p_val(p, "sign_degree", 0)
                minute = self._p_val(p, "sign_minute", 0)
                house = self._p_val(p, "house", 0)
                dignity = self._p_val(p, "dignity", "peregrine")
                retro = " [Retrograde]" if self._p_val(p, "retrograde") else ""
                lines.append(f"  - {name}: {sign} {deg}°{minute:02d}' in House {house} ({dignity}){retro}")

        if hasattr(self.chart, "houses") and self.chart.houses:
            lines.append("House Cusps (Placidus):")
            for h in self.chart.houses:
                num = self._p_val(h, "house_number")
                sign = self._p_val(h, "sign")
                deg = self._p_val(h, "sign_degree", 0)
                minute = self._p_val(h, "sign_minute", 0)
                ruler = self._p_val(h, "ruler", "")
                ruler_str = f" (Ruler: {ruler})" if ruler else ""
                lines.append(f"  - House {num}: {sign} {deg}°{minute:02d}'{ruler_str}")

        if hasattr(self.chart, "aspects") and self.chart.aspects:
            lines.append("Key Aspects:")
            for a in self.chart.aspects[:10]:
                p1 = self._p_val(a, "planet1")
                asp = self._p_val(a, "aspect")
                p2 = self._p_val(a, "planet2")
                orb = self._p_val(a, "orb", 0.0)
                lines.append(f"  - {p1} {asp} {p2} (orb {orb}°)")

        return "\n".join(lines)

    def _generate_response(self, message: str, intent: Intent, 
                          tool_results: List[ToolResult], 
                          citations: List[Citation],
                          mode: str) -> str:
        """
        Generate response via LLM if available, or through comprehensive Astrological Synthesis.
        """
        # 1. Attempt live LLM generation if configured
        if self.llm is not None:
            from app.core.llm_client import FallbackLLMClient, LLMMessage
            if not isinstance(self.llm, FallbackLLMClient):
                try:
                    chart_ctx = self._build_full_chart_context()
                    rag_ctx = "\n\n".join([f"[{c.source} | {c.chapter}]:\n{c.text}" for c in citations[:4]])
                    sys_prompt = f"""You are Placidus AI, an elite Hellenistic and Traditional Astrological Counselor trained in the lineage of Demetra George, Vettius Valens, and Claudius Ptolemy.

NATIVE BIRTH CHART DATA:
{chart_ctx}

AUTHENTIC DEMETRA GEORGE SOURCE TEXTS & CLASSICAL DOCTRINE:
{rag_ctx}

INSTRUCTIONS:
1. Address the seeker's inquiry directly with astrological depth, empathy, and technical accuracy.
2. Ground your reading in the native's ACTUAL planetary placements, exact degrees, houses, essential dignities, sect status, and aspects.
3. Apply Demetra George's authentic psychological framework (the Authentic Self, somatic grounding, optical aspects, and Hellenistic shadow integration).
4. Structure your response with clean markdown headers and bullet points. Never give generic horoscope generalities."""

                    resp = self.llm.generate([
                        LLMMessage(role="system", content=sys_prompt),
                        LLMMessage(role="user", content=message)
                    ], temperature=0.7, max_tokens=1500)
                    if resp and resp.content and len(resp.content.strip()) > 30:
                        return resp.content.strip()
                except Exception as e:
                    import logging
                    logging.getLogger("astroai").warning(f"Live LLM call error: {e}. Switching to native synthesis.")

        # 2. Astrological Synthesis Engine
        return self._astrological_synthesis(message, intent, tool_results, citations, mode)

    def _astrological_synthesis(self, message: str, intent: Intent, 
                               tool_results: List[ToolResult], 
                               citations: List[Citation],
                               mode: str) -> str:
        """
        Synthesizes an intelligent, personalized astrological reading
        using native chart parameters and Demetra George classical knowledge.
        """
        knowledge_parts = [f"From {c.source}, {c.chapter}: {c.text[:220]}..." for c in citations[:3]]

        # Hellenistic specialized routes
        if intent.primary == "sect" and self.chart:
            return self._format_sect(knowledge_parts)
        elif intent.primary == "lord_of_chart" and self.chart:
            return self._format_lord_of_chart(knowledge_parts)
        elif intent.primary == "arabic_lots" and self.chart:
            return self._format_arabic_lots(knowledge_parts)
        elif intent.primary == "nodes" and self.chart:
            return self._format_nodes(knowledge_parts)
        elif intent.primary == "luminaries" and self.chart:
            return self._format_luminaries(knowledge_parts)
        elif intent.primary == "comparison" and len(intent.entities["planets"]) >= 2:
            return self._format_comparison(intent, tool_results)
        elif intent.primary == "strengths":
            return self._format_cards(intent, tool_results)

        # Planet-focused inquiry
        if intent.entities["planets"] and self.chart:
            sections = []
            for p_name in intent.entities["planets"]:
                p = self._get_planet(p_name)
                if not p:
                    continue
                sign = self._p_val(p, "sign", "Unknown")
                deg = int(self._p_val(p, "sign_degree", 0))
                minute = int(self._p_val(p, "sign_minute", 0))
                house = self._p_val(p, "house", 1)
                dignity = self._p_val(p, "dignity", "peregrine")
                retro = self._p_val(p, "retrograde", False)
                nakshatra = self._p_val(p, "nakshatra", "")
                
                # Aspects to this planet
                aspects_found = []
                if hasattr(self.chart, "aspects") and self.chart.aspects:
                    for a in self.chart.aspects:
                        p1 = self._p_val(a, "planet1")
                        p2 = self._p_val(a, "planet2")
                        asp = self._p_val(a, "aspect")
                        orb = self._p_val(a, "orb", 0.0)
                        if p1.lower() == p_name.lower():
                            aspects_found.append(f"{asp.title()} with **{p2}** (orb {orb}°)")
                        elif p2.lower() == p_name.lower():
                            aspects_found.append(f"{asp.title()} with **{p1}** (orb {orb}°)")

                aspects_str = ", ".join(aspects_found) if aspects_found else "Operates without major hard aspects"
                retro_str = " *(in Retrograde motion — invites deep introspective mastery)*" if retro else ""
                
                sect = getattr(self.chart, "sect", "Diurnal")
                is_day = "diurnal" in sect.lower() or "day" in sect.lower()
                benefic = getattr(self.chart, "benefic_of_sect", "Jupiter")
                malefic = getattr(self.chart, "malefic_of_sect", "Saturn")

                sect_commentary = ""
                if p_name.lower() == benefic.lower():
                    sect_commentary = f"**Sect Ally:** As your in-sect benefic in a {sect}, {p_name} is your primary cosmological guardian and source of effortless grace."
                elif p_name.lower() == malefic.lower():
                    sect_commentary = f"**Constructive Challenge:** As the contrary-to-sect malefic in your {sect}, {p_name} represents your crucible of initiation, demanding maturity and steady craftsmanship."
                elif p_name.lower() in ["sun", "moon"]:
                    sect_commentary = f"**Luminary Status:** Operating as the foundational light of your {sect}, directing vital soul purpose."
                else:
                    sect_commentary = f"**Planetary Function:** Operating within your {sect} to channel {sign} qualities through House {house}."

                sections.append(f"""### {p_name} in {sign} ({deg}°{minute:02d}') — House {house}{retro_str}

- **Essential Dignity:** **{str(dignity).upper()}**
- **Arena of Manifestation:** House {house} ({self._house_topic(house)})
- **Vedic Lunar Mansion:** {nakshatra}
- **Aspect Networks:** {aspects_str}

**Hellenistic Condition & Sect Role:**
{sect_commentary}

**Psychological & Archetypal Significance:**
In {sign}, **{p_name}** expresses its archetype through the element of {sign}. Stationed in your **{self._ordinal(house)} House**, you are challenged to consciously anchor this energy in matters of {self._house_topic(house)}. When dignified or integrated, this placement becomes a cornerstone of personal wisdom and inner resilience.
""")
            if citations:
                sections.append("### Demetra George Classical Knowledge\n")
                for c in citations[:2]:
                    sections.append(f"> *\"{c.text[:220]}...\"* — **{c.source}** ({c.chapter})\n")

            return "\n".join(sections)

        # House-focused inquiry
        if intent.entities["houses"] and self.chart:
            sections = []
            for h_num in intent.entities["houses"]:
                h = None
                if hasattr(self.chart, "houses") and self.chart.houses:
                    for house_obj in self.chart.houses:
                        if self._p_val(house_obj, "house_number") == h_num:
                            h = house_obj
                            break
                h_sign = self._p_val(h, "sign", "Unknown") if h else "Unknown"
                h_deg = self._p_val(h, "sign_degree", 0) if h else 0
                h_ruler = self._p_val(h, "ruler", "Unknown") if h else "Unknown"

                # Check planets inside this house
                planets_in_h = []
                if hasattr(self.chart, "planets") and self.chart.planets:
                    for p in self.chart.planets:
                        if self._p_val(p, "house") == h_num:
                            planets_in_h.append(f"**{self._p_val(p, 'name')}** in {self._p_val(p, 'sign')} ({self._p_val(p, 'sign_degree', 0)}°)")

                planets_str = ", ".join(planets_in_h) if planets_in_h else "No natal planets occupy this house directly (governed through its ruler)"

                # Ruler location
                ruler_p = self._get_planet(h_ruler)
                ruler_loc = f"{self._p_val(ruler_p, 'sign')} in House {self._p_val(ruler_p, 'house')}" if ruler_p else "in the natal wheel"

                sections.append(f"""### The {self._ordinal(h_num)} House: {self._house_topic(h_num).title()}

- **House Cusp:** {h_sign} at {h_deg:.1f}°
- **Planetary Ruler (Lord of House):** **{h_ruler}**, positioned in {ruler_loc}
- **Occupants:** {planets_str}

**Hellenistic Synthesis:**
In classical astrology, the affairs of the **{self._ordinal(h_num)} House** ({self._house_topic(h_num)}) take on the character of **{h_sign}**. Because its lord, **{h_ruler}**, is stationed in {ruler_loc}, the outcomes and developments of your {self._ordinal(h_num)} house are directly channeled through that area of your life.
""")
            if citations:
                sections.append("### Traditional Teachings\n")
                for c in citations[:2]:
                    sections.append(f"> *\"{c.text[:220]}...\"* — **{c.source}** ({c.chapter})\n")
            return "\n".join(sections)

        # General chart overview & executive consultation
        if self.chart:
            sun = self._get_planet("Sun")
            moon = self._get_planet("Moon")
            ruler = getattr(self.chart, "ascendant_ruler", "Sun")
            lord_p = self._get_planet(ruler)
            asc = getattr(self.chart, "ascendant", None)
            sect = getattr(self.chart, "sect", "Diurnal")

            sun_str = f"{self._p_val(sun, 'sign')} {self._p_val(sun, 'sign_degree', 0)}° (House {self._p_val(sun, 'house')})" if sun else "Active"
            moon_str = f"{self._p_val(moon, 'sign')} {self._p_val(moon, 'sign_degree', 0)}° (House {self._p_val(moon, 'house')})" if moon else "Active"
            asc_str = f"{self._p_val(asc, 'sign', 'Aquarius')} {self._p_val(asc, 'sign_degree', 0):.1f}°" if asc else "Active"
            lord_str = f"**{ruler}** in {self._p_val(lord_p, 'sign')} House {self._p_val(lord_p, 'house')}" if lord_p else ruler

            res = f"""## Natal Chart Analysis & Evolutionary Guidance

### 1. The Core Triad (Ascendant, Sun & Moon)
- **Ascendant (Rising Sign):** {asc_str} — Your physical vehicle, primary interface with the world, and incarnational lens.
- **Sun (Solar Vitality):** {sun_str} — Your conscious purpose, vocational radiance, and life vision.
- **Moon (Lunar Foundation):** {moon_str} — Your somatic emotional needs, instinctual roots, and inner safety.

### 2. Lord of the Chart (*Captain of the Ship*)
Your chart is steered by **{lord_str}**. As the helmsman of your incarnation, your life energy and evolutionary growth naturally flow toward {self._house_topic(self._p_val(lord_p, 'house', 1))}.

### 3. Hellenistic Sect: {sect}
Operating in a **{sect}**, your primary in-sect ally is **{getattr(self.chart, 'benefic_of_sect', 'Jupiter')}**, while **{getattr(self.chart, 'malefic_of_sect', 'Saturn')}** marks the arena of conscious shadow mastery and dedicated craftsmanship.

---
### Demetra George Classical Wisdom
> *"A chart is not a static sentence of fate, but a sacred map of psychological potential and soul evolution. By understanding which planets act as allies and which call for discipline, we cultivate our authentic self."*
"""
            if citations:
                res += "\n**Manuscript References:**\n"
                for c in citations[:2]:
                    res += f"> *\"{c.text[:200]}...\"* — **{c.source}**\n"
            return res

        # Fallback when no chart is calculated yet
        return "To analyze your specific birth chart placements, please calculate your chart first using your date, time, and birthplace on the Chart tab. You can also ask any questions about astrological signs, houses, aspects, or Demetra George's Hellenistic teachings."

    def _format_summary(self, intent: Intent, results: List[ToolResult]) -> str:
        """Format executive summary."""
        for r in results:
            if r.tool_name == "strength_analysis" and r.success:
                s = r.output
                return f"""## Chart Executive Summary

**Strongest Placement:** {s['strongest']['planet']} in {s['strongest']['position']} (Score: {s['strongest']['score']}/10)

**Dominant Element:** {s['dominant_element'][0].title()} ({s['dominant_element'][1]} planets)
**Dominant Modality:** {s['dominant_modality'][0].title()} ({s['dominant_modality'][1]} planets)

**Key Patterns:** {', '.join(s['chart_patterns']) if s['chart_patterns'] else 'No major patterns detected'}

**Top 3 Strengths:**
1. {s['ranked_planets'][0]['planet']} — {s['ranked_planets'][0]['key_factors'][0] if s['ranked_planets'][0]['key_factors'] else 'Strong placement'}
2. {s['ranked_planets'][1]['planet']} — {s['ranked_planets'][1]['key_factors'][0] if s['ranked_planets'][1]['key_factors'] else 'Active in chart'}
3. {s['ranked_planets'][2]['planet']} — {s['ranked_planets'][2]['key_factors'][0] if s['ranked_planets'][2]['key_factors'] else 'Well-positioned'}
"""
        return "Chart summary available."

    def _format_comparison(self, intent: Intent, results: List[ToolResult]) -> str:
        """Format comparison response."""
        for r in results:
            if r.tool_name == "comparison" and r.success:
                c = r.output
                return f"""## {c['factor1']['name']} vs {c['factor2']['name']}

| Factor | {c['factor1']['name']} | {c['factor2']['name']} |
|--------|------------------------|------------------------|
| Sign | {c['factor1']['sign']} | {c['factor2']['sign']} |
| House | {c['factor1']['house']} | {c['factor2']['house']} |
| Dignity | {c['factor1']['dignity']} | {c['factor2']['dignity']} |
| Element | {c['factor1'].get('element', 'N/A')} | {c['factor2'].get('element', 'N/A')} |
| Modality | {c['factor1'].get('modality', 'N/A')} | {c['factor2'].get('modality', 'N/A')} |

**Element Compatibility:** {c['element_compatibility']}
**Modality Compatibility:** {c['modality_compatibility']}
**House Relationship:** {c['house_relationship']}

**Synthesis:** {c['synthesis']}
"""
        return "Comparison analysis complete."

    def _format_cards(self, intent: Intent, results: List[ToolResult]) -> str:
        """Format ranked card response."""
        for r in results:
            if r.tool_name == "strength_analysis" and r.success:
                planets = r.output["ranked_planets"][:5]
                cards = []
                for i, p in enumerate(planets, 1):
                    cards.append(f"""### #{i} {p['planet']} — Strength: {p['score']}/10
- **Position:** {p['position']}
- **Why:** {', '.join(p['key_factors']) if p['key_factors'] else 'Balanced placement'}
""")
                return "## Strongest Placements\n\n" + "\n".join(cards)
        return "Strength analysis complete."

    def _get_planet(self, name: str) -> Optional[Any]:
        if not self.chart or not hasattr(self.chart, "planets"):
            return None
        for p in self.chart.planets:
            p_name = p.name if hasattr(p, "name") else (p.get("name", "") if isinstance(p, dict) else "")
            if p_name.lower() == name.lower():
                return p
        return None

    def _p_val(self, p: Any, attr: str, default: Any = "") -> Any:
        if p is None:
            return default
        if hasattr(p, attr):
            return getattr(p, attr)
        if isinstance(p, dict):
            return p.get(attr, default)
        return default

    def _format_sect(self, knowledge: List[str]) -> str:
        sect = getattr(self.chart, "sect", "Diurnal (Day Chart)")
        benefic = getattr(self.chart, "benefic_of_sect", "Jupiter")
        malefic = getattr(self.chart, "malefic_of_sect", "Mars")
        
        b_planet = self._get_planet(benefic)
        m_planet = self._get_planet(malefic)
        sun_planet = self._get_planet("Sun")

        b_pos = f"{self._p_val(b_planet, 'sign')} {self._p_val(b_planet, 'sign_degree', 0.0):.1f}° (House {self._p_val(b_planet, 'house')})" if b_planet else "Active"
        m_pos = f"{self._p_val(m_planet, 'sign')} {self._p_val(m_planet, 'sign_degree', 0.0):.1f}° (House {self._p_val(m_planet, 'house')})" if m_planet else "Active"
        sun_pos = f"{self._p_val(sun_planet, 'sign')} in House {self._p_val(sun_planet, 'house')}" if sun_planet else "Ascendant axis"

        is_day = "diurnal" in sect.lower() or "day" in sect.lower()
        sect_desc = (
            "The Sun is located above the Ascendant-Descendant horizon, imparting solar clarity, objective self-expression, and conscious purpose."
            if is_day else
            "The Sun is located below the Ascendant-Descendant horizon, attuning consciousness to lunar nocturnal mystery, subjective depth, intuition, and reflective wisdom."
        )

        res = f"""## Hellenistic Sect: {sect}

**Solar Status:** {sect_desc} (Sun in {sun_pos})

### 1. In-Sect Benefic: {benefic}
- **Placement:** {b_pos}
- **Traditional Function:** In a {sect}, **{benefic}** acts as your primary ally and protector. It represents your most reliable source of effortless grace, supportive patronages, philosophical expansion, and natural ease.

### 2. Contrary-to-Sect Malefic: {malefic}
- **Placement:** {m_pos}
- **Traditional Function:** **{malefic}** represents your sharpest constructive friction. Because it operates contrary to the primary condition of your chart, its demands require conscious refinement, patience, and mature craftsmanship to master.

---
### Demetra George's Authentic Self Framework
> *"Sect is the fundamental condition that colors every planet in the chart. Planets of the in-sect team have their constructive virtues supported by the optical environment of the nativity, while contrary planets challenge us to do our deepest psychological shadow integration."*
"""
        if knowledge:
            res += "\n**Manuscript References:**\n"
            for k in knowledge[:2]:
                res += f"> {k}\n"
        return res

    def _format_lord_of_chart(self, knowledge: List[str]) -> str:
        ruler = getattr(self.chart, "ascendant_ruler", "Mercury") or "Mercury"
        asc = getattr(self.chart, "ascendant", None)
        asc_sign = self._p_val(asc, "sign", "Ascendant")
        asc_deg = self._p_val(asc, "degree", 0.0)

        lord_p = self._get_planet(ruler)
        lord_sign = self._p_val(lord_p, "sign", "Unknown")
        lord_deg = self._p_val(lord_p, "sign_degree", 0.0)
        lord_house = self._p_val(lord_p, "house", 1)
        lord_dignity = self._p_val(lord_p, "dignity", "peregrine")

        res = f"""## Lord of the Chart: {ruler} (*Oikodespotes*)

- **Ascendant Cusp:** {asc_sign} at {asc_deg:.1f}°
- **Chart Ruler:** **{ruler}**
- **Location:** {lord_sign} {lord_deg:.1f}° in **House {lord_house}**
- **Essential Dignity:** {str(lord_dignity).title()}

### Classical Hellenistic Meaning: Captain of the Ship
In traditional astrological doctrine, your Ascendant represents the physical hull of the ship embarking into the world, while the **Lord of the Ascendant ({ruler})** is the helmsman steering your destiny. 

Because {ruler} is stationed in your **{self._ordinal(lord_house)} House**, your primary life vitality, focus, and authentic soul purpose unfold predominantly through {self._house_topic(lord_house)}.

### Demetra George Authentic Self Guidance
> *"The ruler of the Ascendant shows where and how the native physically engages the world. Its sign reveals the character and temperament with which you meet life, and its house indicates the arena of experience where you feel compelled to anchor your incarnational imprint."*
"""
        if knowledge:
            res += "\n**Manuscript References:**\n"
            for k in knowledge[:2]:
                res += f"> {k}\n"
        return res

    def _format_arabic_lots(self, knowledge: List[str]) -> str:
        p_fortune = getattr(self.chart, "part_of_fortune", {}) or {}
        p_spirit = getattr(self.chart, "part_of_spirit", {}) or {}

        f_sign = p_fortune.get("sign", "Aries") if isinstance(p_fortune, dict) else getattr(p_fortune, "sign", "Aries")
        f_deg = p_fortune.get("sign_degree", 0.0) if isinstance(p_fortune, dict) else getattr(p_fortune, "sign_degree", 0.0)
        f_house = p_fortune.get("house", 1) if isinstance(p_fortune, dict) else getattr(p_fortune, "house", 1)

        s_sign = p_spirit.get("sign", "Libra") if isinstance(p_spirit, dict) else getattr(p_spirit, "sign", "Libra")
        s_deg = p_spirit.get("sign_degree", 0.0) if isinstance(p_spirit, dict) else getattr(p_spirit, "sign_degree", 0.0)
        s_house = p_spirit.get("house", 7) if isinstance(p_spirit, dict) else getattr(p_spirit, "house", 7)

        res = f"""## The Hermetic Lots: Fortune & Spirit

### 1. Lot of Fortune (*Tyche*)
- **Position:** {f_sign} {f_deg:.1f}° (House {f_house})
- **Signification:** Represents the physical body, somatic health, chance encounters, material prosperity, and embodied reality. In House {f_house}, physical wellness and prosperity flourish when aligning with {self._house_topic(f_house)}.

### 2. Lot of Spirit (*Daimon*)
- **Position:** {s_sign} {s_deg:.1f}° (House {s_house})
- **Signification:** Represents the intellect, intentional actions, philosophical agency, and deliberate soul purpose. In House {s_house}, your mental willpower and deliberate works find their greatest realization.

---
> *"The Lot of Fortune reflects what is given to us by bodily fate and chance circumstance, whereas the Lot of Spirit reflects what we choose to create through conscious soul volition."* — Demetra George
"""
        return res

    def _format_nodes(self, knowledge: List[str]) -> str:
        nn = self._get_planet("North Node")
        sn = self._get_planet("South Node")

        nn_sign = self._p_val(nn, "sign", "Unknown")
        nn_deg = self._p_val(nn, "sign_degree", 0.0)
        nn_house = self._p_val(nn, "house", 1)

        sn_sign = self._p_val(sn, "sign", "Unknown")
        sn_deg = self._p_val(sn, "sign_degree", 0.0)
        sn_house = self._p_val(sn, "house", 7)

        res = f"""## Lunar Nodal Axis: Destiny & Karmic Integration

### North Node (*Rahu*) — The Evolutionary Frontier
- **Location:** {nn_sign} {nn_deg:.1f}° in **House {nn_house}**
- **Core Meaning:** The North Node marks your soul's growth edge—unfamiliar, exhilarating, and requiring conscious courage. Moving toward {nn_sign} qualities in {self._house_topic(nn_house)} activates your highest developmental horizon.

### South Node (*Ketu*) — The Inherent Mastery & Past Comfort
- **Location:** {sn_sign} {sn_deg:.1f}° in **House {sn_house}**
- **Core Meaning:** The South Node indicates deeply ingrained talents and past-life instincts. While these gifts come effortlessly, retreating into over-reliance on {sn_sign} patterns in {self._house_topic(sn_house)} leads to spiritual stagnation.

> *"The nodes represent the sacred dragon of transformation: the South Node is the well of seasoned gifts we drink from, while the North Node is the threshold we must step across to mature our authentic self."*
"""
        return res

    def _format_luminaries(self, knowledge: List[str]) -> str:
        sun = self._get_planet("Sun")
        moon = self._get_planet("Moon")

        sun_sign = self._p_val(sun, "sign", "Unknown")
        sun_deg = self._p_val(sun, "sign_degree", 0.0)
        sun_house = self._p_val(sun, "house", 1)

        moon_sign = self._p_val(moon, "sign", "Unknown")
        moon_deg = self._p_val(moon, "sign_degree", 0.0)
        moon_house = self._p_val(moon, "house", 1)

        res = f"""## The Luminaries: Solar Spark & Lunar Vessel

### 1. The Sun — Solar Purpose & Creative Vitality
- **Placement:** {sun_sign} {sun_deg:.1f}° in **House {sun_house}**
- **Core Archetype:** The Sun illuminates your central identity, conscious will, and vocational calling. In {sun_sign} within House {sun_house}, your radiance is cultivated through {self._house_topic(sun_house)}.

### 2. The Moon — Somatic Intuition & Emotional Anchorage
- **Placement:** {moon_sign} {moon_deg:.1f}° in **House {moon_house}**
- **Core Archetype:** The Moon represents the feeling body, unconscious memories, emotional safety, and visceral rhythm. In {moon_sign} within House {moon_house}, your emotional well-being thrives through {self._house_topic(moon_house)}.

> *"When the Solar hero's journey is nourished by Lunar emotional safety, the authentic self emerges with integrity and grounded clarity."* — Demetra George
"""
        return res

    def _house_topic(self, house_num: int) -> str:
        topics = {
            1: "self-actualization, physical vitality, and personal identity",
            2: "cultivating resources, financial autonomy, and inner self-worth",
            3: "daily communications, writing, local community, and sibling ties",
            4: "familial ancestry, home foundations, and internal emotional roots",
            5: "creative expression, joyful progeny, romance, and artistic play",
            6: "daily disciplines, wellness practices, and dedicated service",
            7: "committed partnerships, one-on-one alliances, and relational equality",
            8: "transformative shared resources, psychological depth, and renewal",
            9: "higher learning, spiritual philosophy, and broad horizons",
            10: "public vocation, professional leadership, and social standing",
            11: "visionary alliances, communal networks, and future aspirations",
            12: "interior contemplative solitude, spiritual surrender, and mystical dreams"
        }
        return topics.get(int(house_num), "life developments")

    def _ordinal(self, n: Any) -> str:
        try:
            num = int(n)
            if 11 <= (num % 100) <= 13:
                return f"{num}th"
            rem = num % 10
            if rem == 1:
                return f"{num}st"
            elif rem == 2:
                return f"{num}nd"
            elif rem == 3:
                return f"{num}rd"
            return f"{num}th"
        except Exception:
            return f"{n}th"
