/**
 * PLACIDUS AI — Astrological Observatory Controller
 * Pure Vanilla JavaScript (No Node/TypeScript runtime dependencies).
 */

'use strict';

/* ─── State ─────────────────────────────────────────────────────────────────── */
let activeChartData = null;
let geocodeDebounceTimer = null;
let chatHistory = [];
let isCalculating = false;
let isChatSending = false;

/* ─── Astrological Constants & Symbols ───────────────────────────────────────── */
const ZODIAC_SIGNS = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'
];

const SIGN_GLYPHS = {
  Aries: '♈', Taurus: '♉', Gemini: '♊', Cancer: '♋',
  Leo: '♌', Virgo: '♍', Libra: '♎', Scorpio: '♏',
  Sagittarius: '♐', Capricorn: '♑', Aquarius: '♒', Pisces: '♓'
};

const PLANET_GLYPHS = {
  Sun: '☉', Moon: '☽', Mercury: '☿', Venus: '♀', Mars: '♂',
  Jupiter: '♃', Saturn: '♄', Uranus: '♅', Neptune: '♆', Pluto: '♇',
  'North Node': '☊', 'South Node': '☋', Chiron: '⚷',
  Ascendant: 'AC', Midheaven: 'MC', 'Part of Fortune': '⊗', 'Part of Spirit': '⊕'
};

const SIGN_ELEMENTS = {
  Aries: 'Fire', Leo: 'Fire', Sagittarius: 'Fire',
  Taurus: 'Earth', Virgo: 'Earth', Capricorn: 'Earth',
  Gemini: 'Air', Libra: 'Air', Aquarius: 'Air',
  Cancer: 'Water', Scorpio: 'Water', Pisces: 'Water'
};

const ELEMENT_STYLES = {
  Fire:  { fill: 'rgba(214, 122, 104, 0.12)', text: '#D67A68', stroke: '#9E4E3F' },
  Earth: { fill: 'rgba(107, 196, 166, 0.12)', text: '#6BC4A6', stroke: '#3A7863' },
  Air:   { fill: 'rgba(222, 192, 120, 0.12)', text: '#DEC078', stroke: '#9E8238' },
  Water: { fill: 'rgba(120, 164, 224, 0.12)', text: '#78A4E0', stroke: '#3F67A0' }
};

const ASPECT_COLORS = {
  conjunction: '#D8B979',
  sextile: '#6BC4A6',
  square: '#E06C75',
  trine: '#61AFEF',
  opposition: '#E5566E'
};

const ASPECT_GLYPHS = {
  conjunction: '☌',
  sextile: '⚹',
  square: '□',
  trine: '△',
  opposition: '☍'
};

/* ─── Historical Sample Presets ──────────────────────────────────────────────── */
const PRESETS = {
  carl_jung: {
    name: 'Carl Gustav Jung',
    city: 'Kesswil, Switzerland',
    lat: 47.5992,
    lon: 9.3178,
    tz: 1.0,
    date: '1875-07-26',
    time: '19:32'
  },
  marie_curie: {
    name: 'Marie Curie',
    city: 'Warsaw, Poland',
    lat: 52.2297,
    lon: 21.0122,
    tz: 1.0,
    date: '1867-11-07',
    time: '12:00'
  },
  leonardo: {
    name: 'Leonardo da Vinci',
    city: 'Vinci, Italy',
    lat: 43.7844,
    lon: 10.9256,
    tz: 1.0,
    date: '1452-04-15',
    time: '21:40'
  },
  delhi_now: {
    name: 'Current Sky Observer',
    city: 'New Delhi, India',
    lat: 28.6139,
    lon: 77.2090,
    tz: 5.5,
    date: new Date().toISOString().split('T')[0],
    time: new Date().toTimeString().split(' ')[0].substring(0, 5)
  }
};

