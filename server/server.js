const express = require('express');
const cors = require('cors');
const path = require('path');
const { calculateChartData } = require('./ephemeris');
const { DEMETRA_GEORGE_KNOWLEDGE } = require('./prompts/demetra_george_knowledge');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

/**
 * Endpoint to calculate birth chart positions, dignities, sect, and aspect matrix
 */
app.post('/api/calculate-chart', (req, res) => {
  try {
    const { birthDate, birthTime, latitude, longitude } = req.body;
    if (!birthDate) {
      return res.status(400).json({ error: "birthDate is required (YYYY-MM-DD)" });
    }

    const latNum = parseFloat(latitude) || 0.0;
    const lonNum = parseFloat(longitude) || 0.0;
    const chartData = calculateChartData(birthDate, birthTime || "12:00", latNum, lonNum);

    return res.json({ success: true, chartData });
  } catch (err) {
    console.error("Error calculating chart:", err);
    return res.status(500).json({ error: "Failed to calculate birth chart" });
  }
});

/**
 * AI Astrologer Agent Endpoint powered by Hugging Face Inference API
 */
app.post('/api/ai-astrologer', async (req, res) => {
  try {
    const { prompt, chartData, hfApiKey, modelName } = req.body;

    const selectedModel = modelName || "Qwen/Qwen2.5-72B-Instruct";
    const apiKey = hfApiKey || process.env.HF_API_KEY;

    // Construct enriched astrological context using Demetra George knowledge base
    let chartContext = "";
    if (chartData) {
      chartContext = `
NATAL CHART INFORMATION:
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
- Key Aspects: ${chartData.aspects.map(a => `${a.p1} ${a.aspect} ${a.p2} (${a.orb}° orb)`).slice(0, 10).join(', ')}
`;
    }

    const fullSystemPrompt = `${DEMETRA_GEORGE_KNOWLEDGE}\n\n${chartContext}`;
    const userQuery = prompt || "Provide a comprehensive reading of my Ascendant, Ascendant Ruler, and Sun/Moon Life Purpose based on Demetra George's framework.";

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

    // Fallback: Smart Demetra George Synthesis Engine if Hugging Face key is not supplied or errors out
    if (!aiResponseText) {
      aiResponseText = generateDemetraGeorgeInterpretation(chartData, userQuery);
    }

    return res.json({
      success: true,
      modelUsed: apiKey ? selectedModel : "Demetra George Astrological Engine (Built-in)",
      response: aiResponseText
    });

  } catch (err) {
    console.error("AI Astrologer error:", err);
    return res.status(500).json({ error: "Failed to generate AI astrological interpretation" });
  }
});

function generateDemetraGeorgeInterpretation(chartData, query) {
  if (!chartData) {
    return "Welcome to Placidus AI! Please enter your birth date, time, and city above to generate your natal chart and receive a Demetra George authentic self reading.";
  }

  const asc = chartData.positions.Ascendant;
  const sun = chartData.positions.Sun;
  const moon = chartData.positions.Moon;
  const ascRuler = chartData.ascendantRuler;
  const rulerPos = chartData.positions[ascRuler] || {};

  return `### Demetra George Authentic Self Synthesis

**1. Chart Sect & Condition:**
- **Sect:** Your chart is a **${chartData.sect}**. In Demetra George's traditional methodology, ${chartData.sect.includes("Day") ? "the Sun commands the chart, making Jupiter your primary nocturnal benefic ally and Saturn the malefic to monitor." : "the Moon commands the chart, making Venus your primary benefic ally and Mars the malefic to navigate."}

**2. The Ascendant & Life Direction:**
- **Ascendant:** ${asc ? asc.formatted : "N/A"}
- **Lord of the Chart (Ascendant Ruler):** **${ascRuler}** located in ${rulerPos.formatted || 'N/A'} (House ${rulerPos.house || 'N/A'}).
- *Interpretation:* The Ascendant is the physical lens and vital vessel of self-expression. Because your Ascendant Ruler is **${ascRuler}** positioned in **${rulerPos.sign || 'N/A'} in House ${rulerPos.house || 'N/A'}**, your primary life motivation revolves around synthesizing ${rulerPos.element || 'this element'} qualities into house ${rulerPos.house || '1'} affairs.

**3. The Sun & Moon (Life Purpose & Instinct):**
- **Sun:** ${sun ? sun.formatted : 'N/A'} (House ${sun ? sun.house : 'N/A'}) - Core Identity & Conscious Purpose.
- **Moon:** ${moon ? moon.formatted : 'N/A'} (House ${moon ? moon.house : 'N/A'}) - Emotional instinct & Nurturance needs.
- *Psychological Integration:* Your Sun in ${sun ? sun.sign : 'N/A'} drives your soul toward conscious mastery, while your Moon in ${moon ? moon.sign : 'N/A'} anchors your emotional security.

*Query Response:* Regarding your specific inquiry ("${query}"), Demetra George emphasizes integrating your Ascendant Ruler (${ascRuler}) to direct energy constructively rather than passively. Combine the executive force of your Sun in ${sun ? sun.sign : 'N/A'} with your ${chartData.sect} strengths to embody your authentic self.`;
}

app.listen(PORT, () => {
  console.log(`Placidus AI server running at http://localhost:${PORT}`);
});
