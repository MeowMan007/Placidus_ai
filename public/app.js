/**
 * Placidus AI — Astro-Seek–Style SVG Natal Wheel & UI Controller
 *
 * Geometry reference (from the Astro-Seek screenshot):
 *  • Ascendant (ASC) is at the LEFT of the wheel (9-o'clock, angle 180°).
 *  • Zodiac signs progress COUNTER-CLOCKWISE around the outer band.
 *  • Longitude → angle:  angle = 180° − (lon − ascLon).
 *  • House cusps are thick lines for angles (1,4,7,10), thin for rest.
 *  • Planets sit between zodiac ring and house ring, with degree labels.
 *  • Aspect chords are drawn inside the innermost circle.
 */

'use strict';

let currentChartData = null;
let geocodeTimeout   = null;

// ── Constants ────────────────────────────────────────────────────────────────

const SIGNS = [
  'Aries','Taurus','Gemini','Cancer','Leo','Virgo',
  'Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'
];
const SIGN_SYM = { Aries:'♈',Taurus:'♉',Gemini:'♊',Cancer:'♋',Leo:'♌',Virgo:'♍',
                   Libra:'♎',Scorpio:'♏',Sagittarius:'♐',Capricorn:'♑',Aquarius:'♒',Pisces:'♓' };
const ELEM = { Aries:'Fire',Taurus:'Earth',Gemini:'Air',Cancer:'Water',
               Leo:'Fire',Virgo:'Earth',Libra:'Air',Scorpio:'Water',
               Sagittarius:'Fire',Capricorn:'Earth',Aquarius:'Air',Pisces:'Water' };
const ELEM_COLORS = {
  Fire:  { fill:'rgba(245,158,11,0.18)',  text:'#fef08a', ring:'#f59e0b' },
  Earth: { fill:'rgba(16,185,129,0.18)',  text:'#6ee7b7', ring:'#10b981' },
  Air:   { fill:'rgba(251,191,36,0.15)',  text:'#fde047', ring:'#fbbf24' },
  Water: { fill:'rgba(52,211,153,0.18)',  text:'#a7f3d0', ring:'#34d399' }
};
const PLANET_SYM = {
  Sun:'☉',Moon:'☽',Mercury:'☿',Venus:'♀',Mars:'♂',
  Jupiter:'♃',Saturn:'♄',Uranus:'♅',Neptune:'♆',Pluto:'♇',
  'North Node':'☊','South Node':'☋',Ascendant:'AC',Midheaven:'MC'
};

// ── DOM Ready ────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('chart-form').addEventListener('submit', e => {
    e.preventDefault();
    calculateAndRenderChart();
  });

  const ci = document.getElementById('citySearch');
  ci.addEventListener('input', handleCityInput);
  ci.addEventListener('focus', () => handleCityInput({ target:ci }));
  document.addEventListener('click', e => {
    if (!e.target.closest('#citySearch') && !e.target.closest('#citySuggestions'))
      document.getElementById('citySuggestions').style.display = 'none';
  });
});

// ── City Geocoding ───────────────────────────────────────────────────────────

function handleCityInput(e) {
  clearTimeout(geocodeTimeout);
  const q = e.target.value.trim();
  geocodeTimeout = setTimeout(async () => {
    try {
      const r = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
      const d = await r.json();
      if (d.success && d.results.length) renderCityDropdown(d.results);
    } catch(_) {}
  }, 300);
}

function renderCityDropdown(items) {
  const dd = document.getElementById('citySuggestions');
  dd.innerHTML = '';
  items.forEach(i => {
    const d = document.createElement('div');
    d.className = 'city-suggestion-item';
    d.innerHTML = `📍 <strong>${i.city}</strong> <span style="opacity:.6">${i.fullName||i.country||''}</span>`;
    d.onclick = () => {
      document.getElementById('citySearch').value = i.fullName||i.city;
      document.getElementById('latitude').value = i.lat;
      document.getElementById('longitude').value = i.lon;
      autoEstimateTimezone(i.lat, i.lon);
      dd.style.display = 'none';
    };
    dd.appendChild(d);
  });
  dd.style.display = 'block';
}

