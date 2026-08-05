/**
 * Placidus AI — High-Precision Hellenistic Ephemeris Engine
 * Uses astronomy-engine (Don Cross) for sub-arcsecond planetary positions.
 * Extended with Traditional Hellenistic Essential Dignities, Lots, and Retrograde detection.
 */

'use strict';

const Astronomy = require('astronomy-engine');

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

const ZODIAC_SIGNS = [
  'Aries','Taurus','Gemini','Cancer','Leo','Virgo',
  'Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'
];

const SIGN_SYMBOLS = {
  Aries:'♈', Taurus:'♉', Gemini:'♊', Cancer:'♋',
  Leo:'♌', Virgo:'♍', Libra:'♎', Scorpio:'♏',
  Sagittarius:'♐', Capricorn:'♑', Aquarius:'♒', Pisces:'♓'
};

const PLANET_SYMBOLS = {
  Sun:'☉', Moon:'☽', Mercury:'☿', Venus:'♀', Mars:'♂',
  Jupiter:'♃', Saturn:'♄', Uranus:'♅', Neptune:'♆', Pluto:'♇',
  'North Node':'☊', 'South Node':'☋',
  'Part of Fortune':'⊗', 'Part of Spirit':'⊕',
  Ascendant:'AC', Midheaven:'MC'
};

const PLANET_ELEMENTS = {
  Aries:'Fire', Leo:'Fire', Sagittarius:'Fire',
  Taurus:'Earth', Virgo:'Earth', Capricorn:'Earth',
  Gemini:'Air', Libra:'Air', Aquarius:'Air',
  Cancer:'Water', Scorpio:'Water', Pisces:'Water'
};

// ─── Traditional Dignity Tables ──────────────────────────────────────────────
const DOMICILES = {
  Aries:'Mars', Taurus:'Venus', Gemini:'Mercury', Cancer:'Moon',
  Leo:'Sun', Virgo:'Mercury', Libra:'Venus', Scorpio:'Mars',
  Sagittarius:'Jupiter', Capricorn:'Saturn', Aquarius:'Saturn', Pisces:'Jupiter'
};

const EXALTATIONS = {
  Aries:'Sun', Taurus:'Moon', Cancer:'Jupiter', Virgo:'Mercury',
  Libra:'Saturn', Capricorn:'Mars', Pisces:'Venus'
};

const DETRIMENTS = {
  Aries:'Venus', Taurus:'Mars', Gemini:'Jupiter', Cancer:'Saturn',
  Leo:'Saturn', Virgo:'Jupiter', Libra:'Mars', Scorpio:'Venus',
  Sagittarius:'Mercury', Capricorn:'Moon', Aquarius:'Sun', Pisces:'Mercury'
};

const FALLS = {
  Aries:'Saturn', Taurus:'None', Cancer:'Mars', Virgo:'Venus',
  Libra:'Sun', Capricorn:'Jupiter', Pisces:'Mercury'
};

// ─── Utilities ───────────────────────────────────────────────────────────────

function norm360(v) { return ((v % 360) + 360) % 360; }

function estimateTimezoneOffset(lon) {
  return Math.round(lon / 15 * 2) / 2;
}

function formatPos(lon) {
  lon = norm360(lon);
  const signIdx = Math.floor(lon / 30);
  const signName = ZODIAC_SIGNS[signIdx] || 'Aries';
  const posInSign = lon - signIdx * 30;
  const deg = Math.floor(posInSign);
  const min = Math.floor((posInSign - deg) * 60);
  return {
    sign: signName,
    signSymbol: SIGN_SYMBOLS[signName] || '',
    degree: deg,
    minute: min,
    longitude: parseFloat(lon.toFixed(4)),
    formatted: `${deg}° ${signName} ${String(min).padStart(2, '0')}'`,
    element: PLANET_ELEMENTS[signName] || ''
  };
}

function calcEssentialDignity(planetName, signName) {
  if (DOMICILES[signName] === planetName) return { status: 'Domicile', score: 5, label: 'Ruler (+5)' };
  if (EXALTATIONS[signName] === planetName) return { status: 'Exaltation', score: 4, label: 'Exalted (+4)' };
  if (DETRIMENTS[signName] === planetName) return { status: 'Detriment', score: -5, label: 'Detriment (-5)' };
  if (FALLS[signName] === planetName) return { status: 'Fall', score: -4, label: 'Fall (-4)' };
  return { status: 'Peregrine', score: 0, label: 'Peregrine (0)' };
}

