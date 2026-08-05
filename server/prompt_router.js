/**
 * Placidus AI — Prompt Router & Intent Classifier
 *
 * Classifies user intent into 7 distinct response modes and constructs
 * tailored system prompts and directives to prevent hallucinations.
 */

'use strict';

const RESPONSE_MODES = {
  MODE_1_CHART: 'chart_interpretation',
  MODE_2_KNOWLEDGE: 'knowledge_question',
  MODE_3_EDUCATIONAL: 'educational_mode',
  MODE_4_ELABORATION: 'elaboration_mode',
  MODE_5_COMPARISON: 'comparison_mode',
  MODE_6_FOLLOWUP: 'chart_followup',
  MODE_7_CONVERSATION: 'general_conversation'
};

/**
 * Classifies user prompt and conversation history into one of the 7 modes.
 */
function classifyIntent(query, chartData, history = []) {
  const qLower = (query || '').toLowerCase().trim();
  const recentHistory = history.slice(-4);
  const lastUserMsg = [...recentHistory].reverse().find(m => m.role === 'user');

  // Check Mode 4: Elaboration Mode
  if (qLower.includes('elaborate') || qLower.includes('more detail') || qLower.includes('expand on') || qLower.includes('tell me more')) {
    return {
      mode: RESPONSE_MODES.MODE_4_ELABORATION,
      description: 'Elaboration Mode — expand strictly on verified retrieved knowledge.'
    };
  }

  // Check Mode 5: Comparison Mode
  if (qLower.includes('compare') || qLower.includes('versus') || qLower.includes(' vs ') || qLower.includes('difference between')) {
    return {
      mode: RESPONSE_MODES.MODE_5_COMPARISON,
      description: 'Comparison Mode — structured comparison of astrological concepts.'
    };
  }

  // Check Mode 6: Chart Follow-up
  if (lastUserMsg && (qLower.startsWith('why') || qLower.startsWith('how about') || qLower.includes('here') || qLower.includes('this placement') || qLower.includes('that aspect'))) {
    if (chartData && chartData.positions) {
      return {
        mode: RESPONSE_MODES.MODE_6_FOLLOWUP,
        description: 'Chart Follow-up Mode — maintaining active natal chart memory.'
      };
    }
  }

  // Check Mode 3: Educational Mode
  if (qLower.includes('explain') || qLower.includes('history of') || qLower.includes('what is the meaning of') || qLower.includes('how does')) {
    return {
      mode: RESPONSE_MODES.MODE_3_EDUCATIONAL,
      description: 'Educational Mode — historical and methodological context.'
    };
  }

  // Check Mode 1: Direct Chart Interpretation
  const containsPlanetOrHouse = /saturn|mars|jupiter|venus|mercury|sun|moon|ascendant|node|fortune|house|1st|2nd|3rd|4th|5th|6th|7th|8th|9th|10th|11th|12th|aries|taurus|gemini|cancer|leo|virgo|libra|scorpio|sagittarius|capricorn|aquarius|pisces/i.test(qLower);
  if (chartData && chartData.positions && containsPlanetOrHouse) {
    return {
      mode: RESPONSE_MODES.MODE_1_CHART,
      description: 'Chart Interpretation Mode — synthesizing client chart data with Hellenistic principles.'
    };
  }

  // Check Mode 2: Knowledge Question
  if (qLower.includes('what is') || qLower.includes('define') || qLower.includes('what are')) {
    return {
      mode: RESPONSE_MODES.MODE_2_KNOWLEDGE,
      description: 'Knowledge Question Mode — pure RAG knowledge base retrieval.'
    };
  }

  // Default: General Conversation Mode
  return {
    mode: RESPONSE_MODES.MODE_7_CONVERSATION,
    description: 'Conversation Mode — natural, supportive astrological dialogue.'
  };
}

/**
 * Builds the mode-tailored system prompt for the LLM.
 */
function buildSystemPrompt(intent, chartCtx, ragContext, citations = []) {
  const baseInstruction = `You are Placidus AI, an elite Hellenistic astrological counselor.
Your primary foundation is Demetra George's Authentic Self framework and traditional classical astrology principles.

### STRICT HALLUCINATION PREVENTION RULES:
1. Ground every interpretation strictly in established astrological methodology and retrieved evidence.
2. NEVER invent fake astrological meanings, hypothetical placements, or speculative facts.
3. If the retrieved knowledge base or chart data does NOT contain sufficient evidence to answer accurately, EXPLICITLY respond:
   "I don't have sufficient evidence in the current knowledge base to answer that accurately."
4. Do NOT cite specific author names or copyright book titles. Refer to sources as "Traditional Hellenistic principles", "Classical astrological wisdom", or "The Authentic Self framework".

### ACTIVE MODE DIRECTIVE: [${intent.description}]
`;

  let modeSpecificPrompt = '';

  switch (intent.mode) {
    case RESPONSE_MODES.MODE_1_CHART:
      modeSpecificPrompt = `
MODE 1 DIRECTIVE (Chart Interpretation):
Synthesize the client's natal chart data with classical principles.
Structure your response in clear logical sections:
- 📜 **Astrological Principle**: The underlying traditional rule or dignity mechanics.
- ✨ **Chart Reading**: Direct interpretation of the client's exact degrees, sign, house, and sect placement.
- 🔮 **Guidance**: Practical advice for constructive authentic expression.
`;
      break;

    case RESPONSE_MODES.MODE_2_KNOWLEDGE:
    case RESPONSE_MODES.MODE_3_EDUCATIONAL:
      modeSpecificPrompt = `
MODE 2 & 3 DIRECTIVE (Educational & Knowledge):
Answer the astrological concept clearly using the retrieved knowledge base.
Provide historical context, traditional origins (e.g. Greek/Hellenistic roots), and practical application.
Cite traditional principles directly without needing personal chart data.
`;
      break;

    case RESPONSE_MODES.MODE_4_ELABORATION:
      modeSpecificPrompt = `
MODE 4 DIRECTIVE (Elaboration):
The user wants deeper elaboration on the previous topic.
- Drop rigid headers! Speak fluidly and in-depth as an expert counselor.
- Elaborate ONLY on information supported by retrieved knowledge or verified mechanics.
- Do NOT invent new facts. Explain planetary dignities, sect conditions, triplicity, or house dynamics with depth.
`;
      break;

    case RESPONSE_MODES.MODE_5_COMPARISON:
      modeSpecificPrompt = `
MODE 5 DIRECTIVE (Comparison):
Produce a structured comparison between the requested concepts (e.g. house systems, dignities, or techniques).
Use bullet points or side-by-side analysis contrasting methodology, origins, and practical interpretation.
`;
      break;

    case RESPONSE_MODES.MODE_6_FOLLOWUP:
      modeSpecificPrompt = `
MODE 6 DIRECTIVE (Chart Follow-up):
Recognize this as a follow-up referring to the current active chart.
Maintain context seamlessly without re-asking for birth details.
Explain the specific placement or planet in detail within the context of the overall natal blueprint.
`;
      break;

    default:
      modeSpecificPrompt = `
MODE 7 DIRECTIVE (General Conversation):
Respond warmly, articulately, and authentically as an expert astrological counselor.
`;
      break;
  }

  return `${baseInstruction}
${modeSpecificPrompt}

CLIENT NATAL CHART DATA:
${chartCtx}

RETRIEVED ANCIENT WISDOM & KNOWLEDGE BASE EXCERPTS:
====
${ragContext}
====
`;
}

module.exports = {
  RESPONSE_MODES,
  classifyIntent,
  buildSystemPrompt
};
