let currentChartData = null;
let geocodeTimeout = null;

const ZODIAC_SIGNS = [
  "Aries", "Taurus", "Gemini", "Cancer", 
  "Leo", "Virgo", "Libra", "Scorpio", 
  "Sagittarius", "Capricorn", "Aquarius", "Pisces"
];

const ZODIAC_SYMBOLS = {
  "Aries": "♈", "Taurus": "♉", "Gemini": "♊", "Cancer": "♋",
  "Leo": "♌", "Virgo": "♍", "Libra": "♎", "Scorpio": "♏",
  "Sagittarius": "♐", "Capricorn": "♑", "Aquarius": "♒", "Pisces": "♓"
};

// Zodiac Element Colors (Astro-Seek standard theme)
const ELEMENT_COLORS = {
  "Fire": { bg: "rgba(220, 38, 38, 0.25)", text: "#fca5a5", stroke: "#ef4444" },
  "Earth": { bg: "rgba(5, 150, 105, 0.25)", text: "#6ee7b7", stroke: "#10b981" },
  "Air": { bg: "rgba(2, 132, 199, 0.25)", text: "#93c5fd", stroke: "#38bdf8" },
  "Water": { bg: "rgba(124, 58, 237, 0.25)", text: "#d8b4fe", stroke: "#a855f7" }
};

const PLANET_GLYPHS = {
  "Sun": "☉", "Moon": "☽", "Mercury": "☿", "Venus": "♀", "Mars": "♂",
  "Jupiter": "♃", "Saturn": "♄", "Uranus": "♅", "Neptune": "♆", "Pluto": "♇",
  "North Node": "☊", "South Node": "☋", "Ascendant": "ASC", "Midheaven": "MC"
};

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('chart-form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    calculateAndRenderChart();
  });

  // City Autocomplete Handler
  const cityInput = document.getElementById('citySearch');
  cityInput.addEventListener('input', handleCityInput);
  cityInput.addEventListener('focus', () => handleCityInput({ target: cityInput }));

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#citySearch') && !e.target.closest('#citySuggestions')) {
      document.getElementById('citySuggestions').style.display = 'none';
    }
  });
});

function handleCityInput(e) {
  const query = e.target.value.trim();
  clearTimeout(geocodeTimeout);

  geocodeTimeout = setTimeout(async () => {
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (data.success && data.results.length > 0) {
        renderCitySuggestions(data.results);
      }
    } catch (err) {
      console.warn("City geocode error:", err);
    }
  }, 250);
}

function renderCitySuggestions(results) {
  const dropdown = document.getElementById('citySuggestions');
  dropdown.innerHTML = '';

  results.forEach(item => {
    const div = document.createElement('div');
    div.className = 'city-suggestion-item';
    div.innerHTML = `📍 <strong>${item.city}</strong> <small style="color:var(--text-muted);">(${item.fullName || item.country || ''})</small>`;
    div.addEventListener('click', () => {
      document.getElementById('citySearch').value = item.fullName || item.city;
      document.getElementById('latitude').value = item.lat;
      document.getElementById('longitude').value = item.lon;
      dropdown.style.display = 'none';
    });
    dropdown.appendChild(div);
  });

  dropdown.style.display = 'block';
}

async function calculateAndRenderChart() {
  const birthDate = document.getElementById('birthDate').value;
  const birthTime = document.getElementById('birthTime').value;
  const latitude = document.getElementById('latitude').value;
  const longitude = document.getElementById('longitude').value;
  const cityName = document.getElementById('citySearch').value;

  try {
    const response = await fetch('/api/calculate-chart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ birthDate, birthTime, latitude, longitude, cityName })
    });

    const data = await response.json();
    if (data.success) {
      currentChartData = data.chartData;
      renderTables(currentChartData);
      renderAstroSeekWheelSVG(currentChartData);

      // Update location headers
      document.getElementById('active-city-badge').textContent = `📍 ${cityName}`;
      document.getElementById('chart-location-subtitle').textContent = `${cityName} (${birthDate} ${birthTime})`;

      // Switch UI to Step 2
      showStep2();
    }
  } catch (err) {
    console.error("Failed to calculate chart:", err);
  }
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