async function autoEstimateTimezone(lat, lon) {
  if (lat === undefined || lon === undefined || lat === '' || lon === '') return;
  
  const select = document.getElementById('timezoneOffset');
  if (!select) return;

  try {
    const r = await fetch(`/api/timezone?lat=${lat}&lon=${lon}`);
    const d = await r.json();
    if (d.success && d.offset !== undefined) {
      const targetOffset = d.offset;
      let closestOpt = select.options[0];
      let minDiff = 999;
      for (let idx = 0; idx < select.options.length; idx++) {
        const optVal = parseFloat(select.options[idx].value);
        const diff = Math.abs(optVal - targetOffset);
        if (diff < minDiff) {
          minDiff = diff;
          closestOpt = select.options[idx];
        }
      }
      if (closestOpt) select.value = closestOpt.value;
    }
  } catch(e) {
    console.warn('Timezone fetch error:', e);
  }
}

// ── Chart Calculation ────────────────────────────────────────────────────────

async function calculateAndRenderChart() {
  const bd = document.getElementById('birthDate').value;
  const bt = document.getElementById('birthTime').value;
  const la = document.getElementById('latitude').value;
  const lo = document.getElementById('longitude').value;
  const cn = document.getElementById('citySearch').value;
  const tz = document.getElementById('timezoneOffset').value;

  try {
    const r = await fetch('/api/calculate-chart', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ birthDate:bd, birthTime:bt, latitude:la, longitude:lo, cityName:cn, timezoneOffset:tz })
    });
    const d = await r.json();
    if (d.success) {
      currentChartData = d.chartData;
      renderTables(currentChartData);
      drawWheel(currentChartData);
      document.getElementById('active-city-badge').textContent = `📍 ${cn}`;
      const utcInfo = currentChartData.birthInfo?.utcTime ? ` (${currentChartData.birthInfo.utcTime})` : '';
      document.getElementById('chart-location-subtitle').textContent = `${cn} · ${bd} ${bt}${utcInfo}`;
      showStep2();
    }
  } catch(e) { console.error('Chart error:', e); }
}

function showStep1() {
  document.getElementById('step-1-screen').style.display = 'flex';
  document.getElementById('step-2-screen').style.display = 'none';
  document.getElementById('header-chart-info').style.display = 'none';
}
function showStep2() {
  document.getElementById('step-1-screen').style.display = 'none';
  document.getElementById('step-2-screen').style.display = 'grid';
  document.getElementById('header-chart-info').style.display = 'flex';
}

// ── Data Tables ──────────────────────────────────────────────────────────────

