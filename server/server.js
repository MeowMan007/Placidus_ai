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
  { city: "Toronto", country: "Canada", lat: 43.6532, lon: -79.3832 }
];

/**
 * City Geocoding API Endpoint
 */
app.get('/api/geocode', async (req, res) => {
  const query = (req.query.q || "").trim();
  if (!query) {
    return res.json({ success: true, results: POPULAR_CITIES.slice(0, 6) });
  }

  const localMatches = POPULAR_CITIES.filter(c => 
    c.city.toLowerCase().includes(query.toLowerCase()) || 
    c.country.toLowerCase().includes(query.toLowerCase())
  );

  try {
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

  return res.json({ 
    success: true, 
    results: localMatches.length > 0 ? localMatches : [
      { city: query, fullName: `${query} (Default Coords)`, lat: 28.6139, lon: 77.2090 }
    ] 
  });
});

/**
 * Calculate birth chart endpoint
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
    chartData.cityName = cityName || "Selected City";

    return res.json({ success: true, chartData });
  } catch (err) {
    console.error("Error calculating chart:", err);
    return res.status(500).json({ error: "Failed to calculate birth chart" });
  }
});

/**
 * AI Astrologer Agent Endpoint with PDF Book RAG Retrieval & Structured ~100-Word Output
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
CLIENT NATAL CHART:
- City: ${chartData.cityName || "Selected City"}
- Sect: ${chartData.sect}
- Ascendant Ruler: ${chartData.ascendantRuler}
- Ascendant: ${chartData.positions.Ascendant ? chartData.positions.Ascendant.formatted : "N/A"}
- Sun: ${chartData.positions.Sun ? chartData.positions.Sun.formatted + " (H" + chartData.positions.Sun.house + ")" : "N/A"}
- Moon: ${chartData.positions.Moon ? chartData.positions.Moon.formatted + " (H" + chartData.positions.Moon.house + ")" : "N/A"}
- North Node: ${chartData.positions["North Node"] ? chartData.positions["North Node"].formatted + " (H" + chartData.positions["North Node"].house + ")" : "N/A"}
- South Node: ${chartData.positions["South Node"] ? chartData.positions["South Node"].formatted + " (H" + chartData.positions["South Node"].house + ")" : "N/A"}
`;
    }

    const fullSystemPrompt = `
${DEMETRA_GEORGE_KNOWLEDGE}

RETRIEVED EXCERPTS FROM "ASTROLOGY AND THE AUTHENTIC SELF":
${retrievedPdfExcerpts}

STRICT OUTPUT FORMAT RULES:
1. RESPONSE MUST BE IN A STRUCTURED ~100-WORD FORMAT.
2. USE EXACTLY THREE SECTIONS:
   - 📜 DEMETRA GEORGE RULE: (1-2 sentences on the book principle)
   - ✨ CHART SYNTHESIS: (1-2 sentences analyzing client's specific placement)
   - 🔮 SOUL TAKEAWAY: (1 sentence actionable authentic self recommendation)
3. DO NOT ADD EXTRA FLUFF OR DISCLAIMERS. KEEP TOTAL WORDS AROUND 100 WORDS.
`;

    const userQuery = prompt || "Analyze my North Node, South Node, and Ascendant Ruler based on Demetra George's text.";

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
              max_new_tokens: 300,
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
      aiResponseText = generateStructured100WordInterpretation(chartData, userQuery, retrievedPdfExcerpts);
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

function generateStructured100WordInterpretation(chartData, query, retrievedExcerpts) {
  if (!chartData) {
    return "Please calculate your birth chart to unlock your Demetra George structured 100-word analysis.";
  }

  const asc = chartData.positions.Ascendant;
  const nn = chartData.positions["North Node"];
  const sn = chartData.positions["South Node"];
  const ascRuler = chartData.ascendantRuler;
  const rulerPos = chartData.positions[ascRuler] || {};

  const queryLower = query.toLowerCase();

  if (queryLower.includes("node")) {
    return `### 📜 Demetra George Rule
Chapter 8 states that the South Node marks innate past mastery and comfortable habits, while the North Node demands stepping into uncharted growth for soul evolution.

### ✨ Chart Synthesis
Your South Node in ${sn ? sn.sign + " (House " + sn.house + ")" : "N/A"} represents familiar patterns to release, while your North Node in ${nn ? nn.sign + " (House " + nn.house + ")" : "N/A"} challenges you to embrace your true calling.

### 🔮 Soul Takeaway
Integrate your South Node talents as a springboard, but focus conscious effort toward your North Node in ${nn ? nn.sign : 'N/A'}.`;
  }

  if (queryLower.includes("ruler") || queryLower.includes("ascendant")) {
    return `### 📜 Demetra George Rule
Chapter 4 designates the Ascendant Ruler as the 'Lord of the Chart', steering the physical vessel and primary life direction of the authentic self.

### ✨ Chart Synthesis
With Ascendant in ${asc ? asc.sign : 'N/A'}, your chart ruler **${ascRuler}** resides in ${rulerPos.sign || 'N/A'} in House ${rulerPos.house || '1'}, directing vital energy toward house ${rulerPos.house || '1'} affairs.

### 🔮 Soul Takeaway
Align daily choices with ${ascRuler}'s house placement to manifest your natural vitality and purpose.`;
  }

  return `### 📜 Demetra George Rule
The natal chart is a living blueprint where traditional planetary conditions establish the structure and modern archetypes reveal soul potential.

### ✨ Chart Synthesis
Your ${chartData.sect} chart relies on ${chartData.ascendantRuler} as chart ruler, anchored by Sun in ${chartData.positions.Sun ? chartData.positions.Sun.sign : 'N/A'} for conscious direction.

### 🔮 Soul Takeaway
Embody your Ascendant ruler's qualities daily to express your authentic self with alignment and purpose.`;
}

app.listen(PORT, () => {
  console.log(`Placidus AI server running at http://localhost:${PORT}`);
});