function renderTables(chartData) {
  // Planets Table
  const pBody = document.getElementById('planets-table-body');
  pBody.innerHTML = '';
  Object.values(chartData.positions).forEach(p => {
    const tr = document.createElement('tr');
    const elemClass = p.element ? `badge-${p.element.toLowerCase()}` : '';
    tr.innerHTML = `
      <td><strong style="color:var(--accent-gold);">${p.symbol || ''} ${p.name}</strong></td>
      <td>${p.formatted || ''}</td>
      <td>H${p.house || '-'}</td>
      <td><span class="badge ${elemClass}">${p.element || '-'}</span></td>
    `;
    pBody.appendChild(tr);
  });

  // House Cusps Table
  const hBody = document.getElementById('houses-table-body');
  hBody.innerHTML = '';
  chartData.houses.forEach(h => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>House ${h.house}</strong></td>
      <td>${h.signSymbol} ${h.sign}</td>
      <td>${h.degree}°</td>
    `;
    hBody.appendChild(tr);
  });

  // Aspects Table
  const aBody = document.getElementById('aspects-table-body');
  aBody.innerHTML = '';
  chartData.aspects.forEach(a => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong style="color:var(--accent-gold-bright);">${a.symbol} ${a.aspect}</strong></td>
      <td>${a.p1} - ${a.p2}</td>
      <td>${a.orb}°</td>
    `;
    aBody.appendChild(tr);
  });
}

/**
 * ASTRO-SEEK STANDARD NATAL CHART WHEEL RENDERER
 * - Ascendant placed EXACTLY at 9 o'clock (180° horizontal axis)
 * - Counter-clockwise ecliptic longitude orientation
 * - Inner hub color-coded aspect chords
 * - Planet glyph collision avoidance
 */
