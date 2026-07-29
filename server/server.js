const express = require('express');
const cors = require('cors');
const path = require('path');
const { calculateChartData } = require('./ephemeris');
const { DEMETRA_GEORGE_KNOWLEDGE } = require('./prompts/demetra_george_knowledge');
const { retrieveBookContext } = require('./pdf_retriever');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Built-in city database for instant fallback geocoding
const POPULAR_CITIES = [
  { city: "New York", country: "United States", lat: 40.7128, lon: -74.0060 },
  { city: "London", country: "United Kingdom", lat: 51.5074, lon: -0.1278 },
  { city: "Tokyo", country: "Japan", lat: 35.6762, lon: 139.6503 },
  { city: "Paris", country: "France", lat: 48.8566, lon: 2.3522 },
  { city: "Delhi", country: "India", lat: 28.6139, lon: 77.2090 },
  { city: "Mumbai", country: "India", lat: 19.0760, lon: 72.8777 },
  { city: "Los Angeles", country: "United States", lat: 34.0522, lon: -118.2437 },
  { city: "Sydney", country: "Australia", lat: -33.8688, lon: 151.2093 },
  { city: "Berlin", country: "Germany", lat: 52.5200, lon: 13.4050 },
  { city: "Toronto", country: "Canada", lat: 43.6532, lon: -79.3832 },
  { city: "Cairo", country: "Egypt", lat: 30.0444, lon: 31.2357 },
  { city: "Rio de Janeiro", country: "Brazil", lat: -22.9068, lon: -43.1729 }
];

/**
 * City Geocoding API Endpoint
 */
