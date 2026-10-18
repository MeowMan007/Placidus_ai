"""
RAG Ingestion Pipeline for Astrology Knowledge Base
Processes PDF text into semantic chunks with metadata, generates embeddings,
and stores in a searchable vector index.
"""
import re
import json
import pickle
import hashlib
from pathlib import Path
from typing import List, Dict, Optional
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity


class AstrologyChunk:
    """Represents a semantic chunk of the astrology text."""
    def __init__(self, text: str, source: str, page: int, chapter: str,
                 heading: str, chunk_id: str, index: int):
        self.text = text
        self.source = source
        self.page = page
        self.chapter = chapter
        self.heading = heading
        self.chunk_id = chunk_id
        self.index = index

    def to_dict(self) -> Dict:
        return {
            "chunk_id": self.chunk_id,
            "text": self.text,
            "source": self.source,
            "page": self.page,
            "chapter": self.chapter,
            "heading": self.heading,
            "index": self.index
        }


class DocumentIngestion:
    """
    Ingests astrology documents, cleans text, splits into semantic chunks,
    and preserves structural metadata (chapters, headings, page numbers).
    """

    def __init__(self, chunk_size: int = 512, chunk_overlap: int = 128):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.chunks: List[AstrologyChunk] = []

    def clean_text(self, text: str) -> str:
        """Normalize and clean raw text."""
        text = re.sub(r'\n+', ' ', text)
        text = re.sub(r'\s+', ' ', text)
        text = re.sub(r'[#*•]', '', text)
        return text.strip()

    def split_semantic_chunks(self, text: str, metadata: Dict) -> List[AstrologyChunk]:
        """
        Split text into overlapping semantic chunks while preserving sentence boundaries.
        """
        sentences = re.split(r'(?<=[.!?])\s+', text)
        chunks = []
        current_chunk = []
        current_length = 0
        chunk_index = 0

        for sentence in sentences:
            sent_len = len(sentence.split())

            if current_length + sent_len > self.chunk_size and current_chunk:
                chunk_text = " ".join(current_chunk)
                chunk_id = hashlib.md5(chunk_text.encode()).hexdigest()[:12]
                chunks.append(AstrologyChunk(
                    text=chunk_text,
                    source=metadata.get("source", "unknown"),
                    page=metadata.get("page", 0),
                    chapter=metadata.get("chapter", "Unknown"),
                    heading=metadata.get("heading", "General"),
                    chunk_id=chunk_id,
                    index=chunk_index
                ))
                chunk_index += 1

                overlap_tokens = 0
                overlap_sentences = []
                for s in reversed(current_chunk):
                    if overlap_tokens + len(s.split()) > self.chunk_overlap:
                        break
                    overlap_sentences.insert(0, s)
                    overlap_tokens += len(s.split())

                current_chunk = overlap_sentences + [sentence]
                current_length = overlap_tokens + sent_len
            else:
                current_chunk.append(sentence)
                current_length += sent_len

        if current_chunk:
            chunk_text = " ".join(current_chunk)
            chunk_id = hashlib.md5(chunk_text.encode()).hexdigest()[:12]
            chunks.append(AstrologyChunk(
                text=chunk_text,
                source=metadata.get("source", "unknown"),
                page=metadata.get("page", 0),
                chapter=metadata.get("chapter", "Unknown"),
                heading=metadata.get("heading", "General"),
                chunk_id=chunk_id,
                index=chunk_index
            ))

        return chunks

    def ingest_document(self, text: str, source_name: str, page_offset: int = 0):
        """Process a full document text into the chunk store."""
        clean = self.clean_text(text)
        meta = {
            "source": source_name,
            "page": page_offset,
            "chapter": source_name,
            "heading": "General"
        }
        new_chunks = self.split_semantic_chunks(clean, meta)
        self.chunks.extend(new_chunks)

    def save_chunks(self, path: str):
        """Serialize chunks to disk."""
        data = [c.to_dict() for c in self.chunks]
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

    def load_chunks(self, path: str):
        """Load chunks from disk."""
        with open(path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        self.chunks = [AstrologyChunk(**d) for d in data]


class EmbeddingEngine:
    """
    Generates embeddings for text chunks.
    Fallback: sklearn TF-IDF (no external DL dependencies)
    Production: sentence-transformers + FAISS/ChromaDB
    """

    def __init__(self, model_name: str = "fallback-tfidf", device: str = "cpu"):
        self.model_name = model_name
        self.device = device
        self.vectorizer: Optional[TfidfVectorizer] = None
        self.vectors: Optional[np.ndarray] = None

        if model_name != "fallback-tfidf":
            try:
                from sentence_transformers import SentenceTransformer
                self.model = SentenceTransformer(model_name, device=device)
            except ImportError:
                raise RuntimeError(
                    "sentence-transformers not installed. "
                    "Install with: pip install sentence-transformers"
                )

    def fit(self, chunks: List[AstrologyChunk]):
        """Fit embedding model on corpus."""
        texts = [c.text for c in chunks]

        if self.model_name == "fallback-tfidf":
            self.vectorizer = TfidfVectorizer(
                max_features=768,
                ngram_range=(1, 2),
                stop_words='english'
            )
            self.vectors = self.vectorizer.fit_transform(texts).toarray()
        else:
            self.vectors = self.model.encode(texts, show_progress_bar=True)

    def encode_query(self, query: str) -> np.ndarray:
        """Embed a search query."""
        if self.model_name == "fallback-tfidf":
            if self.vectorizer is None:
                raise RuntimeError("Must call fit() before encode_query()")
            return self.vectorizer.transform([query]).toarray()
        else:
            return self.model.encode([query])

    def save(self, path: str):
        """Save fitted model and vectors."""
        payload = {
            "model_name": self.model_name,
            "vectors": self.vectors,
            "vectorizer": self.vectorizer
        }
        with open(path, 'wb') as f:
            pickle.dump(payload, f)

    def load(self, path: str):
        """Load fitted model and vectors."""
        with open(path, 'rb') as f:
            payload = pickle.load(f)
        self.model_name = payload["model_name"]
        self.vectors = payload["vectors"]
        self.vectorizer = payload.get("vectorizer")


class RAGRetriever:
    """
    Retrieves relevant chunks given a query, with citation metadata.
    Uses hybrid scoring (TF-IDF vector similarity + astrological keyword density)
    and filters out non-content metadata (author bios, indices, bibliographies).
    """

    def __init__(self, chunks: List[AstrologyChunk], embedder: EmbeddingEngine, top_k: int = 5):
        self.chunks = chunks
        self.embedder = embedder
        self.top_k = top_k

    @staticmethod
    def _clean_text(text: str) -> str:
        """Clean OCR artifacts, split words, and irregular spacing."""
        t = re.sub(r'(\b\w)\s+(\w\b)', r'\1\2', text)  # fix split single letters
        t = re.sub(r'\s+', ' ', t).strip()
        # Common astrological OCR errors in this text
        replacements = {
            "af flicted": "afflicted", "af fliction": "affliction",
            "co nducts": "conducts", "ef fective": "effective",
            "dif ferent": "different", "dif ficulty": "difficulty",
            "V enus": "Venus", "V ettius": "Vettius", "V alens": "Valens",
            "fo rce": "force", "ha ve": "have", "w ith": "with",
            "th ese": "these", "ten th": "tenth", "favour": "favor"
        }
        for k, v in replacements.items():
            t = t.replace(k, v)
        return t

    def retrieve(self, query: str, filter_chapter: Optional[str] = None) -> List[Dict]:
        """
        Retrieve top-k chunks relevant to query using hybrid scoring.
        """
        query_lower = query.lower()
        query_vec = self.embedder.encode_query(query)

        # Astrological keywords for targeted boost
        vocab = [
            "sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn",
            "uranus", "neptune", "pluto", "chiron", "north node", "south node",
            "rahu", "ketu", "sect", "diurnal", "nocturnal", "benefic", "malefic",
            "dignity", "domicile", "exaltation", "fall", "detriment", "peregrine",
            "triplicity", "bound", "term", "decan", "lord", "ruler", "ascendant",
            "midheaven", "career", "vocation", "profession", "tenth house", "10th house",
            "seventh house", "7th house", "relationship", "marriage", "love",
            "second house", "2nd house", "money", "wealth", "fortune", "spirit",
            "lot of fortune", "lot of spirit", "house", "aspect", "trine", "square",
            "sextile", "opposition", "conjunction", "combust", "retrograde"
        ]

        active_terms = [term for term in vocab if re.search(r'\b' + re.escape(term) + r'\b', query_lower)]

        candidates = []
        indices = []
        for i, c in enumerate(self.chunks):
            txt_lower = c.text.lower()
            # Filter non-informative metadata chunks
            if any(junk in txt_lower for junk in [
                "about the author", "received the regulus award",
                "table of contents", "bibliography", "isbn", "all rights reserved"
            ]):
                continue
            if filter_chapter and filter_chapter.lower() not in c.chapter.lower():
                continue
            candidates.append(c)
            indices.append(i)

        if not candidates:
            return []

        candidate_vectors = self.embedder.vectors[indices]
        similarities = cosine_similarity(query_vec, candidate_vectors)[0]

        scored_candidates = []
        for j, chunk in enumerate(candidates):
            sim = float(similarities[j])
            txt = chunk.text.lower()

            # Keyword matching score
            kw_score = 0.0
            for term in active_terms:
                count = len(re.findall(r'\b' + re.escape(term) + r'\b', txt))
                if count > 0:
                    kw_score += 0.25 + min(count * 0.1, 0.5)

            # Combined hybrid score
            total_score = (sim * 0.4) + (min(kw_score, 1.5) * 0.6)
            scored_candidates.append((total_score, sim, chunk))

        # Sort by hybrid score
        scored_candidates.sort(key=lambda x: x[0], reverse=True)
        top_items = scored_candidates[:self.top_k]

        results = []
        for score, sim, chunk in top_items:
            clean_chunk_dict = chunk.to_dict()
            clean_chunk_dict["text"] = self._clean_text(chunk.text)
            results.append({
                "chunk": clean_chunk_dict,
                "score": round(score, 4),
                "citation": f"{chunk.source}, {chunk.chapter}, p. {chunk.page}"
            })

        return results

    def generate_context(self, query: str, max_tokens: int = 2000) -> Dict:
        """
        Generate a context block for LLM consumption with inline citations.
        Returns context string and source list.
        """
        results = self.retrieve(query)
        context_parts = []
        sources = []
        total_len = 0

        for r in results:
            text = r["chunk"]["text"]
            cite = r["citation"]
            entry = f"[Source: {cite}]\n{text}\n"

            if total_len + len(entry.split()) > max_tokens:
                break

            context_parts.append(entry)
            sources.append({
                "citation": cite,
                "score": r["score"],
                "chunk_id": r["chunk"]["chunk_id"]
            })
            total_len += len(entry.split())

        return {
            "context": "\n---\n".join(context_parts),
            "sources": sources,
            "retrieved_chunks": len(results)
        }