function renderAstroSeekWheelSVG(chartData) {
  const svg = document.getElementById('chart-wheel-svg');
  const cx = 300;
  const cy = 300;
  const outerR = 270;
  const zodiacInnerR = 215;
  const houseRingR = 145;
  const aspectR = 145;

  const ascLon = chartData.positions.Ascendant ? chartData.positions.Ascendant.longitude : 0;

  // Polar angle helper: Maps ecliptic longitude to SVG coordinates with ASC at 180° (9 o'clock)
  function lonToAngle(lon) {
    let deg = (180 - (lon - ascLon)) % 360;
    if (deg < 0) deg += 360;
    return deg;
  }

  function polarToCartesian(r, angleDeg) {
    const rad = angleDeg * (Math.PI / 180);
    return {
      x: cx + r * Math.cos(rad),
      y: cy - r * Math.sin(rad)
    };
  }

  let html = `
    <defs>
      <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="3" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
    </defs>

    <!-- Outer Rings & Hub Backdrop -->
    <circle cx="${cx}" cy="${cy}" r="${outerR}" fill="none" stroke="rgba(245, 158, 11, 0.4)" stroke-width="2.5" />
    <circle cx="${cx}" cy="${cy}" r="${zodiacInnerR}" fill="none" stroke="rgba(16, 185, 129, 0.4)" stroke-width="2" />
    <circle cx="${cx}" cy="${cy}" r="${houseRingR}" fill="rgba(7, 10, 18, 0.85)" stroke="rgba(245, 158, 11, 0.35)" stroke-width="1.5" />
  `;

  // 1. RENDER ZODIAC SIGN SECTORS (12 Signs)
  for (let i = 0; i < 12; i++) {
    const signStartLon = i * 30;
    const signEndLon = (i + 1) * 30;

    const aStart = lonToAngle(signStartLon);
    const aEnd = lonToAngle(signEndLon);

    const pOuterStart = polarToCartesian(outerR, aStart);
    const pOuterEnd = polarToCartesian(outerR, aEnd);
    const pInnerStart = polarToCartesian(zodiacInnerR, aStart);
    const pInnerEnd = polarToCartesian(zodiacInnerR, aEnd);

    const signName = ZODIAC_SIGNS[i];
    const elemName = getSignElement(signName);
    const elemStyle = ELEMENT_COLORS[elemName] || ELEMENT_COLORS["Fire"];

    // Sector Arc Path
    const pathD = [
      `M ${pOuterStart.x} ${pOuterStart.y}`,
      `A ${outerR} ${outerR} 0 0 1 ${pOuterEnd.x} ${pOuterEnd.y}`,
      `L ${pInnerEnd.x} ${pInnerEnd.y}`,
      `A ${zodiacInnerR} ${zodiacInnerR} 0 0 0 ${pInnerStart.x} ${pInnerStart.y}`,
      `Z`
    ].join(' ');

    html += `<path d="${pathD}" fill="${elemStyle.bg}" stroke="rgba(255,255,255,0.08)" stroke-width="1" />`;

    // Sign Boundary Ray
    html += `<line x1="${pOuterStart.x}" y1="${pOuterStart.y}" x2="${pInnerStart.x}" y2="${pInnerStart.y}" stroke="rgba(245, 158, 11, 0.25)" stroke-width="1" />`;

    // Zodiac Glyph Text Position
    const midAngle = lonToAngle(signStartLon + 15);
    const symPos = polarToCartesian((outerR + zodiacInnerR) / 2, midAngle);
    const symbol = ZODIAC_SYMBOLS[signName];

    html += `<text x="${symPos.x}" y="${symPos.y + 6}" fill="${elemStyle.text}" font-size="18" font-weight="bold" text-anchor="middle">${symbol}</text>`;
  }

  // 2. RENDER ASPECT CHORDS INSIDE INNER HUB
  if (chartData.aspects && Array.isArray(chartData.aspects)) {
    chartData.aspects.forEach(asp => {
      const p1Obj = chartData.positions[asp.p1];
      const p2Obj = chartData.positions[asp.p2];

      if (p1Obj && p2Obj && p1Obj.longitude !== undefined && p2Obj.longitude !== undefined) {
        const a1 = lonToAngle(p1Obj.longitude);
        const a2 = lonToAngle(p2Obj.longitude);

        const pt1 = polarToCartesian(aspectR, a1);
        const pt2 = polarToCartesian(aspectR, a2);

        let strokeColor = "rgba(245, 158, 11, 0.4)"; // Conjunction default
        let strokeDash = "";

        if (asp.aspect === "Trine" || asp.aspect === "Sextile") {
          strokeColor = "rgba(6, 182, 212, 0.65)"; // Soft aspect Cyan/Teal
        } else if (asp.aspect === "Square" || asp.aspect === "Opposition") {
          strokeColor = "rgba(239, 68, 68, 0.65)"; // Hard aspect Crimson Red
          if (asp.aspect === "Opposition") strokeDash = "stroke-dasharray='4,4'";
        }

        html += `<line x1="${pt1.x}" y1="${pt1.y}" x2="${pt2.x}" y2="${pt2.y}" stroke="${strokeColor}" stroke-width="1.2" ${strokeDash} />`;
      }
    });
  }

  // 3. RENDER PLACIDUS HOUSE CUSPS & HOUSE NUMBERS
  chartData.houses.forEach((h, idx) => {
    const cuspAngle = lonToAngle(h.longitude);
    const pOuter = polarToCartesian(zodiacInnerR, cuspAngle);
    const pInner = polarToCartesian(houseRingR, cuspAngle);

    // Cusp Line Ray
    const isAngleCusp = h.house === 1 || h.house === 4 || h.house === 7 || h.house === 10;
    const strokeWidth = isAngleCusp ? 2.5 : 1;
    const strokeColor = isAngleCusp ? "var(--accent-gold)" : "rgba(16, 185, 129, 0.35)";

    html += `<line x1="${pOuter.x}" y1="${pOuter.y}" x2="${pInner.x}" y2="${pInner.y}" stroke="${strokeColor}" stroke-width="${strokeWidth}" />`;

    // House Sector Midpoint Number (1..12)
    const nextH = chartData.houses[(idx + 1) % 12];
    let midLon = (h.longitude + nextH.longitude) / 2;
    if (nextH.longitude < h.longitude) midLon += 180;
    const midAngle = lonToAngle(midLon % 360);

    const numPos = polarToCartesian(houseRingR - 18, midAngle);
    html += `<text x="${numPos.x}" y="${numPos.y + 4}" fill="rgba(245, 158, 11, 0.8)" font-size="11" font-weight="bold" text-anchor="middle">${h.house}</text>`;
  });

  // 4. RENDER PLANET GLYPHS WITH COLLISION PREVENTION
  const planetList = Object.values(chartData.positions).filter(p => p.longitude !== undefined && p.name !== "Ascendant" && p.name !== "Midheaven");
  
  // Sort planets by longitude
  planetList.sort((a, b) => a.longitude - b.longitude);

  // Group planets that are close (collision avoidance)
  const planetRBase = (zodiacInnerR + houseRingR) / 2;
  
  planetList.forEach((p, idx) => {
    const angle = lonToAngle(p.longitude);
    
    // Check if close to previous planet
    let rOffset = 0;
    if (idx > 0 && Math.abs(p.longitude - planetList[idx - 1].longitude) < 7) {
      rOffset = (idx % 2 === 0) ? 14 : -14;
    }

    const glyphPos = polarToCartesian(planetRBase + rOffset, angle);
    const symbol = PLANET_GLYPHS[p.name] || p.symbol || p.name[0];

    html += `
      <circle cx="${glyphPos.x}" cy="${glyphPos.y}" r="12" fill="#0b1021" stroke="var(--accent-gold)" stroke-width="1.8" filter="url(#glow)" />
      <text x="${glyphPos.x}" y="${glyphPos.y + 4}" fill="var(--accent-gold-bright)" font-size="12" font-weight="bold" text-anchor="middle">${symbol}</text>
    `;
  });

  // 5. ASC - DSC AXIS & MC - IC AXIS HIGHLIGHTS
  const ascPosLeft = polarToCartesian(outerR + 15, 180); // ASC at 9 o'clock
  const dscPosRight = polarToCartesian(outerR + 15, 0);   // DSC at 3 o'clock

  html += `
    <!-- ASC-DSC Horizontal Horizon Line -->
    <line x1="${cx - outerR}" y1="${cy}" x2="${cx + outerR}" y2="${cy}" stroke="var(--accent-gold)" stroke-width="3" />
    
    <!-- ASC Badge at 9 o'clock -->
    <circle cx="${cx - outerR}" cy="${cy}" r="14" fill="var(--accent-yellow)" stroke="#022c22" stroke-width="2" />
    <text x="${cx - outerR}" y="${cy + 4}" fill="#022c22" font-size="10" font-weight="800" text-anchor="middle">ASC</text>

    <!-- DSC Badge at 3 o'clock -->
    <circle cx="${cx + outerR}" cy="${cy}" r="14" fill="var(--accent-emerald)" stroke="#022c22" stroke-width="2" />
    <text x="${cx + outerR}" y="${cy + 4}" fill="#022c22" font-size="10" font-weight="800" text-anchor="middle">DSC</text>
  `;

  svg.innerHTML = html;
}

