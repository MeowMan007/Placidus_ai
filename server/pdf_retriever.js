/**
 * Placidus AI — High-Precision Hybrid RAG Retriever
 *
 * Implements a 3-tier hybrid search & reranking engine:
 *  1. TF-IDF + Keyword matching over structured knowledge index
 *  2. Entity-boosting based on natal chart positions (planets, signs, houses, sect)
 *  3. Near-duplicate removal & context compression
 *  4. Citation metadata extraction ({ chapter, topic, page })
 */

'use strict';

const fs = require('fs');
const path = require('path');

let bookChunks = [];
let initialized = false;
const queryCache = new Map();
const MAX_CACHE_SIZE = 100;

// ─── TF-IDF Vocabulary Index ──────────────────────────────────────────────────
const docFreqs = {};  // term -> number of docs containing term
let totalDocs = 0;

function tokenize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2);
}

function initRetriever() {
  if (initialized) return;
  initialized = true;

  const indexPath = path.join(__dirname, 'knowledge_index.json');
  const txtPath = path.join(__dirname, '../pdf_text.txt');

  if (fs.existsSync(indexPath)) {
    try {
      bookChunks = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
      console.log(`[RAG] Loaded ${bookChunks.length} pre-indexed semantic chunks from knowledge_index.json.`);
    } catch (e) {
      console.warn('[RAG] Failed to parse knowledge_index.json, building fallback...', e.message);
    }
  }

  // Fallback: chunk from pdf_text.txt if knowledge_index.json was missing or empty
  if (bookChunks.length === 0 && fs.existsSync(txtPath)) {
    const raw = fs.readFileSync(txtPath, 'utf-8');
    const pages = raw.split(/={3}\s*PAGE\s+\d+\s*={3}/);
    let id = 0;
    for (let pIdx = 0; pIdx < pages.length; pIdx++) {
      const pageText = pages[pIdx].replace(/\r?\n/g, ' ').replace(/\s{2,}/g, ' ').trim();
      if (pageText.length < 80) continue;
      for (let start = 0; start < pageText.length; start += 650) {
        const chunk = pageText.slice(start, start + 850).trim();
        if (chunk.length < 100) continue;
        bookChunks.push({
          id: ++id,
          page: pIdx + 1,
          chapter: 'General',
          topic: 'Astrological Wisdom',
          text: chunk,
          lower: chunk.toLowerCase()
        });
      }
    }
    console.log(`[RAG] Built ${bookChunks.length} fallback chunks from pdf_text.txt.`);
  }

  // Build TF-IDF vocabulary index
  totalDocs = bookChunks.length;
  for (const chunk of bookChunks) {
    const tokens = new Set(tokenize(chunk.text));
    chunk.tokens = tokens;
    for (const term of tokens) {
      docFreqs[term] = (docFreqs[term] || 0) + 1;
    }
  }

  console.log(`[RAG] Built TF-IDF vocabulary over ${Object.keys(docFreqs).length} unique terms.`);
}

/**
 * Calculates TF-IDF score for a query against a chunk.
 */
function calculateTfIdfScore(queryTokens, chunk) {
  let score = 0;
  const chunkTokenList = tokenize(chunk.text);
  const termCounts = {};
  for (const t of chunkTokenList) {
    termCounts[t] = (termCounts[t] || 0) + 1;
  }

  for (const qTerm of queryTokens) {
    const tf = termCounts[qTerm] || 0;
    if (tf > 0) {
      const df = docFreqs[qTerm] || 1;
      const idf = Math.log(totalDocs / df);
      score += tf * idf;
    }
  }
  return score;
}

/**
 * Calculates Natal Chart entity matching boost.
 */