// ─── Ascendant & MC ─────────────────────────────────────────────────────────

function calcAscendant(RAMC, eps, lat) {
  const y = -Math.cos(RAMC * RAD);
  const x = Math.sin(eps * RAD) * Math.tan(lat * RAD) + Math.cos(eps * RAD) * Math.sin(RAMC * RAD);
  let asc = Math.atan2(y, x) * DEG;
  if (asc < 0) asc += 360;
  return norm360(asc);
}

function calcMC(RAMC, eps) {
  let mc = Math.atan(Math.tan(RAMC * RAD) / Math.cos(eps * RAD)) * DEG;
  while (mc < RAMC - 90) mc += 180;
  while (mc > RAMC + 90) mc -= 180;
  return norm360(mc);
}

// ─── Placidus & Whole Sign House Cusps ───────────────────────────────────────

function calcPlacidusHouses(RAMC, eps, lat, ascLon, mcLon) {
  const cusps = new Array(12);
  cusps[0]  = ascLon;                     // H1 = ASC
  cusps[9]  = mcLon;                      // H10 = MC
  cusps[6]  = norm360(ascLon + 180);      // H7 = DSC
  cusps[3]  = norm360(mcLon + 180);       // H4 = IC

  cusps[10] = placidusIntermediateCusp(RAMC, eps, lat, 1/3, true);   // H11
  cusps[11] = placidusIntermediateCusp(RAMC, eps, lat, 2/3, true);   // H12
  cusps[1]  = placidusIntermediateCusp(RAMC, eps, lat, 1/3, false);  // H2
  cusps[2]  = placidusIntermediateCusp(RAMC, eps, lat, 2/3, false);  // H3
  cusps[4]  = norm360(cusps[10] + 180);  // H5
  cusps[5]  = norm360(cusps[11] + 180);  // H6
  cusps[7]  = norm360(cusps[1] + 180);   // H8
  cusps[8]  = norm360(cusps[2] + 180);   // H9

  return cusps;
}

function calcWholeSignHouses(ascLon) {
  const ascSignIdx = Math.floor(ascLon / 30);
  const cusps = new Array(12);
  for (let i = 0; i < 12; i++) {
    cusps[i] = norm360((ascSignIdx + i) * 30);
  }
  return cusps;
}

function placidusIntermediateCusp(RAMC, eps, lat, fraction, aboveHorizon) {
  const ascLon = calcAscendant(RAMC, eps, lat);
  const mcLon  = calcMC(RAMC, eps);
  const icLon  = norm360(mcLon + 180);

  let lambda;
  if (aboveHorizon) {
    let arc = mcLon - ascLon;
    if (arc < 0) arc += 360;
    lambda = norm360(mcLon - arc * fraction);
  } else {
    let arc = ascLon - icLon;
    if (arc < 0) arc += 360;
    lambda = norm360(ascLon - arc * fraction);
  }

  for (let iter = 0; iter < 100; iter++) {
    const decl = Math.asin(Math.sin(eps * RAD) * Math.sin(lambda * RAD)) * DEG;
    const cosH0 = -Math.tan(lat * RAD) * Math.tan(decl * RAD);
    let DSA;
    if (cosH0 < -1) DSA = 180;
    else if (cosH0 > 1) DSA = 0;
    else DSA = Math.acos(cosH0) * DEG;

    let targetRA;
    if (aboveHorizon) {
      targetRA = RAMC - fraction * DSA;
    } else {
      const NSA = 180 - DSA;
      targetRA = RAMC - DSA - fraction * NSA;
    }

    targetRA = norm360(targetRA);
    let newLambda = Math.atan(Math.tan(targetRA * RAD) / Math.cos(eps * RAD)) * DEG;
    while (newLambda < targetRA - 90) newLambda += 180;
    while (newLambda > targetRA + 90) newLambda -= 180;
    newLambda = norm360(newLambda);

    let diff = Math.abs(newLambda - lambda);
    if (diff > 180) diff = 360 - diff;
    if (diff < 0.0005) break;
    lambda = newLambda;
  }

  return norm360(lambda);
}

// ─── Aspects ────────────────────────────────────────────────────────────────

