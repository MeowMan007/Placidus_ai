/**
 * Placidus AI — Premium Frontend Controller
 *
 * Features:
 *  • Animated starfield canvas background
 *  • Astro-Seek–geometry SVG natal wheel (ASC at 9-o'clock)
 *  • Data tables with tabs (planets, houses, aspects)
 *  • Aspect matrix & elemental/modality distribution
 *  • Chat UI with typing indicator and keyboard shortcuts
 *  • Markdown rendering for AI responses
 */

'use strict';

/* ═══════════════════════════════════════════════════════════════════════════════
   STATE
   ═══════════════════════════════════════════════════════════════════════════════ */

let currentChartData = null;
let geocodeTimeout   = null;
let chatHistory      = [];
let isSending        = false;

/* ═══════════════════════════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════════════════════════ */

const SIGNS = [
  'Aries','Taurus','Gemini','Cancer','Leo','Virgo',
  'Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'
];

const SIGN_SYM = {
  Aries:'♈',Taurus:'♉',Gemini:'♊',Cancer:'♋',Leo:'♌',Virgo:'♍',
  Libra:'♎',Scorpio:'♏',Sagittarius:'♐',Capricorn:'♑',Aquarius:'♒',Pisces:'♓'
};

const ELEM = {
  Aries:'Fire',Taurus:'Earth',Gemini:'Air',Cancer:'Water',
  Leo:'Fire',Virgo:'Earth',Libra:'Air',Scorpio:'Water',
  Sagittarius:'Fire',Capricorn:'Earth',Aquarius:'Air',Pisces:'Water'
};

// Refined color palette for the wheel
const ELEM_COLORS = {
  Fire:  { fill:'rgba(212,91,91,0.1)',   text:'#D4917A', ring:'#C47A5A' },
  Earth: { fill:'rgba(61,184,160,0.08)', text:'#6DD4BC', ring:'#3DB8A0' },
  Air:   { fill:'rgba(201,168,76,0.08)', text:'#D4BE7A', ring:'#C9A84C' },
  Water: { fill:'rgba(74,122,229,0.1)',  text:'#7BA8F0', ring:'#4A7AE5' }
};

const PLANET_SYM = {
  Sun:'☉',Moon:'☽',Mercury:'☿',Venus:'♀',Mars:'♂',
  Jupiter:'♃',Saturn:'♄',Uranus:'♅',Neptune:'♆',Pluto:'♇',
  'North Node':'☊','South Node':'☋',Ascendant:'AC',Midheaven:'MC'
};

/* ═══════════════════════════════════════════════════════════════════════════════
   STARFIELD — Animated Canvas Background
   ═══════════════════════════════════════════════════════════════════════════════ */

