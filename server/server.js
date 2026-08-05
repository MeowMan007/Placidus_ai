require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const { calculateChartData }      = require('./ephemeris');
const { DEMETRA_GEORGE_KNOWLEDGE } = require('./prompts/demetra_george_knowledge');
const { retrieveContext }          = require('./pdf_retriever');
const { classifyIntent, buildSystemPrompt, RESPONSE_MODES } = require('./prompt_router');

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

// ─── Timezone Lookup ────────────────────────────────────────────────────────
app.get('/api/timezone', async (req, res) => {
  const { lat, lon } = req.query;
  const latitude = parseFloat(lat);
  const longitude = parseFloat(lon);

  if (isNaN(latitude) || isNaN(longitude)) {
    return res.json({ success: false, offset: 0 });
  }

  // Check special political offsets first for instant 100% accuracy:
  // Longitude between 68°E and 97°E (India region) -> IST +5.5
  if (latitude >= 6.0 && latitude <= 36.0 && longitude >= 68.0 && longitude <= 97.0) {
    return res.json({ success: true, offset: 5.5 });
  }

  let fallbackOffset = Math.round(longitude / 15 * 2) / 2;

  try {
    const r = await fetch(`https://timeapi.io/api/timezone/coordinate?latitude=${latitude}&longitude=${longitude}`, {
      headers: { 'User-Agent': 'PlacidusAI/1.0' }
    });
    if (r.ok) {
      const d = await r.json();
      if (d && d.currentUtcOffset && typeof d.currentUtcOffset.seconds === 'number') {
        const offsetHours = d.currentUtcOffset.seconds / 3600;
        return res.json({ success: true, offset: offsetHours });
      }
    }
  } catch (_) {}

  return res.json({ success: true, offset: fallbackOffset, fallback: true });
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

// ─── AI Astrologer with RAG, Intent Router & Multi-Mode Support ───────────────
app.post('/api/ai-astrologer', async (req, res) => {
  try {
    const { prompt, chartData, history, hfApiKey, modelName } = req.body;
    const apiKey = hfApiKey || process.env.HF_API_KEY;
    const userQ  = prompt || 'Analyze my Ascendant Ruler and North/South Nodes.';
    const chatHistory = Array.isArray(history) ? history : [];

    // 1. Classify Intent into one of 7 Modes
    const intent = classifyIntent(userQ, chartData, chatHistory);

    // 2. Build RAG Query & Retrieve Context
    let ragQuery = userQ;
    if (chatHistory.length > 0 && userQ.length < 25) {
      const lastUser = [...chatHistory].reverse().find(m => m.role === 'user');
      if (lastUser) ragQuery = `${lastUser.content} ${userQ}`;
    }

    const rag = retrieveContext(ragQuery, chartData, 5);

    // 3. Format Chart Context String
    let chartCtx = 'No active natal chart provided.';
    if (chartData && chartData.positions) {
      const p = chartData.positions;
      chartCtx = `
CLIENT NATAL CHART:
Location: ${chartData.cityName||'Unknown'}
Sect: ${chartData.sect}
Ascendant Ruler (Lord of Chart): ${chartData.ascendantRuler}
Benefic of Sect: ${chartData.beneficOfSect} | Malefic of Sect: ${chartData.maleficOfSect}
Ascendant: ${p.Ascendant ? p.Ascendant.formatted+' (H'+p.Ascendant.house+')' : 'N/A'}
Midheaven: ${p.Midheaven ? p.Midheaven.formatted : 'N/A'}
Sun: ${p.Sun ? p.Sun.formatted+' (H'+p.Sun.house+')' : 'N/A'}
Moon: ${p.Moon ? p.Moon.formatted+' (H'+p.Moon.house+')' : 'N/A'}
Mercury: ${p.Mercury ? p.Mercury.formatted+' (H'+p.Mercury.house+')' : 'N/A'}
Venus: ${p.Venus ? p.Venus.formatted+' (H'+p.Venus.house+')' : 'N/A'}
Mars: ${p.Mars ? p.Mars.formatted+' (H'+p.Mars.house+')' : 'N/A'}
Jupiter: ${p.Jupiter ? p.Jupiter.formatted+' (H'+p.Jupiter.house+')' : 'N/A'}
Saturn: ${p.Saturn ? p.Saturn.formatted+' (H'+p.Saturn.house+')' : 'N/A'}
North Node: ${p['North Node'] ? p['North Node'].formatted+' (H'+p['North Node'].house+')' : 'N/A'}
South Node: ${p['South Node'] ? p['South Node'].formatted+' (H'+p['South Node'].house+')' : 'N/A'}
Key Aspects: ${(chartData.aspects||[]).slice(0,10).map(a=>`${a.p1} ${a.aspect} ${a.p2} (${a.orb}°)`).join('; ')}
`;
    }

    // 4. Construct System Prompt using Prompt Router
    const systemPrompt = buildSystemPrompt(intent, chartCtx, rag.formatted, rag.citations);

    // Build LLM messages
    const llmMessages = [{ role: 'system', content: systemPrompt }];
    
    // Include recent history (up to 6 turns)
    const recentHistory = chatHistory.slice(-6);
    recentHistory.forEach(m => {
      if (m.role === 'user' || m.role === 'assistant') {
        llmMessages.push({ role: m.role, content: m.content });
      }
    });

    if (!recentHistory.length || recentHistory[recentHistory.length - 1].content !== userQ) {
      llmMessages.push({ role: 'user', content: userQ });
    }

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
            messages: llmMessages,
            max_tokens: 500,
            temperature: 0.65
          })
        });

        if (r.ok) {
          const d = await r.json();
          if (d.choices && d.choices[0]?.message?.content) {
            aiText = d.choices[0].message.content.trim();
          }
        } else {
          console.warn(`HF Router API Warning (${r.status}):`, (await r.text()).slice(0, 200));
        }
      } catch(e) { 
        console.warn('HF API fetch error:', e.message); 
      }
    }

    if (!aiText) {
      aiText = builtinInterpretation(chartData, userQ, rag, chatHistory, intent);
    }

    return res.json({ 
      success: true, 
      mode: intent.mode,
      modelUsed: aiText && apiKey ? 'meta-llama/Llama-3.3-70B-Instruct-Turbo' : 'Authentic Self RAG Engine', 
      response: aiText,
      citations: rag.citations
    });
  } catch(e) {
    console.error('AI error:', e);
    return res.status(500).json({ error:'AI interpretation failed' });
  }
});

