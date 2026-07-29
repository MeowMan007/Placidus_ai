const fs = require('fs');
const path = require('path');

const PDF_TEXT_PATH = path.join(__dirname, '../../pdf_text.txt');

let bookSections = [];

/**
 * Initializes and parses the Demetra George PDF text into indexed RAG knowledge chunks
 */
function initPdfRetriever() {
  try {
    if (!fs.existsSync(PDF_TEXT_PATH)) {
      console.warn("pdf_text.txt not found at:", PDF_TEXT_PATH);
      return;
    }

    const rawText = fs.readFileSync(PDF_TEXT_PATH, 'utf-8');
    
    // Split text into page chunks
    const pageBlocks = rawText.split(/=== PAGE \d+ ===/);
    
    let currentTopic = "General Astrology Principles";
    let buffer = "";

    pageBlocks.forEach((block, index) => {
      const cleanBlock = block.trim();
      if (!cleanBlock) return;

      // Identify major topic headings
      if (cleanBlock.includes("Chapter 4") || cleanBlock.includes("Ascendant")) {
        currentTopic = "Ascendant, Ruler & Life Direction";
      } else if (cleanBlock.includes("Chapter 2") || cleanBlock.includes("Planetary Condition") || cleanBlock.includes("Sect")) {
        currentTopic = "Planetary Condition, Sect & Dignities";
      } else if (cleanBlock.includes("Chapter 5") || cleanBlock.includes("Sun, the Moon")) {
        currentTopic = "Sun, Moon & Life Purpose";
      } else if (cleanBlock.includes("Chapter 8") || cleanBlock.includes("Lunar Nodes") || cleanBlock.includes("Fortune")) {
        currentTopic = "Fortune, Lunar Nodes (North & South Node) & Eclipses";
      } else if (cleanBlock.includes("Chapter 9") || cleanBlock.includes("Asteroid")) {
        currentTopic = "Mythic Asteroids";
      } else if (cleanBlock.includes("Chapter 10") || cleanBlock.includes("Aspect Patterns")) {
        currentTopic = "Aspect Patterns & Geometry";
      } else if (cleanBlock.includes("Chapter 11") || cleanBlock.includes("Vocation")) {
        currentTopic = "Vocation, Career & Relationships";
      }

      bookSections.push({
        id: index,
        topic: currentTopic,
        text: cleanBlock.substring(0, 1500) // 1500 char chunk
      });
    });

    console.log(`[RAG PDF Retriever] Successfully indexed ${bookSections.length} book sections from Demetra George text.`);
  } catch (err) {
    console.error("[RAG PDF Retriever] Error loading book text:", err);
  }
}

/**
 * Retrieves relevant book text chunks based on user query and chart features
 */
function retrieveBookContext(query, chartData) {
  if (bookSections.length === 0) {
    initPdfRetriever();
  }

  const queryLower = (query || "").toLowerCase();
  const matchedChunks = [];

  // Keywords matching
  const keywords = [];
  if (queryLower.includes("node") || queryLower.includes("north") || queryLower.includes("south")) {
    keywords.push("Lunar Nodes", "North Node", "South Node", "Fortune");
  }
  if (queryLower.includes("ascendant") || queryLower.includes("ruler") || queryLower.includes("direction")) {
    keywords.push("Ascendant", "Ruler", "Life Direction");
  }
  if (queryLower.includes("sun") || queryLower.includes("moon") || queryLower.includes("purpose")) {
    keywords.push("Sun", "Moon", "Life Purpose");
  }
  if (queryLower.includes("sect") || queryLower.includes("day") || queryLower.includes("night") || queryLower.includes("benefic")) {
    keywords.push("Sect", "Planetary Condition", "Diurnal");
  }
  if (queryLower.includes("aspect") || queryLower.includes("trine") || queryLower.includes("square")) {
    keywords.push("Aspect Patterns");
  }
  if (queryLower.includes("vocation") || queryLower.includes("career") || queryLower.includes("job")) {
    keywords.push("Vocation", "Career");
  }

  // Filter chunks by keywords or topics
  bookSections.forEach(section => {
    const sectionTextLower = section.text.toLowerCase();
    let score = 0;

    keywords.forEach(kw => {
      if (sectionTextLower.includes(kw.toLowerCase()) || section.topic.toLowerCase().includes(kw.toLowerCase())) {
        score += 3;
      }
    });

    // Also match chart planetary names
    if (chartData && chartData.ascendantRuler) {
      if (sectionTextLower.includes(chartData.ascendantRuler.toLowerCase())) score += 2;
    }

    if (score > 0) {
      matchedChunks.push({ score, text: section.text, topic: section.topic });
    }
  });

  // Sort by relevance score
  matchedChunks.sort((a, b) => b.score - a.score);

  // Return top 3 matched chunks
  const topChunks = matchedChunks.slice(0, 3);
  if (topChunks.length === 0) {
    // Fallback to sample foundational chapters
    return bookSections.slice(10, 13).map(s => `[Topic: ${s.topic}]\n${s.text}`).join('\n\n---\n\n');
  }

  return topChunks.map(c => `[Excerpt Topic: ${c.topic}]\n${c.text}`).join('\n\n---\n\n');
}

// Initialize on module load
initPdfRetriever();

module.exports = {
  initPdfRetriever,
  retrieveBookContext
};