function calcAspects(positions) {
  const planetList = ['Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn','Uranus','Neptune','Pluto'];
  const aspectDefs = [
    { name:'Conjunction',  angle:  0, orb:8, symbol:'☌', type:'major', color:'#C9A84C' },
    { name:'Semi-Sextile', angle: 30, orb:2, symbol:'∠', type:'minor', color:'#94a3b8' },
    { name:'Sextile',      angle: 60, orb:6, symbol:'⚹', type:'soft',  color:'#3DB8A0' },
    { name:'Square',       angle: 90, orb:7, symbol:'□', type:'hard',  color:'#D45B5B' },
    { name:'Trine',        angle:120, orb:8, symbol:'△', type:'soft',  color:'#3DB8A0' },
    { name:'Quincunx',     angle:150, orb:2, symbol:'⚻', type:'minor', color:'#a855f7' },
    { name:'Opposition',   angle:180, orb:8, symbol:'☍', type:'hard',  color:'#D45B5B' }
  ];

  const aspects = [];
  for (let i = 0; i < planetList.length; i++) {
    for (let j = i + 1; j < planetList.length; j++) {
      const p1 = positions[planetList[i]];
      const p2 = positions[planetList[j]];
      if (!p1 || !p2) continue;

      let diff = Math.abs(p1.longitude - p2.longitude);
      if (diff > 180) diff = 360 - diff;

      for (const def of aspectDefs) {
        const orb = Math.abs(diff - def.angle);
        if (orb <= def.orb) {
          aspects.push({
            p1: planetList[i],
            p2: planetList[j],
            aspect: def.name,
            symbol: def.symbol,
            orb: parseFloat(orb.toFixed(2)),
            color: def.color,
            type: def.type
          });
        }
      }
    }
  }
  return aspects;
}

// ─── Main Chart Calculation Engine ──────────────────────────────────────────