app.get('/api/geocode', async (req, res) => {
  const query = (req.query.q || "").trim();
  if (!query) {
    return res.json({ success: true, results: POPULAR_CITIES.slice(0, 6) });
  }

  // Check local database match first
  const localMatches = POPULAR_CITIES.filter(c => 
    c.city.toLowerCase().includes(query.toLowerCase()) || 
    c.country.toLowerCase().includes(query.toLowerCase())
  );

  try {
    // Query OpenStreetMap Nominatim API for live geocoding
    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`, {
      headers: { 'User-Agent': 'PlacidusAI/1.0 (Astrology Chart Engine)' }
    });

    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data) && data.length > 0) {
        const results = data.map(item => ({
          city: item.display_name.split(',')[0],
          fullName: item.display_name,
          lat: parseFloat(item.lat),
          lon: parseFloat(item.lon)
        }));
        return res.json({ success: true, results });
      }
    }
  } catch (err) {
    console.warn("Live geocoding warning:", err.message);
  }

  // Return local matches or default
  return res.json({ 
    success: true, 
    results: localMatches.length > 0 ? localMatches : [
      { city: query, fullName: `${query} (Default Coords)`, lat: 28.6139, lon: 77.2090 }
    ] 
  });
});

/**
 * Endpoint to calculate birth chart positions, dignities, sect, and aspect matrix
 */
app.post('/api/calculate-chart', (req, res) => {
  try {
    const { birthDate, birthTime, latitude, longitude, cityName } = req.body;
    if (!birthDate) {
      return res.status(400).json({ error: "birthDate is required (YYYY-MM-DD)" });
    }

    const latNum = parseFloat(latitude) || 28.6139;
    const lonNum = parseFloat(longitude) || 77.2090;
    const chartData = calculateChartData(birthDate, birthTime || "12:00", latNum, lonNum);
    chartData.cityName = cityName || "Specified Location";

    return res.json({ success: true, chartData });
  } catch (err) {
    console.error("Error calculating chart:", err);
    return res.status(500).json({ error: "Failed to calculate birth chart" });
  }
});

/**
 * AI Astrologer Agent Endpoint with PDF Book RAG Retrieval
 */
app.post('/api/ai-astrologer', async (req, res) => {
  try {
    const { prompt, chartData, hfApiKey, modelName } = req.body;

    const selectedModel = modelName || "Qwen/Qwen2.5-72B-Instruct";
    const apiKey = hfApiKey || process.env.HF_API_KEY;

    // RAG: Retrieve exact excerpts from Demetra George PDF book text
    const retrievedPdfExcerpts = retrieveBookContext(prompt, chartData);

    let chartContext = "";
    if (chartData) {
      chartContext = `
NATAL CHART INFORMATION:
- Location: ${chartData.cityName || "Selected City"} (${chartData.birthInfo.latitude}°, ${chartData.birthInfo.longitude}°)
- Date/Time: ${chartData.birthInfo.date} ${chartData.birthInfo.time}
- Chart Sect: ${chartData.sect}
- Lord of the Chart (Ascendant Ruler): ${chartData.ascendantRuler}
- Ascendant: ${chartData.positions.Ascendant ? chartData.positions.Ascendant.formatted : "N/A"}
- Sun: ${chartData.positions.Sun ? chartData.positions.Sun.formatted + " (House " + chartData.positions.Sun.house + ")" : "N/A"}
- Moon: ${chartData.positions.Moon ? chartData.positions.Moon.formatted + " (House " + chartData.positions.Moon.house + ")" : "N/A"}
- Mercury: ${chartData.positions.Mercury ? chartData.positions.Mercury.formatted + " (House " + chartData.positions.Mercury.house + ")" : "N/A"}
- Venus: ${chartData.positions.Venus ? chartData.positions.Venus.formatted + " (House " + chartData.positions.Venus.house + ")" : "N/A"}
- Mars: ${chartData.positions.Mars ? chartData.positions.Mars.formatted + " (House " + chartData.positions.Mars.house + ")" : "N/A"}
- Jupiter: ${chartData.positions.Jupiter ? chartData.positions.Jupiter.formatted + " (House " + chartData.positions.Jupiter.house + ")" : "N/A"}
- Saturn: ${chartData.positions.Saturn ? chartData.positions.Saturn.formatted + " (House " + chartData.positions.Saturn.house + ")" : "N/A"}
- North Node: ${chartData.positions["North Node"] ? chartData.positions["North Node"].formatted + " (House " + chartData.positions["North Node"].house + ")" : "N/A"}
- South Node: ${chartData.positions["South Node"] ? chartData.positions["South Node"].formatted + " (House " + chartData.positions["South Node"].house + ")" : "N/A"}
- Key Aspects: ${chartData.aspects.map(a => `${a.p1} ${a.aspect} ${a.p2} (${a.orb}° orb)`).slice(0, 10).join(', ')}
`;
    }

    const fullSystemPrompt = `
${DEMETRA_GEORGE_KNOWLEDGE}

RETRIEVED EXCERPTS FROM "ASTROLOGY AND THE AUTHENTIC SELF":
===========================================================
${retrievedPdfExcerpts}
===========================================================

INSTRUCTIONS FOR AI ASTROLOGER:
- Synthesize the client's natal chart details using the exact principles and text excerpts from Demetra George provided above.
- Deliver an unvarnished, direct, rigorous, authentic astrological reading strictly based on traditional planetary conditions and modern archetypes.
`;

    const userQuery = prompt || "Provide a comprehensive reading of my North Node, South Node, and Ascendant Ruler based on Demetra George's text.";

    let aiResponseText = "";

    if (apiKey) {
      try {
        const response = await fetch(`https://api-inference.huggingface.co/models/${selectedModel}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            inputs: `<|im_start|>system\n${fullSystemPrompt}<|im_end|>\n<|im_start|>user\n${userQuery}<|im_end|>\n<|im_start|>assistant\n`,
            parameters: {
              max_new_tokens: 1000,
              temperature: 0.7,
              top_p: 0.9,
              return_full_text: false
            }
          })
        });

        if (response.ok) {
          const result = await response.json();
          if (Array.isArray(result) && result[0]?.generated_text) {
            aiResponseText = result[0].generated_text.trim();
          } else if (result.generated_text) {
            aiResponseText = result.generated_text.trim();
          }
        }
      } catch (hfErr) {
        console.warn("Hugging Face API call warning, using built-in Demetra George interpretation engine:", hfErr.message);
      }
    }

    if (!aiResponseText) {
      aiResponseText = generateDemetraGeorgeInterpretation(chartData, userQuery, retrievedPdfExcerpts);
    }

    return res.json({
      success: true,
      modelUsed: apiKey ? selectedModel : "Demetra George RAG Engine (Built-in)",
      response: aiResponseText
    });

  } catch (err) {
    console.error("AI Astrologer error:", err);
    return res.status(500).json({ error: "Failed to generate AI astrological interpretation" });
  }
});

