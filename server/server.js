require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const { calculateChartData }      = require('./ephemeris');
const { DEMETRA_GEORGE_KNOWLEDGE } = require('./prompts/demetra_george_knowledge');
const { retrieveContext }          = require('./pdf_retriever');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// ─── Built-in City Database ──────────────────────────────────────────────────
const POPULAR_CITIES = [
  { city:'New York',      country:'US', lat:40.7128,  lon:-74.0060 },
  { city:'London',        country:'UK', lat:51.5074,  lon: -0.1278 },
  { city:'Tokyo',         country:'JP', lat:35.6762,  lon:139.6503 },
  { city:'Paris',         country:'FR', lat:48.8566,  lon:  2.3522 },
  { city:'Delhi',         country:'IN', lat:28.6139,  lon: 77.2090 },
  { city:'Mumbai',        country:'IN', lat:19.0760,  lon: 72.8777 },
  { city:'Hapur',         country:'IN', lat:28.7307,  lon: 77.7787 },
  { city:'Los Angeles',   country:'US', lat:34.0522,  lon:-118.2437},
  { city:'Sydney',        country:'AU', lat:-33.8688, lon:151.2093 },
  { city:'Berlin',        country:'DE', lat:52.5200,  lon: 13.4050 },
  { city:'Toronto',       country:'CA', lat:43.6532,  lon:-79.3832 },
  { city:'São Paulo',     country:'BR', lat:-23.5505, lon:-46.6333 },
  { city:'Dubai',         country:'AE', lat:25.2048,  lon: 55.2708 },
  { city:'Singapore',     country:'SG', lat: 1.3521,  lon:103.8198 },
  { city:'Istanbul',      country:'TR', lat:41.0082,  lon: 28.9784 },
];

