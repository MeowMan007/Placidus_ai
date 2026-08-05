/**
 * Placidus AI — PDF Knowledge Base Ingestor
 * Parses PDF documents (e.g. Demetra George's "Astrology and the Authentic Self")
 * and extracts semantic chunks with metadata (chapter, topic, page number).
 * Saves indexed output to server/knowledge_index.json for high-precision RAG retrieval.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');

const TOPIC_PATTERNS = [
  { topic: 'Grammar of Astrology', keywords: ['grammar of astrology', 'planets as who', 'signs as how', 'houses as where', 'aspects as dynamics'] },
  { topic: 'Planetary Dignities & Condition', keywords: ['essential dignity', 'domicile', 'exaltation', 'detriment', 'fall', 'accidental dignity', 'combust', 'under sunbeams', 'retrograde', 'hayz', 'bonification', 'maltreatment'] },
  { topic: 'Sect Analysis', keywords: ['sect', 'diurnal', 'nocturnal', 'day chart', 'night chart', 'team spirit', 'benefic of sect', 'malefic of sect', 'luminary leader', 'jupiter', 'saturn', 'venus', 'mars'] },
  { topic: 'Ascendant & Life Direction', keywords: ['ascendant', 'rising sign', 'lord of chart', 'ascendant ruler', 'life direction', 'first house', 'helm', 'steering wheel'] },
  { topic: 'Sun & Moon Purpose', keywords: ['sun', 'moon', 'life purpose', 'luminary', 'solar purpose', 'lunar needs', 'authentic self', 'hero journey'] },
  { topic: 'Lunar Nodes & Destiny', keywords: ['north node', 'south node', 'rahu', 'ketu', 'nodal axis', 'soul destiny', 'nodal return', 'eclipses'] },
  { topic: 'Part of Fortune & Lots', keywords: ['part of fortune', 'lot of fortune', 'arabic part', 'spirit', 'worldly fortune'] },
  { topic: 'Aspect Geometry & Dynamics', keywords: ['aspect', 'conjunction', 'sextile', 'square', 'trine', 'opposition', 'orb', 'applying', 'separating', 't-square', 'grand trine'] },
  { topic: 'Vocation & Career', keywords: ['vocation', 'career', 'profession', 'calling', '10th house', 'midheaven', 'mc', 'work'] },
  { topic: 'Timing & Profections', keywords: ['timing', 'profection', 'annual profection', 'time lord', 'solar return', 'transits', 'progressions'] },
  { topic: 'Mythic Asteroids', keywords: ['ceres', 'pallas', 'juno', 'vesta', 'asteroid', 'chiron', 'mythic archetype'] }
];

function detectTopic(text) {
  const lower = text.toLowerCase();
  let bestTopic = 'General Hellenistic Astrology';
  let maxScore = 0;

  for (const item of TOPIC_PATTERNS) {
    let score = 0;
    for (const kw of item.keywords) {
      let pos = 0;
      while ((pos = lower.indexOf(kw, pos)) !== -1) {
        score++;
        pos += kw.length;
      }
    }
    if (score > maxScore) {
      maxScore = score;
      bestTopic = item.topic;
    }
  }
  return bestTopic;
}

function detectChapter(text) {
  const match = text.match(/(Chapter\s+\d+[:\s\w]+|Part\s+[I|V|X]+[:\s\w]+|Prologue|Introduction)/i);
  return match ? match[0].trim() : null;
}

async function ingestPdf(pdfPath) {
  if (!fs.existsSync(pdfPath)) {
    throw new Error(`PDF file not found at path: ${pdfPath}`);
  }

  console.log(`[Ingestor] Processing PDF: ${pdfPath}`);
  const dataBuffer = fs.readFileSync(pdfPath);
  const pdfData = await pdfParse(dataBuffer);

  console.log(`[Ingestor] Extracted ${pdfData.numpages} pages.`);

  const textPages = pdfData.text.split(/\n(?==== PAGE \d+ ===)/);

  const chunks = [];
  let currentChapter = 'Overview';
  let chunkId = 0;

  for (let i = 0; i < textPages.length; i++) {
    const pageText = textPages[i].replace(/\r?\n/g, ' ').replace(/\s{2,}/g, ' ').trim();
    if (pageText.length < 50) continue;

    const chapterMatch = detectChapter(pageText);
    if (chapterMatch) {
      currentChapter = chapterMatch;
    }

    // Sliding window chunking: 850 chars with 200 char overlap
    const windowSize = 850;
    const stepSize = 650;

    for (let start = 0; start < pageText.length; start += stepSize) {
      const textChunk = pageText.slice(start, start + windowSize).trim();
      if (textChunk.length < 80) continue;

      const topic = detectTopic(textChunk);

      chunks.push({
        id: ++chunkId,
        page: i + 1,
        chapter: currentChapter,
        topic: topic,
        text: textChunk,
        lower: textChunk.toLowerCase(),
        source: path.basename(pdfPath)
      });
    }
  }

  // Save knowledge_index.json
  const indexPath = path.join(__dirname, 'knowledge_index.json');
  fs.writeFileSync(indexPath, JSON.stringify(chunks, null, 2), 'utf-8');
  console.log(`[Ingestor] Created ${chunks.length} structured semantic chunks in ${indexPath}`);

  // Also update pdf_text.txt
  const txtPath = path.join(__dirname, '../pdf_text.txt');
  fs.writeFileSync(txtPath, pdfData.text, 'utf-8');
  console.log(`[Ingestor] Updated ${txtPath}`);

  return chunks.length;
}

if (require.main === module) {
  const targetPdf = process.argv[2] || "C:\\Users\\HP\\Downloads\\chart\\_OceanofPDF.com_Astrology_and_the_Authentic_Self_-_Demetra_George.pdf";
  ingestPdf(targetPdf)
    .then(count => console.log(`[Ingestor] Successfully ingested ${count} chunks!`))
    .catch(err => console.error('[Ingestor] Error during ingestion:', err));
}

module.exports = { ingestPdf };