function calculateChartData(birthDateStr, birthTimeStr, lat, lon, timezoneOffset) {
  const [yr, mo, da] = birthDateStr.split('-').map(Number);
  const [hr, mn] = (birthTimeStr || '12:00').split(':').map(Number);

  const tzOffset = (timezoneOffset !== undefined && timezoneOffset !== null)
    ? parseFloat(timezoneOffset)
    : estimateTimezoneOffset(lon);

  const localMinutes = hr * 60 + mn;
  let utcMinutes = localMinutes - tzOffset * 60;

  let utcDay = da;
  if (utcMinutes < 0)    { utcMinutes += 1440; utcDay--; }
  if (utcMinutes >= 1440) { utcMinutes -= 1440; utcDay++; }

  const utcHr = Math.floor(utcMinutes / 60);
  const utcMn = Math.round(utcMinutes % 60);

  const utcDate = new Date(Date.UTC(yr, mo - 1, utcDay, utcHr, utcMn, 0));
  const T = ((utcDate - new Date(Date.UTC(2000, 0, 1, 12, 0, 0))) / 86400000) / 36525;
  const eps = 23.4392911 - 0.0130042 * T;

  const rot = Astronomy.Rotation_EQJ_ECT(utcDate);

  // ── Sun & Moon ──
  const sunPos = Astronomy.SunPosition(utcDate);
  const sunLon = sunPos.elon;

  const moonVec = Astronomy.GeoMoon(utcDate);
  const moonEcl = Astronomy.RotateVector(rot, moonVec);
  const moonLon = norm360(Math.atan2(moonEcl.y, moonEcl.x) * DEG);

  // ── Planets & Retrograde Check ──
  const planetNames = ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'];
  const rawPositions = { Sun: sunLon, Moon: moonLon };
  const isRetrograde = {};

  // Check 1-hour motion for retrograde status
  const utcDateLater = new Date(utcDate.getTime() + 3600000);
  const rotLater = Astronomy.Rotation_EQJ_ECT(utcDateLater);

  for (const body of planetNames) {
    const gv = Astronomy.GeoVector(body, utcDate, true);
    const ecl = Astronomy.RotateVector(rot, gv);
    const lon1 = norm360(Math.atan2(ecl.y, ecl.x) * DEG);
    rawPositions[body] = lon1;

    const gv2 = Astronomy.GeoVector(body, utcDateLater, true);
    const ecl2 = Astronomy.RotateVector(rotLater, gv2);
    const lon2 = norm360(Math.atan2(ecl2.y, ecl2.x) * DEG);

    let diff = lon2 - lon1;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    isRetrograde[body] = diff < 0;
  }

  // ── Lunar Nodes ──
  const nnLon = norm360(125.04452 - 1934.136261 * T + 0.0020708 * T * T);
  rawPositions['North Node'] = nnLon;
  rawPositions['South Node'] = norm360(nnLon + 180);

  // ── RAMC, ASC, MC ──
  const gast = Astronomy.SiderealTime(utcDate);
  const lst = ((gast + lon / 15) % 24 + 24) % 24;
  const RAMC = lst * 15;

  const ascLon = calcAscendant(RAMC, eps, lat);
  const mcLon  = calcMC(RAMC, eps);

  rawPositions['Ascendant'] = ascLon;
  rawPositions['Midheaven'] = mcLon;

  // ── Sect Determination ──
  // Placidus House 1 = ASC, House 7 = DSC. Sun in Houses 7..12 = Above horizon (Day Chart)
  const tempPlacidusCusps = calcPlacidusHouses(RAMC, eps, lat, ascLon, mcLon);
  let sunPlacidusHouse = 1;
  for (let h = 0; h < 12; h++) {
    const c1 = tempPlacidusCusps[h];
    const c2 = tempPlacidusCusps[(h + 1) % 12];
    let inHouse = c1 <= c2 ? (sunLon >= c1 && sunLon < c2) : (sunLon >= c1 || sunLon < c2);
    if (inHouse) { sunPlacidusHouse = h + 1; break; }
  }
  const isDayChart = sunPlacidusHouse >= 7 && sunPlacidusHouse <= 12;

  // ── Lots (Parts) Calculation ──
  // Day: Fortune = ASC + Moon - Sun | Night: Fortune = ASC + Sun - Moon
  const fortuneLon = isDayChart
    ? norm360(ascLon + moonLon - sunLon)
    : norm360(ascLon + sunLon - moonLon);

  // Day: Spirit = ASC + Sun - Moon | Night: Spirit = ASC + Moon - Sun
  const spiritLon = isDayChart
    ? norm360(ascLon + sunLon - moonLon)
    : norm360(ascLon + moonLon - sunLon);

  rawPositions['Part of Fortune'] = fortuneLon;
  rawPositions['Part of Spirit']  = spiritLon;

  // ── Format All Positions + Essential Dignities ──
  const positions = {};
  for (const [name, lonVal] of Object.entries(rawPositions)) {
    const formatted = formatPos(lonVal);
    const dignity   = calcEssentialDignity(name, formatted.sign);
    positions[name] = {
      name,
      symbol: PLANET_SYMBOLS[name] || name,
      ...formatted,
      isRetrograde: !!isRetrograde[name],
      dignity: dignity
    };
  }

  // ── House Cusps ──
  const cuspLons = tempPlacidusCusps;
  const houses = cuspLons.map((cLon, i) => ({
    house: i + 1,
    ...formatPos(cLon),
    longitude: parseFloat(cLon.toFixed(4))
  }));

  // Assign Placidus house to each planet
  for (const planet of Object.values(positions)) {
    let houseNum = 1;
    for (let h = 0; h < 12; h++) {
      const c1 = cuspLons[h];
      const c2 = cuspLons[(h + 1) % 12];
      const pLon = planet.longitude;
      let inHouse = c1 <= c2 ? (pLon >= c1 && pLon < c2) : (pLon >= c1 || pLon < c2);
      if (inHouse) { houseNum = h + 1; break; }
    }
    planet.house = houseNum;
  }

  const ascSignName = positions['Ascendant'] ? positions['Ascendant'].sign : 'Aries';
  const ascRuler    = getSignRuler(ascSignName);

  // ── Aspects ──
  const aspects = calcAspects(positions);

  return {
    birthInfo: {
      date: birthDateStr,
      time: birthTimeStr,
      latitude: lat,
      longitude: lon,
      timezoneOffset: tzOffset,
      utcTime: `${String(utcHr).padStart(2,'0')}:${String(utcMn).padStart(2,'0')} UTC`
    },
    RAMC: parseFloat(RAMC.toFixed(4)),
    obliquity: parseFloat(eps.toFixed(4)),
    sect: isDayChart ? 'Day Chart (Diurnal)' : 'Night Chart (Nocturnal)',
    beneficOfSect: isDayChart ? 'Jupiter' : 'Venus',
    maleficOfSect: isDayChart ? 'Saturn' : 'Mars',
    ascendantRuler: ascRuler,
    positions,
    houses,
    aspects
  };
}

function getSignRuler(sign) {
  return DOMICILES[sign] || 'Sun';
}

module.exports = {
  calculateChartData,
  calcEssentialDignity,
  calcWholeSignHouses,
  ZODIAC_SIGNS,
  SIGN_SYMBOLS,
  PLANET_SYMBOLS,
  PLANET_ELEMENTS,
  estimateTimezoneOffset
};