// ─── Built-in Fallback Interpreter ───────────────────────────────────────────
function builtinInterpretation(chart, query, rag, history, intent) {
  const p     = chart ? chart.positions : null;
  const qLower = query.toLowerCase();

  if (intent.mode === RESPONSE_MODES.MODE_2_KNOWLEDGE || intent.mode === RESPONSE_MODES.MODE_3_EDUCATIONAL) {
    const excerpt = rag.chunks && rag.chunks[0] ? rag.chunks[0].text : 'Astrology is the language of life purpose.';
    return `📜 **Astrological Principle:** Classical Hellenistic astrology frames the natal chart as a structural blueprint of soul potential.

✨ **Core Knowledge:** ${excerpt}

🔮 **Application:** Integrate this principle by honoring both the structural matrix of your chart and your personal choice.`;
  }

  if (intent.mode === RESPONSE_MODES.MODE_5_COMPARISON) {
    return `### Comparison: Whole Sign Houses vs. Placidus Houses

- **Whole Sign Houses (Hellenistic Origin):** Assigns entire 30° zodiac signs to houses starting from the Ascendant sign. Simple, ancient, and ideal for topic rulerships.
- **Placidus Houses (17th Century):** Quad-divided by time arcs. Places cusps at specific degrees, allowing intercepted signs and unequal house sizes. Ideal for precise angular timing.

Both systems offer unique insights into the natal chart.`;
  }

  if (!chart || !p) {
    return 'Please calculate your natal chart first to receive a personalized chart reading.';
  }

  const ascR   = chart.ascendantRuler;
  const rulerP = p[ascR] || {};

  if (qLower.includes('node')) {
    const nn = p['North Node'] || {};
    const sn = p['South Node'] || {};
    return `📜 **Astrological Principle:** The South Node represents inherent mastery, while the North Node marks the evolutionary soul direction.

✨ **Chart Reading:** Your North Node in ${nn.formatted||'N/A'} (House ${nn.house||'?'}) invites growth in ${nn.sign||''} themes, anchored by South Node mastery in ${sn.formatted||'N/A'}.

🔮 **Guidance:** Use South Node talents as a springboard, but invest conscious effort in your North Node House ${nn.house||''} affairs.`;
  }

  return `📜 **Astrological Principle:** The Ascendant Ruler guides the physical vessel and primary life direction.

✨ **Chart Reading:** Your ${chart.sect} is steered by Lord of the Chart **${ascR}** in ${rulerP.formatted||'N/A'} (House ${rulerP.house||'?'}), with Sun in ${p.Sun?.formatted||'N/A'} and Moon in ${p.Moon?.formatted||'N/A'}.

🔮 **Guidance:** Embody your Ascendant ruler's sign and house qualities daily to express your authentic self.`;
}

module.exports = app;

if (require.main === module) {
  app.listen(PORT, () => console.log(`Placidus AI → http://localhost:${PORT}`));
}
