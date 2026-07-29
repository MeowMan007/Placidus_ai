const fs   = require('fs');
const path = require('path');

const PDF_TEXT_PATH = path.join(__dirname, '../../pdf_text.txt');

let bookChunks = [];
let initialized = false;

// ─── Topic keyword map ───────────────────────────────────────────────────────
const TOPIC_KEYWORDS = {
  'Ascendant & Life Direction': [
    'ascendant','rising sign','lord of the chart','ascendant ruler',
    'life direction','first house','angular','angular planets'
  ],
  'Planetary Condition, Sect & Dignities': [
    'sect','diurnal','nocturnal','day chart','night chart',
    'essential dignity','domicile','exaltation','detriment','fall','debility',
    'accidental dignity','peregrine','out of sect','benefic','malefic',
    'planetary condition','hayz','bonification'
  ],
  'Sun & Moon — Life Purpose': [
    'sun','moon','life purpose','luminary','ego','consciousness',
    'instinct','emotional','soul','vitality','authentic self',
    'sun-moon','luminaries','solar','lunar'
  ],
  'Lunar Nodes — Soul Destiny': [
    'north node','south node','lunar node','nodal axis','rahu','ketu',
    'destiny','karma','past life','future direction','nodal return',
    'eclipse','ecliptic','nodal degree'
  ],
  'Aspects & Chart Geometry': [
    'aspect','conjunction','trine','sextile','square','opposition',
    'quincunx','orb','applying','separating','aspect pattern',
    'grand trine','t-square','grand cross','yod','stellium','mutual reception'
  ],
  'Vocation, Career & Purpose': [
    'vocation','career','work','profession','calling','midheaven','10th house',
    'sixth house','second house','saturn','capricorn','earth sign',
    'purpose','public life','social role'
  ],
  'Fortune & Timing': [
    'part of fortune','lot of fortune','arabic part','profection',
    'solar return','transit','progression','timing','prediction',
    'annual','directed'
  ],
  'Mythic Asteroids': [
    'ceres','pallas','juno','vesta','asteroid','chiron','mythic',
    'goddess','feminine','archetype'
  ]
};

// ─── Init: Parse PDF text into structured chunks ─────────────────────────────
function initRetriever() {
  if (initialized) return;
  initialized = true;

  if (!fs.existsSync(PDF_TEXT_PATH)) {
    console.warn('[RAG] pdf_text.txt not found at:', PDF_TEXT_PATH);
    return;
  }

  const raw = fs.readFileSync(PDF_TEXT_PATH, 'utf-8');
  const pages = raw.split(/={3}\s*PAGE\s+\d+\s*={3}/);

  for (const page of pages) {
    const text = page.replace(/\r?\n/g, ' ').replace(/\s{2,}/g, ' ').trim();
    if (text.length < 80) continue;           // skip near-empty pages

    // Detect topic
    let topic = 'General Astrology Principles';
    const lower = text.toLowerCase();
    for (const [t, kws] of Object.entries(TOPIC_KEYWORDS)) {
      const hits = kws.filter(kw => lower.includes(kw)).length;
      if (hits >= 2) { topic = t; break; }
    }

    // Slide a 900-char window across the page to create small retrievable chunks
    for (let start = 0; start < text.length; start += 700) {
      const chunk = text.slice(start, start + 900).trim();
      if (chunk.length < 100) continue;
      bookChunks.push({ topic, text: chunk, lower: chunk.toLowerCase() });
    }
  }

  console.log(`[RAG] Indexed ${bookChunks.length} chunks from Demetra George's text.`);
}

// ─── Retrieve relevant chunks for a query ────────────────────────────────────
function retrieveContext(userQuery, chartData, topN = 4) {
  if (!initialized) initRetriever();

  const queryLower = (userQuery || '').toLowerCase();

  // Build keyword list from query
  const queryKws = [];
  for (const [, kws] of Object.entries(TOPIC_KEYWORDS)) {
    for (const kw of kws) {
      if (queryLower.includes(kw)) queryKws.push(kw);
    }
  }

  // Also inject planet names from chartData as scoring boosters
  if (chartData) {
    if (chartData.positions) {
      for (const p of Object.values(chartData.positions)) {
        if (p.sign) queryKws.push(p.sign.toLowerCase());
      }
    }
    if (chartData.ascendantRuler) queryKws.push(chartData.ascendantRuler.toLowerCase());
  }

  // Score chunks
  const scored = bookChunks.map(chunk => {
    let score = 0;
    for (const kw of queryKws) {
      // count occurrences of keyword in chunk text
      let pos = 0;
      while ((pos = chunk.lower.indexOf(kw, pos)) !== -1) { score++; pos += kw.length; }
    }
    return { chunk, score };
  });

  // Sort descending, take top N
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, topN).filter(s => s.score > 0);

  if (top.length === 0) {
    // Fallback: return first 3 chunks for the closest topic
    const fallbackTopic = detectTopic(queryLower);
    const fallback = bookChunks.filter(c => c.topic === fallbackTopic).slice(0, 3);
    return { 
      chunks: fallback.length ? fallback : bookChunks.slice(0, 3), 
      formatted: fallback.map(c => `[${c.topic}]\n${c.text}`).join('\n\n---\n\n')
    };
  }

  const chunks = top.map(s => s.chunk);
  const formatted = chunks.map(c => `[Excerpt from: ${c.topic}]\n${c.text}`).join('\n\n---\n\n');
  return { chunks, formatted };
}

function detectTopic(queryLower) {
  let bestTopic = 'General Astrology Principles';
  let bestHits = 0;
  for (const [topic, kws] of Object.entries(TOPIC_KEYWORDS)) {
    const hits = kws.filter(kw => queryLower.includes(kw)).length;
    if (hits > bestHits) { bestHits = hits; bestTopic = topic; }
  }
  return bestTopic;
}

// Auto-initialize on load
initRetriever();

module.exports = { retrieveContext, initRetriever };