function initStarfield() {
  const canvas = document.getElementById('starfield-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let stars = [];
  let w, h;

  function resize() {
    w = canvas.width  = window.innerWidth;
    h = canvas.height = window.innerHeight;
  }

  function createStars() {
    stars = [];
    const count = Math.floor((w * h) / 5000); // Density scales with viewport
    for (let i = 0; i < count; i++) {
      stars.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.2 + 0.3,
        baseAlpha: Math.random() * 0.5 + 0.1,
        phase: Math.random() * Math.PI * 2,
        speed: Math.random() * 0.003 + 0.001,
        // Subtle warm tint for some stars
        hue: Math.random() > 0.7 ? 40 + Math.random() * 20 : 220 + Math.random() * 40,
        sat: Math.random() > 0.7 ? 30 : 5
      });
    }
  }

  function draw(t) {
    ctx.clearRect(0, 0, w, h);
    for (const s of stars) {
      const alpha = s.baseAlpha + Math.sin(t * s.speed + s.phase) * 0.2;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${s.hue}, ${s.sat}%, 85%, ${Math.max(0, alpha)})`;
      ctx.fill();
    }
    requestAnimationFrame(draw);
  }

  resize();
  createStars();
  requestAnimationFrame(draw);

  window.addEventListener('resize', () => {
    resize();
    createStars();
  });
}

/* ═══════════════════════════════════════════════════════════════════════════════
   DOM READY
   ═══════════════════════════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  // Start starfield
  initStarfield();

  // Form submission
  document.getElementById('chart-form').addEventListener('submit', e => {
    e.preventDefault();
    calculateAndRenderChart();
  });

  // City search
  const cityInput = document.getElementById('citySearch');
  cityInput.addEventListener('input', handleCityInput);
  cityInput.addEventListener('focus', () => handleCityInput({ target: cityInput }));

  // Close dropdown on outside click
  document.addEventListener('click', e => {
    if (!e.target.closest('#citySearch') && !e.target.closest('#citySuggestions')) {
      document.getElementById('citySuggestions').style.display = 'none';
    }
  });

  // Enter key sends chat
  document.getElementById('user-prompt').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChatPrompt();
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════
   GEOCODING
   ═══════════════════════════════════════════════════════════════════════════════ */

function handleCityInput(e) {
  clearTimeout(geocodeTimeout);
  const q = e.target.value.trim();
  geocodeTimeout = setTimeout(async () => {
    try {
      const r = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
      const d = await r.json();
      if (d.success && d.results.length) renderCityDropdown(d.results);
    } catch (_) { /* Network error — silent */ }
  }, 300);
}

function renderCityDropdown(items) {
  const dd = document.getElementById('citySuggestions');
  dd.innerHTML = '';
  items.forEach(i => {
    const d = document.createElement('div');
    d.className = 'city-suggestion-item';
    d.innerHTML = `<span class="city-icon">◎</span> <strong>${i.city}</strong> <span style="opacity:.5;margin-left:0.3rem">${i.fullName || i.country || ''}</span>`;
    d.onclick = () => {
      document.getElementById('citySearch').value = i.fullName || i.city;
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
      let closestOpt = select.options[0];
      let minDiff = 999;
      for (let idx = 0; idx < select.options.length; idx++) {
        const diff = Math.abs(parseFloat(select.options[idx].value) - d.offset);
        if (diff < minDiff) { minDiff = diff; closestOpt = select.options[idx]; }
      }
      if (closestOpt) select.value = closestOpt.value;
    }
  } catch (_) { /* Fallback handled by server */ }
}

/* ═══════════════════════════════════════════════════════════════════════════════
   CHART CALCULATION
   ═══════════════════════════════════════════════════════════════════════════════ */

async function calculateAndRenderChart() {
  const btn = document.getElementById('generate-chart-btn');
  const origText = btn.textContent;
  btn.textContent = 'Calculating...';
  btn.disabled = true;

  const bd = document.getElementById('birthDate').value;
  const bt = document.getElementById('birthTime').value;
  const la = document.getElementById('latitude').value;
  const lo = document.getElementById('longitude').value;
  const cn = document.getElementById('citySearch').value;
  const tz = document.getElementById('timezoneOffset').value;

  try {
    const r = await fetch('/api/calculate-chart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        birthDate: bd, birthTime: bt,
        latitude: la, longitude: lo,
        cityName: cn, timezoneOffset: tz
      })
    });
    const d = await r.json();
    if (d.success) {
      currentChartData = d.chartData;
      renderTables(currentChartData);
      drawWheel(currentChartData);

      // Update header
      document.getElementById('active-city-badge').textContent = cn;
      const utcInfo = currentChartData.birthInfo?.utcTime ? ` · ${currentChartData.birthInfo.utcTime}` : '';
      document.getElementById('chart-location-subtitle').textContent = `${cn} · ${bd} ${bt}${utcInfo}`;

      showStep2();
    }
  } catch (e) {
    console.error('Chart calculation error:', e);
  } finally {
    btn.textContent = origText;
    btn.disabled = false;
  }
}

/* ─── Step Navigation ─────────────────────────────────────────────────────── */

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

/* ═══════════════════════════════════════════════════════════════════════════════
   DATA TABLES
   ═══════════════════════════════════════════════════════════════════════════════ */

function renderTables(c) {
  // Planets table
  const pb = document.getElementById('planets-table-body');
  pb.innerHTML = '';
  for (const p of Object.values(c.positions)) {
    const ec = p.element ? `badge-${p.element.toLowerCase()}` : '';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="planet-name">${p.symbol} ${p.name}</td>
      <td>${p.formatted}</td>
      <td>H${p.house || '-'}</td>
      <td><span class="badge ${ec}">${p.element || '-'}</span></td>`;
    pb.appendChild(tr);
  }

  // Houses table
  const hb = document.getElementById('houses-table-body');
  hb.innerHTML = '';
  for (const h of c.houses) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>House ${h.house}</strong></td>
      <td>${h.signSymbol} ${h.sign}</td>
      <td>${h.degree}°${String(h.minute).padStart(2, '0')}'</td>`;
    hb.appendChild(tr);
  }

  // Aspects table
  const ab = document.getElementById('aspects-table-body');
  ab.innerHTML = '';
  for (const a of c.aspects) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="color:${a.color || '#C9A84C'}">${a.symbol} ${a.aspect}</td>
      <td>${a.p1} – ${a.p2}</td>
      <td>${a.orb}°</td>`;
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
    html += `<th class="hdr-cell" title="${p}">${PLANET_SYM[p] || p[0]}</th>`;
  });
  html += '</tr></thead><tbody>';

  for (let i = 0; i < planets.length; i++) {
    const p1 = planets[i];
    html += `<tr><td class="hdr-cell" title="${p1}">${PLANET_SYM[p1] || p1[0]}</td>`;
    for (let j = 0; j < planets.length; j++) {
      if (j >= i) {
        html += '<td style="background:rgba(255,255,255,0.01)"></td>';
      } else {
        const asp = aspectMap[`${p1}_${planets[j]}`];
        if (asp) {
          html += `<td class="asp-cell" title="${asp.p1} ${asp.aspect} ${asp.p2} (${asp.orb}°)" style="color:${asp.color || '#C9A84C'}">${asp.symbol}</td>`;
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

/* ═══════════════════════════════════════════════════════════════════════════════
   SVG NATAL WHEEL — Astro-Seek Geometry
   ═══════════════════════════════════════════════════════════════════════════════ */

function drawWheel(chart) {
  const svg = document.getElementById('chart-wheel-svg');
  const CX = 300, CY = 300;
  const R_OUT   = 268;   // Outer zodiac ring
  const R_SIGN  = 224;   // Inner edge of zodiac band
  const R_PLT   = 192;   // Planet glyph ring
  const R_HOUSE = 148;   // Inner edge — house cusp endpoints & aspect hub
  const R_HUB   = 148;   // Aspect chord endpoints
  const R_NUM   = 125;   // House number labels

  const ascLon = chart.positions.Ascendant ? chart.positions.Ascendant.longitude : 0;

  // Convert ecliptic longitude → SVG angle (ASC at 180°, CCW progression)
  function lon2a(lon) { return ((180 + (lon - ascLon)) % 360 + 360) % 360; }
  function polar(r, aDeg) {
    const rad = aDeg * Math.PI / 180;
    return { x: CX + r * Math.cos(rad), y: CY - r * Math.sin(rad) };
  }

  let s = '';

  // ─ Background circles ─
  s += `<circle cx="${CX}" cy="${CY}" r="${R_OUT}" fill="rgba(6,11,24,0.5)" stroke="rgba(201,168,76,0.35)" stroke-width="1.5"/>`;
  s += `<circle cx="${CX}" cy="${CY}" r="${R_SIGN}" fill="none" stroke="rgba(201,168,76,0.2)" stroke-width="1"/>`;
  s += `<circle cx="${CX}" cy="${CY}" r="${R_HOUSE}" fill="rgba(4,6,14,0.85)" stroke="rgba(201,168,76,0.25)" stroke-width="1"/>`;

  // ─ 1. Zodiac sign sectors ─
  for (let i = 0; i < 12; i++) {
    const sign = SIGNS[i];
    const el   = ELEM[sign];
    const col  = ELEM_COLORS[el];
    const a1   = lon2a(i * 30);
    const a2   = lon2a((i + 1) * 30);

    const pO1 = polar(R_OUT, a1), pO2 = polar(R_OUT, a2);
    const pI1 = polar(R_SIGN, a1), pI2 = polar(R_SIGN, a2);
    let sweep = ((a2 - a1) % 360 + 360) % 360;
    const lg = sweep > 180 ? 1 : 0;

    // Sector fill
    s += `<path d="M${pO1.x},${pO1.y} A${R_OUT},${R_OUT} 0 ${lg} 0 ${pO2.x},${pO2.y} L${pI2.x},${pI2.y} A${R_SIGN},${R_SIGN} 0 ${lg} 1 ${pI1.x},${pI1.y} Z" fill="${col.fill}" stroke="rgba(201,168,76,0.08)" stroke-width="0.5"/>`;

    // Division line
    s += `<line x1="${pO1.x}" y1="${pO1.y}" x2="${pI1.x}" y2="${pI1.y}" stroke="rgba(201,168,76,0.18)" stroke-width="0.8"/>`;

    // Sign glyph at midpoint
    const mid = lon2a(i * 30 + 15);
    const pm  = polar((R_OUT + R_SIGN) / 2, mid);
    s += `<text x="${pm.x}" y="${pm.y + 6}" fill="${col.text}" font-size="16" font-weight="600" text-anchor="middle" font-family="serif" opacity="0.85">${SIGN_SYM[sign]}</text>`;
  }

  // ─ 2. House cusps ─
  chart.houses.forEach((h, idx) => {
    const ang  = lon2a(h.longitude);
    const pOut = polar(R_SIGN, ang);
    const pIn  = polar(R_HOUSE, ang);
    const isAng = (h.house === 1 || h.house === 4 || h.house === 7 || h.house === 10);
    const sw   = isAng ? 2 : 0.8;
    const col  = isAng ? 'rgba(201,168,76,0.7)' : 'rgba(201,168,76,0.2)';

    s += `<line x1="${pOut.x}" y1="${pOut.y}" x2="${pIn.x}" y2="${pIn.y}" stroke="${col}" stroke-width="${sw}"/>`;

    // House number
    const next = chart.houses[(idx + 1) % 12];
    let midLon = (h.longitude + next.longitude) / 2;
    if (next.longitude < h.longitude) midLon = ((h.longitude + next.longitude + 360) / 2) % 360;
    const midA = lon2a(midLon);
    const pNum = polar(R_NUM, midA);
    s += `<text x="${pNum.x}" y="${pNum.y + 4}" fill="rgba(201,168,76,0.45)" font-size="10" font-weight="600" text-anchor="middle" font-family="Inter, sans-serif">${h.house}</text>`;
  });

  // ─ 3. Aspect chords ─
  if (chart.aspects) {
    for (const asp of chart.aspects) {
      const p1 = chart.positions[asp.p1];
      const p2 = chart.positions[asp.p2];
      if (!p1 || !p2) continue;
      const pt1 = polar(R_HUB, lon2a(p1.longitude));
      const pt2 = polar(R_HUB, lon2a(p2.longitude));
      let col = asp.color || '#C9A84C';
      let opacity = asp.type === 'minor' ? 0.2 : 0.35;
      let dash = asp.aspect === 'Opposition' ? '4,3' : 'none';
      let width = asp.type === 'hard' ? 1.2 : 0.8;
      s += `<line x1="${pt1.x}" y1="${pt1.y}" x2="${pt2.x}" y2="${pt2.y}" stroke="${col}" stroke-width="${width}" stroke-dasharray="${dash}" opacity="${opacity}"/>`;
    }
  }

  // ─ 4. Planet glyphs with collision avoidance ─
  const drawPlanets = Object.values(chart.positions).filter(
    p => p.longitude !== undefined && p.name !== 'Ascendant' && p.name !== 'Midheaven'
  );
  drawPlanets.sort((a, b) => a.longitude - b.longitude);

  const placed = [];
  const MIN_ANGLE_GAP = 8;
  for (const pl of drawPlanets) {
    let angle = lon2a(pl.longitude);
    for (const prev of placed) {
      let diff = Math.abs(angle - prev.angle);
      if (diff > 180) diff = 360 - diff;
      if (diff < MIN_ANGLE_GAP) angle += MIN_ANGLE_GAP - diff;
    }
    placed.push({ ...pl, angle });
  }

  for (const pl of placed) {
    const pg = polar(R_PLT, pl.angle);
    const sym = PLANET_SYM[pl.name] || pl.symbol || pl.name[0];
    const ringColor = pl.element ? (ELEM_COLORS[pl.element]?.ring || '#C9A84C') : '#C9A84C';

    // Planet circle
    s += `<circle cx="${pg.x}" cy="${pg.y}" r="11" fill="#060B18" stroke="${ringColor}" stroke-width="1.2" opacity="0.95"/>`;
    s += `<text x="${pg.x}" y="${pg.y + 4.5}" fill="${pl.element ? ELEM_COLORS[pl.element].text : '#D4BE7A'}" font-size="11" font-weight="600" text-anchor="middle">${sym}</text>`;

    // Degree label
    const dl = polar(R_PLT + 18, pl.angle);
    s += `<text x="${dl.x}" y="${dl.y + 3}" fill="rgba(240,237,230,0.35)" font-size="7.5" text-anchor="middle" font-family="Inter, sans-serif">${pl.degree}°${String(pl.minute).padStart(2, '0')}'</text>`;

    // Tick from zodiac ring to planet
    const tickOut = polar(R_SIGN - 2, lon2a(pl.longitude));
    const tickIn  = polar(R_PLT + 13, lon2a(pl.longitude));
    s += `<line x1="${tickOut.x}" y1="${tickOut.y}" x2="${tickIn.x}" y2="${tickIn.y}" stroke="rgba(201,168,76,0.1)" stroke-width="0.5"/>`;
  }

  // ─ 5. ASC / DSC / MC / IC badges ─
  const badges = [
    { label: 'ASC', lon: chart.positions.Ascendant?.longitude, bg: '#C9A84C', text: '#060B18' },
    { label: 'DSC', lon: chart.positions.Ascendant ? (chart.positions.Ascendant.longitude + 180) % 360 : 0, bg: '#3DB8A0', text: '#060B18' },
    { label: 'MC',  lon: chart.positions.Midheaven?.longitude, bg: '#D4BE7A', text: '#060B18' },
    { label: 'IC',  lon: chart.positions.Midheaven ? (chart.positions.Midheaven.longitude + 180) % 360 : 0, bg: '#4A7AE5', text: '#FFFFFF' },
  ];

  for (const b of badges) {
    if (b.lon === undefined) continue;
    const ang = lon2a(b.lon);
    const bp  = polar(R_OUT + 15, ang);
    s += `<rect x="${bp.x - 16}" y="${bp.y - 9}" width="32" height="18" rx="5" fill="${b.bg}" opacity="0.9"/>`;
    s += `<text x="${bp.x}" y="${bp.y + 4}" fill="${b.text}" font-size="8" font-weight="700" text-anchor="middle" font-family="Inter, sans-serif">${b.label}</text>`;
  }

  svg.innerHTML = s;
}

