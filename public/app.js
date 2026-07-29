let currentChartData = null;
let geocodeTimeout = null;

const ZODIAC_SYMBOLS = {
  "Aries": "♈", "Taurus": "♉", "Gemini": "♊", "Cancer": "♋",
  "Leo": "♌", "Virgo": "♍", "Libra": "♎", "Scorpio": "♏",
  "Sagittarius": "♐", "Capricorn": "♑", "Aquarius": "♒", "Pisces": "♓"
};

// Emerald & Gold Theme Palette
const ZODIAC_COLORS = [
  "#ef4444", "#34d399", "#fbbf24", "#38bdf8",
  "#ef4444", "#34d399", "#fbbf24", "#38bdf8",
  "#ef4444", "#34d399", "#fbbf24", "#38bdf8"
];

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('chart-form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    calculateAndRenderChart();
  });

  // City Search Autocomplete Setup
  const cityInput = document.getElementById('citySearch');
  cityInput.addEventListener('input', handleCityInput);
  cityInput.addEventListener('focus', () => handleCityInput({ target: cityInput }));

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#citySearch') && !e.target.closest('#citySuggestions')) {
      document.getElementById('citySuggestions').style.display = 'none';
    }
  });

  // Initial Chart Calculation
  calculateAndRenderChart();
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
      renderWheelSVG(currentChartData);
    }
  } catch (err) {
    console.error("Failed to calculate chart:", err);
  }
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
      <td>${p.house || '-'}</td>
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

function renderWheelSVG(chartData) {
  const svg = document.getElementById('chart-wheel-svg');
  const cx = 300;
  const cy = 300;
  const outerR = 270;
  const innerR = 210;
  const houseR = 110;

  let html = `
    <!-- Emerald & Gold Outer Rings -->
    <circle cx="${cx}" cy="${cy}" r="${outerR}" fill="none" stroke="rgba(251, 191, 36, 0.4)" stroke-width="2.5" />
    <circle cx="${cx}" cy="${cy}" r="${innerR}" fill="none" stroke="rgba(16, 185, 129, 0.4)" stroke-width="2" />
    <circle cx="${cx}" cy="${cy}" r="${houseR}" fill="rgba(2, 44, 34, 0.75)" stroke="rgba(251, 191, 36, 0.3)" stroke-width="1.5" />
  `;

  const ascLon = chartData.positions.Ascendant ? chartData.positions.Ascendant.longitude : 0;

  // Render 12 Zodiac Segments
  for (let i = 0; i < 12; i++) {
    const startAngle = (i * 30 - ascLon) * (Math.PI / 180);
    const endAngle = ((i + 1) * 30 - ascLon) * (Math.PI / 180);

    const x1 = cx + outerR * Math.cos(startAngle);
    const y1 = cy + outerR * Math.sin(startAngle);

    const xi1 = cx + innerR * Math.cos(startAngle);
    const yi1 = cy + innerR * Math.sin(startAngle);

    html += `<line x1="${x1}" y1="${y1}" x2="${xi1}" y2="${yi1}" stroke="rgba(251, 191, 36, 0.3)" stroke-width="1" />`;

    // Zodiac Symbol Position
    const midAngle = (startAngle + endAngle) / 2;
    const symR = (outerR + innerR) / 2;
    const symX = cx + symR * Math.cos(midAngle);
    const symY = cy + symR * Math.sin(midAngle);

    const signName = Object.keys(ZODIAC_SYMBOLS)[i];
    const symbol = ZODIAC_SYMBOLS[signName];
    const color = ZODIAC_COLORS[i];

    html += `<text x="${symX}" y="${symY + 6}" fill="${color}" font-size="17" text-anchor="middle" font-weight="bold">${symbol}</text>`;
  }

  // Render House Lines
  chartData.houses.forEach(h => {
    const angle = (h.longitude - ascLon) * (Math.PI / 180);
    const hx = cx + innerR * Math.cos(angle);
    const hy = cy + innerR * Math.sin(angle);
    const hx2 = cx + houseR * Math.cos(angle);
    const hy2 = cy + houseR * Math.sin(angle);

    html += `<line x1="${hx}" y1="${hy}" x2="${hx2}" y2="${hy2}" stroke="rgba(16, 185, 129, 0.35)" stroke-dasharray="4,4" />`;
  });

  // Render Planets
  const planetR = (innerR + houseR) / 2;
  Object.values(chartData.positions).forEach(p => {
    if (!p.longitude) return;
    const pAngle = (p.longitude - ascLon) * (Math.PI / 180);
    const px = cx + planetR * Math.cos(pAngle);
    const py = cy + planetR * Math.sin(pAngle);

    html += `
      <circle cx="${px}" cy="${py}" r="13" fill="#064e3b" stroke="var(--accent-gold)" stroke-width="2" />
      <text x="${px}" y="${py + 5}" fill="var(--accent-gold-bright)" font-size="12" text-anchor="middle" font-weight="bold">${p.symbol || p.name[0]}</text>
    `;
  });

  // ASC / MC Axis Highlights
  html += `
    <line x1="${cx - innerR}" y1="${cy}" x2="${cx + innerR}" y2="${cy}" stroke="var(--accent-gold)" stroke-width="3" />
    <text x="${cx - innerR + 25}" y="${cy - 8}" fill="var(--accent-gold-bright)" font-size="13" font-weight="bold">ASC</text>
    <text x="${cx + innerR - 25}" y="${cy - 8}" fill="var(--accent-gold-bright)" font-size="13" font-weight="bold">DSC</text>
  `;

  svg.innerHTML = html;
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
  assistDiv.innerHTML = `<em>Retrieving Demetra George PDF book excerpts & consulting AI Astrologer...</em>`;
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
    .replace(/### (.*?)\n/g, '<h4 style="color:var(--accent-gold); margin: 0.6rem 0;">$1</h4>')
    .replace(/ blockquote /g, '')
    .replace(/\n/g, '<br>');
}