/* ─── Initialization ─────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  initObservatoryStarfield();
  initLocationAutocompletion();
  initFormListeners();

  // Set default initial date to today
  const todayStr = new Date().toISOString().split('T')[0];
  const dateInput = document.getElementById('input-date');
  if (dateInput && !dateInput.value) {
    dateInput.value = '1995-05-15';
  }

  // Pre-fill default city
  const cityInput = document.getElementById('city-search');
  if (cityInput && !cityInput.value) {
    cityInput.value = 'New Delhi, India';
  }
  const tzSelect = document.getElementById('select-timezone');
  if (tzSelect) {
    tzSelect.value = '5.5';
  }
});

/* ─── Starfield Canvas Background ────────────────────────────────────────────── */
function initObservatoryStarfield() {
  const canvas = document.getElementById('starfield-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let stars = [];
  let w = (canvas.width = window.innerWidth);
  let h = (canvas.height = window.innerHeight);

  function createField() {
    stars = [];
    const count = Math.floor((w * h) / 6000);
    for (let i = 0; i < count; i++) {
      stars.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.1 + 0.3,
        alpha: Math.random() * 0.5 + 0.1,
        speed: Math.random() * 0.002 + 0.0008,
        phase: Math.random() * Math.PI * 2
      });
    }
  }

  function render(time) {
    ctx.clearRect(0, 0, w, h);
    for (const s of stars) {
      const a = s.alpha + Math.sin(time * s.speed + s.phase) * 0.2;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(244, 232, 208, ${Math.max(0.04, a)})`;
      ctx.fill();
    }
    requestAnimationFrame(render);
  }

  window.addEventListener('resize', () => {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
    createField();
  });

  createField();
  requestAnimationFrame(render);
}

/* ─── Location & Timezone Auto-Detection ──────────────────────────────────────── */
function initLocationAutocompletion() {
  const cityInput = document.getElementById('city-search');
  const dropdown = document.getElementById('city-dropdown');
  if (!cityInput || !dropdown) return;

  cityInput.addEventListener('input', e => {
    clearTimeout(geocodeDebounceTimer);
    const query = e.target.value.trim();
    if (query.length < 2) {
      dropdown.style.display = 'none';
      return;
    }

    geocodeDebounceTimer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        if (data.success && data.results && data.results.length > 0) {
          renderCityDropdown(data.results);
        } else {
          dropdown.style.display = 'none';
        }
      } catch (err) {
        dropdown.style.display = 'none';
      }
    }, 250);
  });

  // Close dropdown on outside click
  document.addEventListener('click', e => {
    if (!e.target.closest('#city-search') && !e.target.closest('#city-dropdown')) {
      dropdown.style.display = 'none';
    }
  });
}

function renderCityDropdown(cities) {
  const dropdown = document.getElementById('city-dropdown');
  dropdown.innerHTML = '';

  cities.forEach(item => {
    const row = document.createElement('div');
    row.className = 'autocomplete-item';
    row.innerHTML = `
      <div>
        <strong>${item.city}</strong>
        <span style="opacity: 0.65; margin-left: 0.35rem; font-size: 0.8rem;">${item.fullName || item.country || ''}</span>
      </div>
      <span class="autocomplete-coords">${item.lat.toFixed(2)}°, ${item.lon.toFixed(2)}°</span>
    `;

    row.addEventListener('click', () => {
      document.getElementById('city-search').value = item.fullName || item.city;
      document.getElementById('geo-lat').value = item.lat;
      document.getElementById('geo-lon').value = item.lon;
      dropdown.style.display = 'none';
      detectAndSetTimezone(item.lat, item.lon);
    });

    dropdown.appendChild(row);
  });

  dropdown.style.display = 'block';
}

async function detectAndSetTimezone(lat, lon) {
  const tzSelect = document.getElementById('select-timezone');
  const tzStatus = document.getElementById('timezone-status');
  if (!tzSelect) return;

  try {
    if (tzStatus) tzStatus.textContent = 'Auto-detecting timezone...';
    const res = await fetch(`/api/timezone?lat=${lat}&lon=${lon}`);
    const data = await res.json();

    if (data.success && typeof data.offset === 'number') {
      const offset = data.offset;
      let bestOption = tzSelect.options[0];
      let minDiff = 999;

      for (let i = 0; i < tzSelect.options.length; i++) {
        const optVal = parseFloat(tzSelect.options[i].value);
        const diff = Math.abs(optVal - offset);
        if (diff < minDiff) {
          minDiff = diff;
          bestOption = tzSelect.options[i];
        }
      }

      if (bestOption) {
        tzSelect.value = bestOption.value;
        if (tzStatus) {
          tzStatus.textContent = `Auto-detected: UTC ${offset >= 0 ? '+' : ''}${offset}`;
        }
      }
    }
  } catch (err) {
    if (tzStatus) tzStatus.textContent = 'Auto-selection from longitude';
  }
}

/* ─── Preset Profile Loader ──────────────────────────────────────────────────── */
function loadPreset(presetKey) {
  const p = PRESETS[presetKey];
  if (!p) return;

  document.getElementById('input-name').value = p.name;
  document.getElementById('city-search').value = p.city;
  document.getElementById('geo-lat').value = p.lat;
  document.getElementById('geo-lon').value = p.lon;
  document.getElementById('input-date').value = p.date;
  document.getElementById('input-time').value = p.time;

  const tzSelect = document.getElementById('select-timezone');
  if (tzSelect) {
    tzSelect.value = String(p.tz);
  }

  const tzStatus = document.getElementById('timezone-status');
  if (tzStatus) {
    tzStatus.textContent = `Preset UTC ${p.tz >= 0 ? '+' : ''}${p.tz}`;
  }
}

/* ─── Form Submission & Chart Calculation ────────────────────────────────────── */
function initFormListeners() {
  const form = document.getElementById('birth-form');
  if (!form) return;

  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (isCalculating) return;

    const btn = document.getElementById('btn-submit');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span>Computing Ephemeris...</span>';
    btn.disabled = true;
    isCalculating = true;

    const payload = {
      name: document.getElementById('input-name').value || 'Seeker',
      birthDate: document.getElementById('input-date').value,
      birthTime: document.getElementById('input-time').value || '12:00',
      cityName: document.getElementById('city-search').value || 'Selected Location',
      latitude: parseFloat(document.getElementById('geo-lat').value) || 0.0,
      longitude: parseFloat(document.getElementById('geo-lon').value) || 0.0,
      timezoneOffset: parseFloat(document.getElementById('select-timezone').value) || 0.0
    };

    try {
      const res = await fetch('/api/calculate-chart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      const data = await res.json();
      if (data.success && data.chartData) {
        activeChartData = data.chartData;
        renderObservatory(activeChartData, payload);
        showWorkspaceScreen();
      }
    } catch (err) {
      alert(`Calculation error: ${err.message || err}`);
    } finally {
      btn.innerHTML = originalText;
      btn.disabled = false;
      isCalculating = false;
    }
  });
}

/* ─── Screen Switching ───────────────────────────────────────────────────────── */
function showCalculationScreen() {
  document.getElementById('screen-calculation').style.display = 'flex';
  document.getElementById('screen-workspace').style.display = 'none';
  document.getElementById('active-chart-badge').style.display = 'none';
  document.getElementById('btn-edit-details').style.display = 'none';
}

function showWorkspaceScreen() {
  document.getElementById('screen-calculation').style.display = 'none';
  document.getElementById('screen-workspace').style.display = 'grid';
  document.getElementById('active-chart-badge').style.display = 'flex';
  document.getElementById('btn-edit-details').style.display = 'inline-block';
}

/* ─── Render Full Observatory Workspace ──────────────────────────────────────── */
function renderObservatory(chart, requestPayload) {
  // Update Header Badge
  document.getElementById('active-location-name').textContent = 
    `${chart.name || 'Natal Chart'} · ${requestPayload.cityName || 'Chart'}`;

  // Update Sect & Archetype Banner
  document.getElementById('banner-sect').textContent = chart.sect || 'Diurnal';
  document.getElementById('banner-ruler').textContent = chart.ascendant_ruler || chart.ascendantRuler || 'Sun';
  document.getElementById('banner-benefic').textContent = chart.benefic_of_sect || chart.beneficOfSect || 'Jupiter';
  document.getElementById('banner-malefic').textContent = chart.malefic_of_sect || chart.maleficOfSect || 'Saturn';

  const fortune = chart.part_of_fortune || chart.partOfFortune;
  if (fortune) {
    document.getElementById('banner-fortune').textContent = fortune.formatted || `${fortune.degree}° ${fortune.sign}`;
  }

  // Draw the Astro-Seek interactive SVG wheel
  drawPlacidusWheel(chart);

  // Render Data Tables
  renderPlanetsTable(chart);
  renderHousesTable(chart);
  renderAspectMatrix(chart);
  renderElementalBalance(chart);
}

/* ─── Draw SVG Placidus Chart Wheel (Astro-Seek Geometry) ─────────────────────── */
function drawPlacidusWheel(chart) {
  const svg = document.getElementById('chart-wheel-svg');
  if (!svg) return;

  const CX = 300, CY = 300;
  const R_OUT = 270;
  const R_SIGN = 226;
  const R_PLT = 188;
  const R_HOUSE = 144;
  const R_NUM = 120;

  // Ascendant longitude defines orientation (ASC at 180° / 9 o'clock)
  const ascLon = chart.ascendant ? chart.ascendant.longitude : (chart.houses?.[0]?.longitude || 0);

  function lonToAngle(lon) {
    return ((180 + (lon - ascLon)) % 360 + 360) % 360;
  }

  function polarToXY(r, aDeg) {
    const rad = (aDeg * Math.PI) / 180.0;
    return {
      x: CX + r * Math.cos(rad),
      y: CY - r * Math.sin(rad)
    };
  }

  let svgHtml = '';

  // 1. Concentric Background Rings
  svgHtml += `<circle cx="${CX}" cy="${CY}" r="${R_OUT}" fill="#0A0E17" stroke="#3A4866" stroke-width="1.5"/>`;
  svgHtml += `<circle cx="${CX}" cy="${CY}" r="${R_SIGN}" fill="none" stroke="#2D3B55" stroke-width="1"/>`;
  svgHtml += `<circle cx="${CX}" cy="${CY}" r="${R_HOUSE}" fill="#070A10" stroke="#3A4866" stroke-width="1"/>`;

  // 2. Zodiac Sign Bands (12 Sectors)
  for (let i = 0; i < 12; i++) {
    const signName = ZODIAC_SIGNS[i];
    const elem = SIGN_ELEMENTS[signName];
    const col = ELEMENT_STYLES[elem] || ELEMENT_STYLES.Fire;

    const a1 = lonToAngle(i * 30.0);
    const a2 = lonToAngle((i + 1) * 30.0);

    const pO1 = polarToXY(R_OUT, a1);
    const pO2 = polarToXY(R_OUT, a2);
    const pI1 = polarToXY(R_SIGN, a1);
    const pI2 = polarToXY(R_SIGN, a2);

    const sweep = ((a2 - a1) % 360 + 360) % 360;
    const lg = sweep > 180 ? 1 : 0;

    // Sector path
    svgHtml += `<path d="M${pO1.x},${pO1.y} A${R_OUT},${R_OUT} 0 ${lg} 0 ${pO2.x},${pO2.y} L${pI2.x},${pI2.y} A${R_SIGN},${R_SIGN} 0 ${lg} 1 ${pI1.x},${pI1.y} Z" fill="${col.fill}" stroke="rgba(184, 151, 88, 0.15)" stroke-width="0.5"/>`;

    // Division radial line
    svgHtml += `<line x1="${pO1.x}" y1="${pO1.y}" x2="${pI1.x}" y2="${pI1.y}" stroke="rgba(184, 151, 88, 0.25)" stroke-width="0.75"/>`;

    // Sign Glyph at midpoint
    const midAngle = lonToAngle(i * 30.0 + 15.0);
    const pMid = polarToXY((R_OUT + R_SIGN) / 2, midAngle);
    svgHtml += `<text x="${pMid.x}" y="${pMid.y + 5}" fill="${col.text}" font-size="15" font-weight="600" text-anchor="middle" font-family="serif">${SIGN_GLYPHS[signName]}</text>`;
  }

  // 3. Placidus House Cusps
  const houses = chart.houses || [];
  houses.forEach((h, idx) => {
    const houseNum = h.house_number || h.house || (idx + 1);
    const cuspLon = h.longitude;
    const ang = lonToAngle(cuspLon);

    const pOut = polarToXY(R_SIGN, ang);
    const pIn = polarToXY(R_HOUSE, ang);

    const isAngular = [1, 4, 7, 10].includes(houseNum);
    const strokeWidth = isAngular ? 2.0 : 0.8;
    const strokeColor = isAngular ? '#D8B979' : 'rgba(184, 151, 88, 0.22)';

    svgHtml += `<line x1="${pIn.x}" y1="${pIn.y}" x2="${pOut.x}" y2="${pOut.y}" stroke="${strokeColor}" stroke-width="${strokeWidth}"/>`;

    // House number label inside wedge
    const nextH = houses[(idx + 1) % houses.length];
    const nextLon = nextH ? nextH.longitude : (cuspLon + 30);
    const midHouseLon = (cuspLon + ((nextLon - cuspLon + 360) % 360) / 2) % 360;
    const pNum = polarToXY(R_NUM, lonToAngle(midHouseLon));
    svgHtml += `<text x="${pNum.x}" y="${pNum.y + 4}" fill="#7A879E" font-size="11" font-family="monospace" text-anchor="middle">${houseNum}</text>`;
  });

  // 4. Major Aspects Internal Chords
  const aspects = chart.aspects || [];
  const planetsList = chart.planets || [];
  const planetPosMap = {};

  planetsList.forEach(p => {
    planetPosMap[p.name] = polarToXY(R_HOUSE, lonToAngle(p.longitude));
  });

  aspects.forEach((asp, idx) => {
    const p1 = asp.planet1 || asp.p1;
    const p2 = asp.planet2 || asp.p2;
    const type = (asp.aspect || '').toLowerCase();
    const color = ASPECT_COLORS[type] || 'rgba(184, 151, 88, 0.5)';

    const pt1 = planetPosMap[p1];
    const pt2 = planetPosMap[p2];

    if (pt1 && pt2) {
      svgHtml += `<line class="wheel-aspect-chord" data-p1="${p1}" data-p2="${p2}" x1="${pt1.x}" y1="${pt1.y}" x2="${pt2.x}" y2="${pt2.y}" stroke="${color}" stroke-width="1" opacity="0.45"/>`;
    }
  });

  // 5. Planetary Glyphs Placed Around Wheel
  planetsList.forEach(p => {
    const ang = lonToAngle(p.longitude);
    const pt = polarToXY(R_PLT, ang);
    const glyph = PLANET_GLYPHS[p.name] || p.name[0];
    const retro = p.retrograde ? '℞' : '';

    svgHtml += `
      <g class="wheel-planet-group" data-planet="${p.name}" onmouseenter="highlightAspects('${p.name}')" onmouseleave="clearAspectHighlights()">
        <circle cx="${pt.x}" cy="${pt.y}" r="12" fill="#0E131E" stroke="rgba(184, 151, 88, 0.4)" stroke-width="1"/>
        <text x="${pt.x}" y="${pt.y + 4}" fill="#F4E8D0" font-size="13" font-weight="600" text-anchor="middle" font-family="serif">
          ${glyph}
        </text>
        ${retro ? `<text x="${pt.x + 8}" y="${pt.y - 4}" fill="#E06C75" font-size="9" font-family="sans-serif">${retro}</text>` : ''}
        <title>${p.name}: ${p.sign_degree || Math.floor(p.longitude % 30)}° ${p.sign} ${p.sign_minute || 0}' (House ${p.house})</title>
      </g>
    `;
  });

  // Center Astrolabe Sigil
  svgHtml += `<circle cx="${CX}" cy="${CY}" r="6" fill="#D8B979" stroke="#080B11" stroke-width="2"/>`;

  svg.innerHTML = svgHtml;
}

/* Aspect Highlight on Hover */
function highlightAspects(planetName) {
  const chords = document.querySelectorAll('.wheel-aspect-chord');
  chords.forEach(c => {
    const p1 = c.getAttribute('data-p1');
    const p2 = c.getAttribute('data-p2');
    if (p1 === planetName || p2 === planetName) {
      c.style.opacity = '1';
      c.style.strokeWidth = '2.5px';
    } else {
      c.style.opacity = '0.08';
    }
  });
}

function clearAspectHighlights() {
  const chords = document.querySelectorAll('.wheel-aspect-chord');
  chords.forEach(c => {
    c.style.opacity = '0.45';
    c.style.strokeWidth = '1px';
  });
}

/* ─── Render Planets Table ───────────────────────────────────────────────────── */
function renderPlanetsTable(chart) {
  const tbody = document.getElementById('tbody-planets');
  if (!tbody) return;
  tbody.innerHTML = '';

  const planets = chart.planets || [];
  planets.forEach(p => {
    const tr = document.createElement('tr');
    const deg = p.sign_degree !== undefined ? p.sign_degree : Math.floor(p.longitude % 30);
    const min = p.sign_minute !== undefined ? p.sign_minute : Math.floor((p.longitude % 1) * 60);
    const motion = p.retrograde ? '<span style="color:#E06C75">Retrograde (℞)</span>' : 'Direct';
    const dignityClass = `badge-${(p.dignity || 'peregrine').toLowerCase()}`;

    tr.innerHTML = `
      <td><strong>${PLANET_GLYPHS[p.name] || '✦'} ${p.name}</strong></td>
      <td style="font-family:monospace;">${deg}° ${p.sign} ${String(min).padStart(2, '0')}'</td>
      <td>House ${p.house || '—'}</td>
      <td>${motion}</td>
      <td><span class="badge-pill ${dignityClass}">${(p.dignity || 'Peregrine').toUpperCase()}</span></td>
      <td>${p.element || SIGN_ELEMENTS[p.sign] || '—'}</td>
      <td style="color:#A6AFBD;">${p.nakshatra || '—'}</td>
    `;
    tbody.appendChild(tr);
  });
}

/* ─── Render Houses Table ────────────────────────────────────────────────────── */
function renderHousesTable(chart) {
  const tbody = document.getElementById('tbody-houses');
  if (!tbody) return;
  tbody.innerHTML = '';

  const houses = chart.houses || [];
  houses.forEach((h, idx) => {
    const tr = document.createElement('tr');
    const hNum = h.house_number || h.house || (idx + 1);
    const deg = h.sign_degree !== undefined ? h.sign_degree : Math.floor(h.longitude % 30);
    const min = h.sign_minute !== undefined ? h.sign_minute : Math.floor((h.longitude % 1) * 60);

    tr.innerHTML = `
      <td><strong>House ${hNum}</strong></td>
      <td>${SIGN_GLYPHS[h.sign] || ''} ${h.sign}</td>
      <td style="font-family:monospace;">${deg}° ${h.sign} ${String(min).padStart(2, '0')}'</td>
      <td style="color:var(--brass-bright);">${h.ruler || '—'}</td>
    `;
    tbody.appendChild(tr);
  });
}

/* ─── Render Aspect Matrix (Triangular Table) ────────────────────────────────── */
function renderAspectMatrix(chart) {
  const table = document.getElementById('matrix-table');
  if (!table) return;

  const keyBodies = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto', 'North Node'];
  const aspectLookup = {};

  (chart.aspects || []).forEach(a => {
    const p1 = a.planet1 || a.p1;
    const p2 = a.planet2 || a.p2;
    aspectLookup[`${p1}_${p2}`] = a;
    aspectLookup[`${p2}_${p1}`] = a;
  });

  let html = '<thead><tr><th></th>';
  keyBodies.forEach(p => {
    html += `<th title="${p}">${PLANET_GLYPHS[p] || p[0]}</th>`;
  });
  html += '</tr></thead><tbody>';

  for (let i = 0; i < keyBodies.length; i++) {
    const rowP = keyBodies[i];
    html += `<tr><th>${PLANET_GLYPHS[rowP] || rowP[0]}</th>`;

    for (let j = 0; j < keyBodies.length; j++) {
      if (j >= i) {
        html += '<td style="background:rgba(255,255,255,0.01);"></td>';
      } else {
        const colP = keyBodies[j];
        const asp = aspectLookup[`${rowP}_${colP}`];
        if (asp) {
          const type = (asp.aspect || '').toLowerCase();
          const glyph = ASPECT_GLYPHS[type] || '☌';
          const col = ASPECT_COLORS[type] || '#D8B979';
          html += `<td class="has-aspect" style="color:${col};" title="${rowP} ${asp.aspect} ${colP} (Orb: ${asp.orb}°)">${glyph}</td>`;
        } else {
          html += '<td></td>';
        }
      }
    }
    html += '</tr>';
  }

  html += '</tbody>';
  table.innerHTML = html;
}

/* ─── Render Elemental & Modality Balance ────────────────────────────────────── */
function renderElementalBalance(chart) {
  const eb = chart.element_balance || {};
  const mb = chart.modality_balance || {};

  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val !== undefined ? val : 0;
  };

  setVal('balance-fire', eb.fire || eb.Fire);
  setVal('balance-earth', eb.earth || eb.Earth);
  setVal('balance-air', eb.air || eb.Air);
  setVal('balance-water', eb.water || eb.Water);

  setVal('balance-cardinal', mb.cardinal || mb.Cardinal);
  setVal('balance-fixed', mb.fixed || mb.Fixed);
  setVal('balance-mutable', mb.mutable || mb.Mutable);
}

/* ─── Tab Switching ──────────────────────────────────────────────────────────── */
function switchDataTab(tabId) {
  const tabs = ['planets', 'houses', 'matrix', 'balance'];
  tabs.forEach(t => {
    const pane = document.getElementById(`tab-pane-${t}`);
    if (pane) pane.style.display = t === tabId ? 'block' : 'none';
  });

  const buttons = document.querySelectorAll('.tab-btn');
  buttons.forEach(b => {
    b.classList.remove('active');
    if (b.getAttribute('onclick')?.includes(tabId)) {
      b.classList.add('active');
    }
  });
}

/* ─── Counselor AI Consultation ──────────────────────────────────────────────── */
function askCounselorPreset(question) {
  const input = document.getElementById('chat-input');
  if (input) {
    input.value = question;
    submitCounselorQuery(question);
  }
}

function handleChatSubmit(e) {
  e.preventDefault();
  const input = document.getElementById('chat-input');
  if (!input) return;
  const question = input.value.trim();
  if (!question || isChatSending) return;
  submitCounselorQuery(question);
}

async function submitCounselorQuery(message) {
  const stream = document.getElementById('chat-stream');
  const input = document.getElementById('chat-input');
  const btn = document.getElementById('btn-chat-send');

  // Append user bubble
  const userBubble = document.createElement('div');
  userBubble.className = 'chat-bubble user';
  userBubble.textContent = message;
  stream.appendChild(userBubble);
  input.value = '';

  // Append thinking assistant placeholder
  const assistBubble = document.createElement('div');
  assistBubble.className = 'chat-bubble assistant';
  assistBubble.innerHTML = `<em>Consulting Hellenistic sources & ephemeris...</em>`;
  stream.appendChild(assistBubble);
  stream.scrollTop = stream.scrollHeight;

  isChatSending = true;
  if (btn) btn.disabled = true;

  try {
    const res = await fetch('/api/v1/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: message,
        chart_data: activeChartData,
        response_mode: 'auto',
        history: chatHistory
      })
    });

    if (!res.ok) {
      throw new Error(await res.text());
    }

    const data = await res.json();
    let formattedText = formatMarkdown(data.message || 'No interpretation generated.');

    // Append citations if available and not already rendered in message
    if (data.citations && data.citations.length > 0 && !formattedText.includes('Classical Astrological Teaching') && !formattedText.includes('Manuscript References')) {
      formattedText += '<div style="margin-top: 1rem; border-top: 1px solid var(--border-hairline); padding-top: 0.75rem;">';
      formattedText += '<div style="font-size: 0.75rem; text-transform: uppercase; color: var(--brass-mid); font-family: monospace; margin-bottom: 0.4rem;">Authoritative Sources & Citations:</div>';
      data.citations.slice(0, 2).forEach(c => {
        formattedText += `
          <div class="citation-box">
            <div class="citation-source">${c.source} · ${c.chapter} (p. ${c.page})</div>
            <div>"${c.text.slice(0, 220)}..."</div>
          </div>
        `;
      });
      formattedText += '</div>';
    }

    assistBubble.innerHTML = formattedText;
    chatHistory.push({ role: 'user', content: message });
    chatHistory.push({ role: 'assistant', content: data.message });
  } catch (err) {
    assistBubble.innerHTML = `<span style="color: #E06C75;">Consultation error: ${err.message || err}</span>`;
  } finally {
    isChatSending = false;
    if (btn) btn.disabled = false;
    stream.scrollTop = stream.scrollHeight;
  }
}

/* Simple Markdown formatter for clean reading */
function formatMarkdown(text) {
  let html = text
    .replace(/^### (.*$)/gim, '<h4 style="font-family:var(--font-serif); color:var(--brass-pale); margin:0.75rem 0 0.35rem;">$1</h4>')
    .replace(/^## (.*$)/gim, '<h3 style="font-family:var(--font-serif); color:var(--brass-bright); margin:0.9rem 0 0.4rem;">$1</h3>')
    .replace(/\*\*(.*?)\*\*/gim, '<strong style="color:var(--brass-pale);">$1</strong>')
    .replace(/\*(.*?)\*/gim, '<em>$1</em>')
    .replace(/^> (.*$)/gim, '<blockquote style="border-left: 2px solid var(--brass-dim); padding-left: 0.75rem; color: var(--text-secondary); margin: 0.5rem 0;">$1</blockquote>')
    .replace(/\n\n/g, '<br><br>');
  return html;
}