/* ═══════════════════════════════════════════════════════════════════════════════
   TAB SWITCHING
   ═══════════════════════════════════════════════════════════════════════════════ */

function switchTab(name) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');

  const btn = document.getElementById('tab-btn-' + name);
  if (btn) btn.classList.add('active');

  const tab = document.getElementById('tab-' + name);
  if (tab) tab.style.display = 'block';
}

/* ═══════════════════════════════════════════════════════════════════════════════
   CHAT — AI Counselor
   ═══════════════════════════════════════════════════════════════════════════════ */

function triggerPresetPrompt(txt) {
  document.getElementById('user-prompt').value = txt;
  sendChatPrompt();
}

async function sendChatPrompt() {
  if (isSending) return;

  const inp = document.getElementById('user-prompt');
  const txt = inp.value.trim();
  if (!txt) return;

  const box = document.getElementById('chat-messages');
  const sendBtn = document.getElementById('send-btn');

  isSending = true;
  sendBtn.disabled = true;

  // User message bubble
  const u = document.createElement('div');
  u.className = 'message user';
  u.textContent = txt;
  box.appendChild(u);
  inp.value = '';
  chatHistory.push({ role: 'user', content: txt });

  // Typing indicator
  const typing = document.createElement('div');
  typing.className = 'message assistant';
  typing.innerHTML = `
    <div class="typing-indicator">
      <span></span><span></span><span></span>
      <span class="typing-label">Consulting the stars...</span>
    </div>`;
  box.appendChild(typing);
  box.scrollTop = box.scrollHeight;

  try {
    const r = await fetch('/api/ai-astrologer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: txt,
        chartData: currentChartData,
        history: chatHistory
      })
    });
    const d = await r.json();

    // Replace typing indicator with response
    if (d.success && d.response) {
      typing.innerHTML = formatMarkdown(d.response);
      chatHistory.push({ role: 'assistant', content: d.response });
    } else {
      typing.innerHTML = '<em style="color:var(--text-muted)">Unable to generate a response. Please try again.</em>';
    }
  } catch (_) {
    typing.innerHTML = '<em style="color:var(--text-muted)">Connection error. Please check your network and try again.</em>';
  } finally {
    isSending = false;
    sendBtn.disabled = false;
    box.scrollTop = box.scrollHeight;
    inp.focus();
  }
}

/* ─── Markdown Formatter ──────────────────────────────────────────────────── */

function formatMarkdown(text) {
  return text
    // Headers
    .replace(/#### (.*?)(\n|$)/g, '<h4>$1</h4>')
    .replace(/### (.*?)(\n|$)/g, '<h4>$1</h4>')
    .replace(/## (.*?)(\n|$)/g, '<h4>$1</h4>')
    // Bold & italic
    .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // Lists
    .replace(/^[-•] (.*)/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>')
    // Clean up nested ul
    .replace(/<\/ul>\s*<ul>/g, '')
    // Numbered lists
    .replace(/^\d+\.\s+(.*)/gm, '<li>$1</li>')
    // Line breaks
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g, '<br>');
}