function getSignElement(sign) {
  const map = {
    "Aries": "Fire", "Leo": "Fire", "Sagittarius": "Fire",
    "Taurus": "Earth", "Virgo": "Earth", "Capricorn": "Earth",
    "Gemini": "Air", "Libra": "Air", "Aquarius": "Air",
    "Cancer": "Water", "Scorpio": "Water", "Pisces": "Water"
  };
  return map[sign] || "Fire";
}

function switchTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(ct => ct.style.display = 'none');

  event.target.classList.add('active');
  document.getElementById(`tab-${tabName}`).style.display = 'block';
}

function triggerPresetPrompt(promptText) {
  document.getElementById('user-prompt').value = promptText;
  sendChatPrompt();
}

async function sendChatPrompt() {
  const input = document.getElementById('user-prompt');
  const promptText = input.value.trim();
  if (!promptText) return;

  const chatContainer = document.getElementById('chat-messages');

  // User Message
  const userDiv = document.createElement('div');
  userDiv.className = 'message user';
  userDiv.textContent = promptText;
  chatContainer.appendChild(userDiv);

  input.value = '';
  chatContainer.scrollTop = chatContainer.scrollHeight;

  // Assistant Thinking Message
  const assistDiv = document.createElement('div');
  assistDiv.className = 'message assistant';
  assistDiv.innerHTML = `<em>Searching Demetra George PDF book text & generating structured 100-word analysis...</em>`;
  chatContainer.appendChild(assistDiv);

  try {
    const response = await fetch('/api/ai-astrologer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: promptText,
        chartData: currentChartData
      })
    });

    const data = await response.json();
    if (data.success) {
      assistDiv.innerHTML = formatMarkdown(data.response);
    } else {
      assistDiv.textContent = "Error receiving response from AI Astrologer.";
    }
  } catch (err) {
    assistDiv.textContent = "Failed to connect to backend AI agent.";
  }

  chatContainer.scrollTop = chatContainer.scrollHeight;
}

function formatMarkdown(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/### (.*?)\n/g, '<h4 style="color:var(--accent-gold); margin: 0.5rem 0;">$1</h4>')
    .replace(/\n/g, '<br>');
}