// ─── Geocode ─────────────────────────────────────────────────────────────────
app.get('/api/geocode', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json({ success:true, results: POPULAR_CITIES.slice(0,8) });

  const local = POPULAR_CITIES.filter(c =>
    c.city.toLowerCase().includes(q.toLowerCase()) ||
    c.country.toLowerCase().includes(q.toLowerCase())
  );

  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5`,
      { headers:{ 'User-Agent':'PlacidusAI/1.0' } }
    );
    if (r.ok) {
      const d = await r.json();
      if (Array.isArray(d) && d.length) {
        return res.json({ success:true, results: d.map(i => ({
          city: i.display_name.split(',')[0],
          fullName: i.display_name,
          lat: parseFloat(i.lat), lon: parseFloat(i.lon)
        }))});
      }
    }
  } catch (_) {}

  return res.json({ success:true, results: local.length ? local : [
    { city:q, fullName:q+' (Default)', lat:28.6139, lon:77.2090 }
  ]});
});

// ─── Calculate Chart ─────────────────────────────────────────────────────────
app.post('/api/calculate-chart', (req, res) => {
  try {
    const { birthDate, birthTime, latitude, longitude, cityName, timezoneOffset } = req.body;
    if (!birthDate) return res.status(400).json({ error:'birthDate required' });

    const chart = calculateChartData(
      birthDate, birthTime||'12:00',
      parseFloat(latitude)||28.6139, parseFloat(longitude)||77.2090,
      timezoneOffset !== undefined ? parseFloat(timezoneOffset) : undefined
    );
    chart.cityName = cityName || 'Selected City';
    return res.json({ success:true, chartData: chart });
  } catch(e) {
    console.error('Chart calc error:', e);
    return res.status(500).json({ error:'Failed to calculate chart' });
  }
});

// ─── AI Astrologer with RAG ──────────────────────────────────────────────────
app.post('/api/ai-astrologer', async (req, res) => {
  try {
    const { prompt, chartData, hfApiKey, modelName } = req.body;
    const model  = modelName || 'Qwen/Qwen2.5-72B-Instruct';
    const apiKey = hfApiKey  || process.env.HF_API_KEY;

    // ── RAG: Retrieve book excerpts ──
    const rag = retrieveContext(prompt, chartData, 4);

    // ── Build chart context string ──
    let chartCtx = '';
    if (chartData && chartData.positions) {
      const p = chartData.positions;
      chartCtx = `
CLIENT NATAL CHART:
City: ${chartData.cityName||''}
Sect: ${chartData.sect}
Ascendant Ruler (Lord of Chart): ${chartData.ascendantRuler}
Ascendant: ${p.Ascendant ? p.Ascendant.formatted+' H'+p.Ascendant.house : ''}
MC: ${p.Midheaven ? p.Midheaven.formatted : ''}
Sun: ${p.Sun ? p.Sun.formatted+' H'+p.Sun.house : ''}
Moon: ${p.Moon ? p.Moon.formatted+' H'+p.Moon.house : ''}
Mercury: ${p.Mercury ? p.Mercury.formatted+' H'+p.Mercury.house : ''}
Venus: ${p.Venus ? p.Venus.formatted+' H'+p.Venus.house : ''}
Mars: ${p.Mars ? p.Mars.formatted+' H'+p.Mars.house : ''}
Jupiter: ${p.Jupiter ? p.Jupiter.formatted+' H'+p.Jupiter.house : ''}
Saturn: ${p.Saturn ? p.Saturn.formatted+' H'+p.Saturn.house : ''}
Uranus: ${p.Uranus ? p.Uranus.formatted+' H'+p.Uranus.house : ''}
Neptune: ${p.Neptune ? p.Neptune.formatted+' H'+p.Neptune.house : ''}
Pluto: ${p.Pluto ? p.Pluto.formatted+' H'+p.Pluto.house : ''}
North Node: ${p['North Node'] ? p['North Node'].formatted+' H'+p['North Node'].house : ''}
South Node: ${p['South Node'] ? p['South Node'].formatted+' H'+p['South Node'].house : ''}
Key Aspects: ${(chartData.aspects||[]).slice(0,12).map(a=>`${a.p1} ${a.aspect} ${a.p2} (${a.orb}°)`).join('; ')}
`;
    }

    // ── Full system prompt with RAG context ──
    const systemPrompt = `${DEMETRA_GEORGE_KNOWLEDGE}

RETRIEVED EXCERPTS FROM "ASTROLOGY AND THE AUTHENTIC SELF" BY DEMETRA GEORGE:
====
${rag.formatted}
====

${chartCtx}

RESPONSE FORMAT RULES (MANDATORY):
1. You MUST answer in EXACTLY ~100 words, structured in 3 sections:
   📜 BOOK INSIGHT: 1-2 sentences quoting or paraphrasing the retrieved book text above.
   ✨ CHART READING: 2-3 sentences analyzing the client's specific placements.
   🔮 GUIDANCE: 1 sentence actionable authentic-self recommendation.
2. Be direct, authoritative, no disclaimers, no fluff.
3. Reference specific placements (signs, houses, degrees) from the chart data.
`;

    const userQ = prompt || 'Analyze my Ascendant Ruler and North/South Nodes.';
    let aiText = '';

    if (apiKey) {
      try {
        const targetModel = modelName || 'meta-llama/Llama-3.3-70B-Instruct-Turbo';
        const r = await fetch('https://router.huggingface.co/together/v1/chat/completions', {
          method: 'POST',
          headers: { 
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: targetModel,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userQ }
            ],
            max_tokens: 350,
            temperature: 0.65
          })
        });

        if (r.ok) {
          const d = await r.json();
          if (d.choices && d.choices[0]?.message?.content) {
            aiText = d.choices[0].message.content.trim();
          }
        } else {
          const errBody = await r.text();
          console.warn(`HF Router API Warning (${r.status}):`, errBody.slice(0, 200));
        }
      } catch(e) { 
        console.warn('HF API fetch error:', e.message); 
      }
    }

    if (!aiText) {
      console.log('Using RAG Fallback interpretation');
      aiText = builtinInterpretation(chartData, userQ, rag);
    }

    return res.json({ 
      success: true, 
      modelUsed: aiText && apiKey ? 'meta-llama/Llama-3.3-70B-Instruct-Turbo (via HF Router)' : 'Demetra George RAG Engine', 
      response: aiText 
    });
  } catch(e) {
    console.error('AI error:', e);
    return res.status(500).json({ error:'AI interpretation failed' });
  }
});

// ─── Built-in fallback interpretation ────────────────────────────────────────
function builtinInterpretation(chart, query, rag) {
  if (!chart || !chart.positions) {
    return 'Please calculate your birth chart first to receive a Demetra George analysis.';
  }

  const p       = chart.positions;
  const qLower  = query.toLowerCase();
  const ascR    = chart.ascendantRuler;
  const rulerP  = p[ascR] || {};

  // Pick a relevant excerpt snippet from retrieved chunks
  const snippet = rag.chunks && rag.chunks[0]
    ? rag.chunks[0].text.slice(0,180).replace(/\s+/g,' ')
    : 'The natal chart is a blueprint of the authentic self.';

  if (qLower.includes('node') || qLower.includes('destiny') || qLower.includes('karma')) {
    const nn = p['North Node'] || {};
    const sn = p['South Node'] || {};
    return `📜 **Book Insight:** Demetra George writes in Chapter 8 that the South Node represents innate mastery and comfortable past patterns, while the North Node marks the evolutionary direction the soul must consciously pursue. "${snippet}..."

✨ **Chart Reading:** Your North Node in ${nn.formatted||'N/A'} (House ${nn.house||'?'}) calls you toward growth through ${nn.sign||'N/A'} qualities, while your South Node in ${sn.formatted||'N/A'} (House ${sn.house||'?'}) shows familiar ${sn.sign||''} habits to release.

🔮 **Guidance:** Channel your South Node talents as a foundation, but invest daily effort into your North Node house ${nn.house||''} affairs.`;
  }

  if (qLower.includes('ascendant') || qLower.includes('ruler') || qLower.includes('lord')) {
    return `📜 **Book Insight:** Chapter 4 designates the Ascendant Ruler as the "Lord of the Chart," the planet that steers the physical vessel and primary life direction. "${snippet}..."

✨ **Chart Reading:** With your Ascendant in ${p.Ascendant?.formatted||'N/A'}, ${ascR} is your chart ruler, placed in ${rulerP.formatted||'N/A'} (House ${rulerP.house||'?'}). This directs your vital force toward House ${rulerP.house||''} matters in a ${rulerP.element||''} manner.

🔮 **Guidance:** Align daily actions with ${ascR}'s house placement to manifest your authentic life direction.`;
  }

  if (qLower.includes('sun') || qLower.includes('moon') || qLower.includes('purpose')) {
    const sun  = p.Sun  || {};
    const moon = p.Moon || {};
    return `📜 **Book Insight:** In Chapter 5, Demetra George identifies the Sun as conscious creative purpose and the Moon as emotional instinct and nurturance needs. "${snippet}..."

✨ **Chart Reading:** Your Sun in ${sun.formatted||'N/A'} (House ${sun.house||'?'}) drives identity through ${sun.sign||''} themes. Your Moon in ${moon.formatted||'N/A'} (House ${moon.house||'?'}) anchors emotional security in ${moon.sign||''} expression.

🔮 **Guidance:** Integrate your Sun's conscious drive with your Moon's instinctive needs to embody authentic wholeness.`;
  }

  if (qLower.includes('sect') || qLower.includes('benefic') || qLower.includes('malefic')) {
    return `📜 **Book Insight:** Chapter 2 teaches that a ${chart.sect} uses ${chart.beneficOfSect} as the sect benefic and ${chart.maleficOfSect} as the sect malefic. "${snippet}..."

✨ **Chart Reading:** Your chart is a **${chart.sect}**. ${chart.beneficOfSect} (${p[chart.beneficOfSect]?.formatted||'N/A'}, H${p[chart.beneficOfSect]?.house||'?'}) is your greatest planetary ally, while ${chart.maleficOfSect} (${p[chart.maleficOfSect]?.formatted||'N/A'}, H${p[chart.maleficOfSect]?.house||'?'}) requires careful navigation.

🔮 **Guidance:** Lean into ${chart.beneficOfSect}'s house matters for maximum ease and authentic self-expression.`;
  }

  if (qLower.includes('aspect') || qLower.includes('pattern') || qLower.includes('geometry')) {
    const top5 = (chart.aspects||[]).slice(0,5).map(a => `${a.p1} ${a.symbol} ${a.p2} (${a.orb}°)`).join(', ');
    return `📜 **Book Insight:** Chapter 10 describes how aspect patterns reveal the dynamic relationships between planetary characters — trines flow, squares challenge growth. "${snippet}..."

✨ **Chart Reading:** Your key aspects include: ${top5}. These configurations shape how your planetary energies interact and express through your houses.

🔮 **Guidance:** Work with your trine/sextile gifts while consciously engaging your square/opposition challenges as catalysts for growth.`;
  }

  // Default comprehensive
  return `📜 **Book Insight:** The natal chart is a living blueprint where traditional planetary conditions provide structure and modern archetypes reveal soul potential. "${snippet}..."

✨ **Chart Reading:** Your ${chart.sect} chart is ruled by ${ascR} (${rulerP.formatted||'N/A'}, H${rulerP.house||'?'}), with Sun in ${p.Sun?.formatted||'N/A'} and Moon in ${p.Moon?.formatted||'N/A'} guiding conscious and emotional life.

🔮 **Guidance:** Embody your Ascendant ruler's sign and house qualities daily to express your authentic self with clarity.`;
}

app.listen(PORT, () => console.log(`Placidus AI → http://localhost:${PORT}`));