function renderTables(c) {
  const pb = document.getElementById('planets-table-body'); pb.innerHTML = '';
  for (const p of Object.values(c.positions)) {
    const ec = p.element ? `badge-${p.element.toLowerCase()}` : '';
    const tr = document.createElement('tr');
    tr.innerHTML = `<td style="color:var(--accent-gold)">${p.symbol} ${p.name}</td>
      <td>${p.formatted}</td><td>H${p.house||'-'}</td>
      <td><span class="badge ${ec}">${p.element||'-'}</span></td>`;
    pb.appendChild(tr);
  }
  const hb = document.getElementById('houses-table-body'); hb.innerHTML = '';
  for (const h of c.houses) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><b>House ${h.house}</b></td><td>${h.signSymbol} ${h.sign}</td><td>${h.degree}°${String(h.minute).padStart(2,'0')}'</td>`;
    hb.appendChild(tr);
  }
  const ab = document.getElementById('aspects-table-body'); ab.innerHTML = '';
  for (const a of c.aspects) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td style="color:${a.color||'#fbbf24'}">${a.symbol} ${a.aspect}</td><td>${a.p1} – ${a.p2}</td><td>${a.orb}°</td>`;
    ab.appendChild(tr);
  }

  renderAspectMatrix(c);
  renderDistribution(c);
}

function renderAspectMatrix(c) {
  const table = document.getElementById('aspect-matrix-table');
  if (!table) return;
  const planets = ['Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn','Uranus','Neptune','Pluto','North Node'];
  
  const aspectMap = {};
  for (const a of (c.aspects || [])) {
    aspectMap[`${a.p1}_${a.p2}`] = a;
    aspectMap[`${a.p2}_${a.p1}`] = a;
  }

  let html = '<thead><tr><th></th>';
  planets.forEach(p => {
    html += `<th class="hdr-cell" title="${p}">${PLANET_SYM[p]||p[0]}</th>`;
  });
  html += '</tr></thead><tbody>';

  for (let i = 0; i < planets.length; i++) {
    const p1 = planets[i];
    html += `<tr><td class="hdr-cell" title="${p1}">${PLANET_SYM[p1]||p1[0]}</td>`;
    for (let j = 0; j < planets.length; j++) {
      const p2 = planets[j];
      if (j >= i) {
        html += '<td style="background:rgba(255,255,255,0.02)"></td>';
      } else {
        const asp = aspectMap[`${p1}_${p2}`];
        if (asp) {
          html += `<td class="asp-cell" title="${asp.p1} ${asp.aspect} ${asp.p2} (${asp.orb}°)" style="color:${asp.color||'#fbbf24'}">${asp.symbol}</td>`;
        } else {
          html += '<td class="asp-cell"></td>';
        }
      }
    }
    html += '</tr>';
  }
  html += '</tbody>';
  table.innerHTML = html;
}

function renderDistribution(c) {
  let fire = 0, earth = 0, air = 0, water = 0;
  let car = 0, fix = 0, mut = 0;

  const MODALITIES = {
    Aries:'Cardinal', Cancer:'Cardinal', Libra:'Cardinal', Capricorn:'Cardinal',
    Taurus:'Fixed', Leo:'Fixed', Scorpio:'Fixed', Aquarius:'Fixed',
    Gemini:'Mutable', Virgo:'Mutable', Sagittarius:'Mutable', Pisces:'Mutable'
  };

  const keyPlanets = ['Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn','Uranus','Neptune','Pluto','Ascendant','Midheaven'];
  for (const name of keyPlanets) {
    const p = c.positions[name];
    if (!p || !p.sign) continue;
    if (p.element === 'Fire') fire++;
    else if (p.element === 'Earth') earth++;
    else if (p.element === 'Air') air++;
    else if (p.element === 'Water') water++;

    const mod = MODALITIES[p.sign];
    if (mod === 'Cardinal') car++;
    else if (mod === 'Fixed') fix++;
    else if (mod === 'Mutable') mut++;
  }

  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setEl('cnt-fire', fire);
  setEl('cnt-earth', earth);
  setEl('cnt-air', air);
  setEl('cnt-water', water);
  setEl('cnt-car', car);
  setEl('cnt-fix', fix);
  setEl('cnt-mut', mut);
}

// ══════════════════════════════════════════════════════════════════════════════
//  SVG NATAL WHEEL — ASTRO-SEEK GEOMETRY
// ══════════════════════════════════════════════════════════════════════════════

function drawWheel(chart) {
  const svg = document.getElementById('chart-wheel-svg');
  const CX = 300, CY = 300;
  const R_OUT   = 268;   // outer zodiac ring
  const R_SIGN  = 224;   // inner edge of zodiac band
  const R_PLT   = 192;   // planet glyph ring
  const R_HOUSE = 148;   // inner edge = house cusp endpoints & aspect hub
  const R_HUB   = 148;   // aspect chord endpoints
  const R_NUM   = 125;   // house number labels

  const ascLon = chart.positions.Ascendant ? chart.positions.Ascendant.longitude : 0;

  // Convert ecliptic longitude → SVG angle (degrees, standard math convention)
  // ASC at 180° (9 o'clock), signs and houses progress counter-clockwise
  function lon2a(lon) { return ((180 + (lon - ascLon)) % 360 + 360) % 360; }
  function polar(r, aDeg) {
    const rad = aDeg * Math.PI / 180;
    return { x: CX + r * Math.cos(rad), y: CY - r * Math.sin(rad) };
  }
  function arc(r, a1, a2) {
    // SVG arc from a1 to a2 (counter-clockwise sweep in SVG)
    const p1 = polar(r, a1), p2 = polar(r, a2);
    let sweep = ((a2 - a1) % 360 + 360) % 360;
    const large = sweep > 180 ? 1 : 0;
    return `M${p1.x},${p1.y} A${r},${r} 0 ${large} 0 ${p2.x},${p2.y}`;
  }

  let s = '';

  // ─ Background ─
  s += `<circle cx="${CX}" cy="${CY}" r="${R_OUT}" fill="rgba(5,8,17,0.35)" stroke="rgba(245,158,11,0.5)" stroke-width="2"/>`;
  s += `<circle cx="${CX}" cy="${CY}" r="${R_SIGN}" fill="none" stroke="rgba(245,158,11,0.35)" stroke-width="1.5"/>`;
  s += `<circle cx="${CX}" cy="${CY}" r="${R_HOUSE}" fill="rgba(5,8,17,0.8)" stroke="rgba(245,158,11,0.4)" stroke-width="1.5"/>`;

  // ─ 1. Zodiac sign sectors ─
  for (let i = 0; i < 12; i++) {
    const sign = SIGNS[i];
    const el   = ELEM[sign];
    const col  = ELEM_COLORS[el];
    const a1   = lon2a(i * 30);
    const a2   = lon2a((i + 1) * 30);

    // Filled sector
    const pO1 = polar(R_OUT, a1), pO2 = polar(R_OUT, a2);
    const pI1 = polar(R_SIGN, a1), pI2 = polar(R_SIGN, a2);
    let sweep = ((a2 - a1) % 360 + 360) % 360;
    const lg = sweep > 180 ? 1 : 0;
    s += `<path d="M${pO1.x},${pO1.y} A${R_OUT},${R_OUT} 0 ${lg} 0 ${pO2.x},${pO2.y} L${pI2.x},${pI2.y} A${R_SIGN},${R_SIGN} 0 ${lg} 1 ${pI1.x},${pI1.y} Z" fill="${col.fill}" stroke="rgba(255,255,255,0.06)" stroke-width="0.5"/>`;

    // Division line
    s += `<line x1="${pO1.x}" y1="${pO1.y}" x2="${pI1.x}" y2="${pI1.y}" stroke="rgba(245,158,11,0.3)" stroke-width="1"/>`;

    // Sign glyph at midpoint
    const mid = lon2a(i * 30 + 15);
    const pm  = polar((R_OUT + R_SIGN) / 2, mid);
    s += `<text x="${pm.x}" y="${pm.y + 6}" fill="${col.text}" font-size="17" font-weight="700" text-anchor="middle" font-family="serif">${SIGN_SYM[sign]}</text>`;
  }

  // ─ 2. House cusps ─
  chart.houses.forEach((h, idx) => {
    const ang   = lon2a(h.longitude);
    const pOut  = polar(R_SIGN, ang);
    const pIn   = polar(R_HOUSE, ang);
    const isAng = (h.house === 1 || h.house === 4 || h.house === 7 || h.house === 10);
    const sw    = isAng ? 2.5 : 1;
    const col   = isAng ? 'rgba(251,191,36,0.9)' : 'rgba(16,185,129,0.4)';

    s += `<line x1="${pOut.x}" y1="${pOut.y}" x2="${pIn.x}" y2="${pIn.y}" stroke="${col}" stroke-width="${sw}"/>`;

    // House number in sector midpoint
    const next    = chart.houses[(idx + 1) % 12];
    let midLon    = (h.longitude + next.longitude) / 2;
    if (next.longitude < h.longitude) midLon = ((h.longitude + next.longitude + 360) / 2) % 360;
    const midA    = lon2a(midLon);
    const pNum    = polar(R_NUM, midA);
    s += `<text x="${pNum.x}" y="${pNum.y + 4}" fill="rgba(251,191,36,0.7)" font-size="11" font-weight="700" text-anchor="middle">${h.house}</text>`;
  });

  // ─ 3. Aspect chords inside hub ─
  if (chart.aspects) {
    for (const asp of chart.aspects) {
      const p1 = chart.positions[asp.p1];
      const p2 = chart.positions[asp.p2];
      if (!p1 || !p2) continue;
      const pt1 = polar(R_HUB, lon2a(p1.longitude));
      const pt2 = polar(R_HUB, lon2a(p2.longitude));
      let col = asp.color || '#fbbf24';
      let opacity = asp.type === 'minor' ? 0.35 : 0.55;
      let dash = asp.aspect === 'Opposition' ? '5,3' : 'none';
      let width = asp.type === 'hard' ? 1.4 : 1;
      s += `<line x1="${pt1.x}" y1="${pt1.y}" x2="${pt2.x}" y2="${pt2.y}" stroke="${col}" stroke-width="${width}" stroke-dasharray="${dash}" opacity="${opacity}"/>`;
    }
  }

  // ─ 4. Planet glyphs with collision avoidance ─
  const drawPlanets = Object.values(chart.positions).filter(
    p => p.longitude !== undefined && p.name !== 'Ascendant' && p.name !== 'Midheaven'
  );
  // Sort by longitude for collision detection
  drawPlanets.sort((a, b) => a.longitude - b.longitude);

  // Collision avoidance: spread planets that are within 6° of each other
  const placed = [];
  const MIN_ANGLE_GAP = 8; // degrees on the wheel
  for (const pl of drawPlanets) {
    let angle = lon2a(pl.longitude);
    // Check against already-placed angles and nudge if overlapping
    for (const prev of placed) {
      let diff = Math.abs(angle - prev.angle);
      if (diff > 180) diff = 360 - diff;
      if (diff < MIN_ANGLE_GAP) {
        angle += MIN_ANGLE_GAP - diff;
      }
    }
    placed.push({ ...pl, angle });
  }

  for (const pl of placed) {
    const pg = polar(R_PLT, pl.angle);
    const sym = PLANET_SYM[pl.name] || pl.symbol || pl.name[0];
    
    // Glyph circle
    s += `<circle cx="${pg.x}" cy="${pg.y}" r="12" fill="#0a0f1e" stroke="${pl.element ? ELEM_COLORS[pl.element]?.ring || '#fbbf24' : '#fbbf24'}" stroke-width="1.5"/>`;
    s += `<text x="${pg.x}" y="${pg.y + 5}" fill="#fef08a" font-size="12" font-weight="700" text-anchor="middle">${sym}</text>`;

    // Degree label slightly outward
    const dl = polar(R_PLT + 20, pl.angle);
    s += `<text x="${dl.x}" y="${dl.y + 3}" fill="rgba(255,255,255,0.55)" font-size="8" text-anchor="middle">${pl.degree}°${String(pl.minute).padStart(2,'0')}'</text>`;
    
    // Tiny tick from sign ring to planet position
    const tickOut = polar(R_SIGN - 2, lon2a(pl.longitude));
    const tickIn  = polar(R_PLT + 14, lon2a(pl.longitude));
    s += `<line x1="${tickOut.x}" y1="${tickOut.y}" x2="${tickIn.x}" y2="${tickIn.y}" stroke="rgba(255,255,255,0.15)" stroke-width="0.5"/>`;
  }

  // ─ 5. ASC / DSC / MC / IC badges ─
  const badges = [
    { label:'ASC', lon: chart.positions.Ascendant?.longitude, color:'#fbbf24' },
    { label:'DSC', lon: chart.positions.Ascendant ? (chart.positions.Ascendant.longitude+180)%360 : 0, color:'#10b981' },
    { label:'MC',  lon: chart.positions.Midheaven?.longitude, color:'#fef08a' },
    { label:'IC',  lon: chart.positions.Midheaven ? (chart.positions.Midheaven.longitude+180)%360 : 0, color:'#34d399' },
  ];
  for (const b of badges) {
    if (b.lon === undefined) continue;
    const ang = lon2a(b.lon);
    const bp  = polar(R_OUT + 16, ang);
    s += `<circle cx="${bp.x}" cy="${bp.y}" r="14" fill="${b.color}" stroke="#050811" stroke-width="2"/>`;
    s += `<text x="${bp.x}" y="${bp.y + 4}" fill="#050811" font-size="9" font-weight="800" text-anchor="middle">${b.label}</text>`;
  }

  svg.innerHTML = s;
}

