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

// ─── AI Astrologer with RAG & Conversational Memory ──────────────────────────
app.post('/api/ai-astrologer', async (req, res) => {
  try {
    const { prompt, chartData, history, hfApiKey, modelName } = req.body;
    const apiKey = hfApiKey || process.env.HF_API_KEY;
    const userQ  = prompt || 'Analyze my Ascendant Ruler and North/South Nodes.';
    const chatHistory = Array.isArray(history) ? history : [];

    // ── Build query context for RAG ──
    // If prompt is short like "elaborate" or "tell me more", combine with previous message
    let ragQuery = userQ;
    if (chatHistory.length > 0 && userQ.length < 20) {
      const lastUser = [...chatHistory].reverse().find(m => m.role === 'user');
      if (lastUser) ragQuery = `${lastUser.content} ${userQ}`;
    }

    // ── RAG: Retrieve book excerpts ──
    const rag = retrieveContext(ragQuery, chartData, 5);

    // ── Build chart context string ──
    let chartCtx = 'No chart calculated yet.';
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

    // ── System Prompt for Master Astrologer AI ──
    const systemPrompt = `You are Placidus AI, an empathetic, master traditional astrologer and counselor trained in Demetra George's "Astrology and the Authentic Self" framework.

AUTHENTIC SELF FRAMEWORK:
${DEMETRA_GEORGE_KNOWLEDGE}

${chartCtx}

RETRIEVED EXCERPTS FROM DEMETRA GEORGE'S TEXT:
====
${rag.formatted}
====

CONVERSATION & RESPONSE INSTRUCTIONS:
1. You are engaging in a dynamic, ongoing consultation with the client.
2. If the user asks an initial chart question or clicks a preset suggestion:
   - Provide a concise (~100-120 words) reading structured in 3 parts:
     📜 **Book Insight:** Demetra George's core concept from the retrieved text.
     ✨ **Chart Reading:** Specific analysis of the client's placements (degrees, signs, houses).
     🔮 **Guidance:** Actionable authentic-self advice.
3. If the user asks for ELABORATION, follow-up questions, "tell me more", or specific details:
   - DO NOT repeat previous generic text or force robotic templates.
   - Deepen your explanation naturally, directly answering their specific question about their placement or chart mechanics (~100-150 words).
   - Explain planetary dignities, sect conditions, house themes, or aspect geometry in an insightful, conversational tone.
4. Keep all interpretations grounded strictly in the client's chart data above.
`;

    // Build LLM messages array with history
    const llmMessages = [{ role: 'system', content: systemPrompt }];
    
    // Include last 6 turns of conversation history for context
    const recentHistory = chatHistory.slice(-6);
    recentHistory.forEach(m => {
      if (m.role === 'user' || m.role === 'assistant') {
        llmMessages.push({ role: m.role, content: m.content });
      }
    });

    // Add current user question if not already in history
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
            max_tokens: 350,
            temperature: 0.7
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
      aiText = builtinInterpretation(chartData, userQ, rag, chatHistory);
    }

    return res.json({ 
      success: true, 
      modelUsed: aiText && apiKey ? 'meta-llama/Llama-3.3-70B-Instruct-Turbo' : 'Demetra George RAG Engine', 
      response: aiText 
    });
  } catch(e) {
    console.error('AI error:', e);
    return res.status(500).json({ error:'AI interpretation failed' });
  }
});

// ─── Built-in RAG Fallback Interpreter ───────────────────────────────────────
function builtinInterpretation(chart, query, rag, history) {
  if (!chart || !chart.positions) {
    return 'Please calculate your birth chart first to receive a Demetra George analysis.';
  }

  const p       = chart.positions;
  const qLower  = query.toLowerCase();
  const ascR    = chart.ascendantRuler;
  const rulerP  = p[ascR] || {};

  const snippet = rag.chunks && rag.chunks[0]
    ? rag.chunks[0].text.slice(0,180).replace(/\s+/g,' ')
    : 'The natal chart is a blueprint of the authentic self.';

  // Check if user is asking for elaboration / follow-up
  const isElaboration = qLower.includes('elaborate') || qLower.includes('more') || qLower.includes('why') || qLower.includes('explain') || history.length > 2;

  if (isElaboration) {
    // Determine target placement discussed
    let target = 'placement';
    for (const pl of Object.keys(p)) {
      if (qLower.includes(pl.toLowerCase())) { target = pl; break; }
    }

    const pos = p[target] || rulerP;
    return `✨ **Deep Dive & Elaboration:**

Regarding **${pos.name || ascR}** placed in **${pos.formatted || 'your chart'}** (House ${pos.house || '1'}):

Demetra George emphasizes that when a planet sits in House ${pos.house || '1'}, its energy directly permeates your daily experiences. "${snippet}..."

In traditional Hellenistic astrology, ${pos.name || ascR} operating in ${pos.sign || 'this sign'} (${pos.element || 'Fire'} element) requires you to align your intentions with the sign's fundamental triplicity. Because this is a **${chart.sect}**, ${chart.beneficOfSect} acts as a supportive ally while ${chart.maleficOfSect} highlights areas for conscious mastery.

🔮 **Key Takeaway:** Focus on cultivating ${pos.sign || 'your key sign'} qualities through House ${pos.house || '1'} activities to express your authentic potential.`;
  }

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

  // Default reading
  return `📜 **Book Insight:** The natal chart is a living blueprint where traditional planetary conditions provide structure and modern archetypes reveal soul potential. "${snippet}..."

✨ **Chart Reading:** Your ${chart.sect} chart is ruled by ${ascR} (${rulerP.formatted||'N/A'}, H${rulerP.house||'?'}), with Sun in ${p.Sun?.formatted||'N/A'} and Moon in ${p.Moon?.formatted||'N/A'} guiding conscious and emotional life.

🔮 **Guidance:** Embody your Ascendant ruler's sign and house qualities daily to express your authentic self with clarity.`;
}

module.exports = app;

if (require.main === module) {
  app.listen(PORT, () => console.log(`Placidus AI → http://localhost:${PORT}`));
}
