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
        """Detect intent from user message."""
        message_lower = message.lower()
        scores = {}
        entities = {"planets": [], "houses": [], "concepts": []}

        # Extract entities
        all_planets = ["sun", "moon", "mercury", "venus", "mars", 
                       "jupiter", "saturn", "uranus", "neptune", "pluto",
                       "chiron", "north node", "south node"]
        for p in all_planets:
            if p in message_lower:
                entities["planets"].append(p.title())

        house_nums = re.findall(r'(\d+)(?:st|nd|rd|th)?\s+house', message_lower)
        entities["houses"] = [int(h) for h in house_nums]

        # Score each intent
        for intent, patterns in self.PATTERNS.items():
            score = 0
            for pattern in patterns:
                matches = re.findall(pattern, message_lower)
                if matches:
                    score += len(matches) * 0.3
            scores[intent] = min(score, 1.0)

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

    def _generate_response(self, message: str, intent: Intent, 
                          tool_results: List[ToolResult], 
                          citations: List[Citation],
                          mode: str) -> str:
        """
        Generate final response by combining tool outputs and RAG context.
        In production, this prompts an LLM with structured context.
        Here we use template-based generation with RAG augmentation.
        """
        # Build context from tool results
        context_parts = []
        for result in tool_results:
            if result.success:
                context_parts.append(f"[{result.tool_name}]\n{json.dumps(result.output, indent=2)}")

        # Build knowledge context from RAG
        knowledge_parts = []
        for c in citations[:3]:
            knowledge_parts.append(f"From {c.source}, {c.chapter}: {c.text[:200]}...")

        # Traditional Hellenistic & Demetra George specialized routes
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

        # Template-based response generation
        # In production, this is replaced with LLM generation
        if mode == "table":
            return self._format_table(intent, tool_results, knowledge_parts)
        elif mode == "detailed":
            return self._format_detailed(intent, tool_results, knowledge_parts)
        elif mode == "summary":
            return self._format_summary(intent, tool_results)
        elif mode == "comparison":
            return self._format_comparison(intent, tool_results)
        elif mode == "cards":
            return self._format_cards(intent, tool_results)
        else:
            return self._format_detailed(intent, tool_results, knowledge_parts)

    def _format_table(self, intent: Intent, results: List[ToolResult], knowledge: Optional[List[str]] = None) -> str:
        """Format response as markdown table."""
        for r in results:
            if r.tool_name == "planet_interpretation" and r.success:
                p = r.output
                return f"""## {p['planet']} Placement

| Attribute | Value |
|-----------|-------|
| Sign | {p['sign_expression']} |
| Degree | {p['position']} |
| House | {p['house']} |
| Dignity | {p['dignity']} |
| Retrograde | {'Yes' if p['retrograde'] else 'No'} |
| Nakshatra | {p['nakshatra']} |
| Core Meaning | {p['core_meaning']} |
| House Significance | {p['house_significance']} |
| Dignity Assessment | {p['dignity_assessment']} |
"""
        return self._format_detailed(intent, results, knowledge or [])

    def _format_detailed(self, intent: Intent, results: List[ToolResult], 
                        knowledge: List[str]) -> str:
        """Format detailed interpretive response."""
        sections = []

        for r in results:
            if r.tool_name == "planet_interpretation" and r.success:
                p = r.output
                sections.append(f"""### {p['planet']} in {p['position']} (House {p['house']})

**Core Archetype:** {p['core_meaning']}

**Sign Expression:** {p['sign_expression']}

**House Domain:** {p['house_significance']}

**Dignity Status:** {p['dignity']} — {p['dignity_assessment']}

**Vedic Indicator:** {p['nakshatra']}

**Aspects:** {len(p['aspects_to_planet'])} major aspect(s) configured.
""")
            elif r.tool_name == "rag_search" and r.success:
                if knowledge:
                    sections.append("### Traditional Teachings\n")
                    for k in knowledge[:2]:
                        sections.append(f"> {k}\n")

        if not sections:
            if knowledge:
                sections.append("### Traditional Teachings\n")
                for k in knowledge[:3]:
                    sections.append(f"> {k}\n")
            elif not self.chart:
                sections.append("To analyze your specific birth chart placements, please generate your natal chart first on the Chart tab. You can also ask any general questions about zodiac signs, planets, houses, and astrological concepts.")
            else:
                sections.append("I've analyzed your chart. Please ask a more specific question for detailed interpretation.")

        return "\n".join(sections)

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