// ── Tab Switching ────────────────────────────────────────────────────────────

function switchTab(name) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
  event.target.classList.add('active');
  document.getElementById('tab-' + name).style.display = 'block';
}

// ── Chat / Prompt ────────────────────────────────────────────────────────────

function triggerPresetPrompt(txt) {
  document.getElementById('user-prompt').value = txt;
  sendChatPrompt();
}

async function sendChatPrompt() {
  const inp = document.getElementById('user-prompt');
  const txt = inp.value.trim();
  if (!txt) return;
  const box = document.getElementById('chat-messages');

  // User bubble
  const u = document.createElement('div');
  u.className = 'message user'; u.textContent = txt;
  box.appendChild(u); inp.value = '';

  // Assistant thinking
  const a = document.createElement('div');
  a.className = 'message assistant';
  a.innerHTML = '<em>Searching Demetra George book excerpts…</em>';
  box.appendChild(a);
  box.scrollTop = box.scrollHeight;

  try {
    const r = await fetch('/api/ai-astrologer', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ prompt:txt, chartData:currentChartData })
    });
    const d = await r.json();
    a.innerHTML = d.success ? fmtMd(d.response) : 'Error from AI agent.';
  } catch(_) { a.textContent = 'Connection failed.'; }
  box.scrollTop = box.scrollHeight;
}

function fmtMd(t) {
  return t
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/### (.*?)(\n|$)/g, '<h4 style="color:var(--accent-gold);margin:.4rem 0">$1</h4>')
    .replace(/\n/g, '<br>');
}