function generateDemetraGeorgeInterpretation(chartData, query, retrievedExcerpts) {
  if (!chartData) {
    return "Welcome to Placidus AI! Select your city, birth date, and time above to generate your natal chart and unlock your Demetra George authentic self analysis.";
  }

  const asc = chartData.positions.Ascendant;
  const sun = chartData.positions.Sun;
  const moon = chartData.positions.Moon;
  const nn = chartData.positions["North Node"];
  const sn = chartData.positions["South Node"];
  const ascRuler = chartData.ascendantRuler;
  const rulerPos = chartData.positions[ascRuler] || {};

  return `### 🌟 Demetra George Authentic Self Synthesis & RAG Analysis

**1. Chart Sect & Condition:**
- **Location:** ${chartData.cityName || "Selected City"}
- **Sect:** Your chart is a **${chartData.sect}**. In Demetra George's methodology, ${chartData.sect.includes("Day") ? "the Sun is the luminary leader above the horizon, empowering Jupiter as your primary benefic ally." : "the Moon is the luminary leader below the horizon, empowering Venus as your primary benefic ally."}

**2. The Ascendant & Lord of the Chart:**
- **Ascendant:** ${asc ? asc.formatted : "N/A"}
- **Lord of the Chart (Ascendant Ruler):** **${ascRuler}** in ${rulerPos.formatted || 'N/A'} (House ${rulerPos.house || 'N/A'}).
- *Life Direction:* Your primary soul motivation is steered by **${ascRuler}** in **${rulerPos.sign || 'N/A'} in House ${rulerPos.house || '1'}**, guiding your physical vital force toward mastering ${rulerPos.element || 'elemental'} self-realization.

**3. Lunar Nodes & Soul Path (North Node & South Node):**
- **North Node (Destiny Direction):** ${nn ? nn.formatted + " (House " + nn.house + ")" : "N/A"}
- **South Node (Innate Gifts & Over-Reliance):** ${sn ? sn.formatted + " (House " + sn.house + ")" : "N/A"}
- *Demetra George Insight:* Chapter 8 highlights that the South Node in ${sn ? sn.sign : 'N/A'} (House ${sn ? sn.house : '1'}) represents innate mastery and comfortable patterns from past conditioning. Your evolutionary growth requires integrating the North Node in ${nn ? nn.sign : 'N/A'} in House ${nn ? nn.house : '1'}—stepping out of habit into conscious purpose.

**4. Sun & Moon Core Integration:**
- **Sun:** ${sun ? sun.formatted : 'N/A'} (House ${sun ? sun.house : '1'}) - Conscious Creative Purpose.
- **Moon:** ${moon ? moon.formatted : 'N/A'} (House ${moon ? moon.house : '1'}) - Emotional Nurturance & Instinct.

---
*Retrieved Book Reference:* 
> "${retrievedExcerpts ? retrievedExcerpts.substring(0, 320).replace(/\n/g, ' ') : 'Demeta George: The natal chart is constructed to facilitate living out your soul purpose.'}..."`;
}

app.listen(PORT, () => {
  console.log(`Placidus AI server running at http://localhost:${PORT}`);
});