function calculateChartEntityBoost(chunk, chartData) {
  if (!chartData || !chartData.positions) return 0;
  let boost = 0;
  const lower = chunk.lower || chunk.text.toLowerCase();

  // Boost if Ascendant Ruler mentioned
  if (chartData.ascendantRuler && lower.includes(chartData.ascendantRuler.toLowerCase())) {
    boost += 2.5;
  }

  // Boost if client's Sect mentioned
  if (chartData.sect) {
    if (chartData.sect.includes('Day') && (lower.includes('diurnal') || lower.includes('day chart'))) {
      boost += 2.0;
    } else if (chartData.sect.includes('Night') && (lower.includes('nocturnal') || lower.includes('night chart'))) {
      boost += 2.0;
    }
  }

  // Boost for planet sign/house matches
  for (const p of Object.values(chartData.positions)) {
    if (p.name && lower.includes(p.name.toLowerCase())) {
      boost += 1.0;
      if (p.sign && lower.includes(p.sign.toLowerCase())) boost += 1.5;
      if (p.house && lower.includes(`house ${p.house}`) || lower.includes(`${p.house}th house`)) boost += 1.5;
    }
  }

  return boost;
}

/**
 * Retrieves top relevant excerpts for a query and chart context.
 *
 * @param {string} userQuery - The question or prompt
 * @param {object} chartData - Client's chart data
 * @param {number} topN - Number of chunks to retrieve (default: 4)
 * @returns {object} { chunks, formatted, citations }
 */
function retrieveContext(userQuery, chartData, topN = 4) {
  if (!initialized) initRetriever();

  const cacheKey = `${(userQuery||'').trim().toLowerCase()}_${chartData ? chartData.ascendantRuler : ''}_${topN}`;
  if (queryCache.has(cacheKey)) {
    return queryCache.get(cacheKey);
  }

  const queryLower = (userQuery || '').toLowerCase();
  const queryTokens = tokenize(queryLower);

  if (queryTokens.length === 0 && bookChunks.length > 0) {
    const sample = bookChunks.slice(0, topN);
    return {
      chunks: sample,
      formatted: sample.map(c => `[${c.topic} · Page ${c.page}]\n${c.text}`).join('\n\n---\n\n'),
      citations: sample.map(c => ({ chapter: c.chapter, topic: c.topic, page: c.page }))
    };
  }

  // Score all chunks
  const scored = bookChunks.map(chunk => {
    const tfidf = calculateTfIdfScore(queryTokens, chunk);
    const chartBoost = calculateChartEntityBoost(chunk, chartData);

    // Exact phrase match bonus
    let phraseBonus = 0;
    if (queryLower.length > 8 && chunk.lower.includes(queryLower)) {
      phraseBonus = 5.0;
    }

    const totalScore = tfidf + chartBoost + phraseBonus;
    return { chunk, score: totalScore };
  });

  // Sort descending by score
  scored.sort((a, b) => b.score - a.score);

  // De-duplicate near-identical chunks (Jaccard similarity > 0.65)
  const selected = [];
  for (const item of scored) {
    if (selected.length >= topN) break;
    if (item.score <= 0 && selected.length >= 2) break; // Don't include zero-score chunks if we have results

    let isDuplicate = false;
    for (const existing of selected) {
      const sim = jaccardSimilarity(item.chunk.tokens, existing.chunk.tokens);
      if (sim > 0.65) {
        isDuplicate = true;
        break;
      }
    }
    if (!isDuplicate) {
      selected.push(item);
    }
  }

  const chunks = selected.map(s => s.chunk);

  const formatted = chunks.map(c => {
    const chapterStr = c.chapter ? ` (Chapter: ${c.chapter})` : '';
    return `[Excerpt: ${c.topic}${chapterStr} · Page ${c.page}]\n${c.text}`;
  }).join('\n\n---\n\n');

  const citations = chunks.map(c => ({
    topic: c.topic,
    chapter: c.chapter || 'Astrology & Authentic Self',
    page: c.page
  }));

  const result = { chunks, formatted, citations };
  if (queryCache.size >= MAX_CACHE_SIZE) {
    const firstKey = queryCache.keys().next().value;
    queryCache.delete(firstKey);
  }
  queryCache.set(cacheKey, result);

  return result;
}

function jaccardSimilarity(setA, setB) {
  if (!setA || !setB || setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const elem of setA) {
    if (setB.has(elem)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// Auto-initialize on load
initRetriever();

module.exports = { retrieveContext, initRetriever };
