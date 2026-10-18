"""
LLM Client Abstraction
Supports multiple providers: Google Gemini (Free), Groq (Free fast), OpenAI, Hugging Face, or local models.
Provides intelligent fallback when external APIs are unconfigured or hit rate limits.
"""
import os
import json
import logging
from typing import List, Dict, Optional, Generator
from dataclasses import dataclass
import httpx

from app.core.config import get_settings

logger = logging.getLogger("astroai.llm")


@dataclass
class LLMMessage:
    role: str
    content: str


@dataclass
class LLMResponse:
    content: str
    tokens_used: int = 0
    model: str = ""
    finish_reason: str = "stop"


class BaseLLMClient:
    """Abstract base for LLM providers."""

    def generate(self, messages: List[LLMMessage], temperature: float = 0.7, 
                 max_tokens: int = 1500) -> LLMResponse:
        raise NotImplementedError


class GeminiClient(BaseLLMClient):
    """Google Gemini API client (supports free tier gemini-1.5-flash / gemini-2.0-flash)."""

    def __init__(self, api_key: Optional[str] = None, model: str = "gemini-1.5-flash"):
        self.api_key = api_key or os.getenv("GEMINI_API_KEY")
        self.model = model
        self.base_url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

    def generate(self, messages: List[LLMMessage], temperature: float = 0.7,
                 max_tokens: int = 1500) -> LLMResponse:
        if not self.api_key:
            raise RuntimeError("Gemini API key not configured")

        contents = []
        system_instruction = None
        for m in messages:
            if m.role == "system":
                system_instruction = {"parts": [{"text": m.content}]}
            else:
                role = "user" if m.role == "user" else "model"
                contents.append({"role": role, "parts": [{"text": m.content}]})

        payload = {
            "contents": contents,
            "generationConfig": {
                "temperature": temperature,
                "maxOutputTokens": max_tokens
            }
        }
        if system_instruction:
            payload["systemInstruction"] = system_instruction

        response = httpx.post(
            f"{self.base_url}?key={self.api_key}",
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=45.0
        )
        response.raise_for_status()
        data = response.json()

        text = ""
        candidates = data.get("candidates", [])
        if candidates:
            parts = candidates[0].get("content", {}).get("parts", [])
            if parts:
                text = parts[0].get("text", "")

        return LLMResponse(content=text, model=self.model)


class GroqClient(BaseLLMClient):
    """Groq API client (ultra-fast free tier)."""

    def __init__(self, api_key: Optional[str] = None, model: str = "llama-3.1-8b-instant"):
        self.api_key = api_key or os.getenv("GROQ_API_KEY")
        self.model = model
        self.base_url = "https://api.groq.com/openai/v1/chat/completions"

    def generate(self, messages: List[LLMMessage], temperature: float = 0.7,
                 max_tokens: int = 1500) -> LLMResponse:
        if not self.api_key:
            raise RuntimeError("Groq API key not configured")

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": self.model,
            "messages": [{"role": m.role, "content": m.content} for m in messages],
            "temperature": temperature,
            "max_tokens": max_tokens
        }

        response = httpx.post(self.base_url, headers=headers, json=payload, timeout=30.0)
        response.raise_for_status()
        data = response.json()

        return LLMResponse(
            content=data["choices"][0]["message"]["content"],
            tokens_used=data.get("usage", {}).get("total_tokens", 0),
            model=self.model
        )


class OpenAIClient(BaseLLMClient):
    """OpenAI GPT-4 / GPT-3.5 client."""

    def __init__(self, api_key: Optional[str] = None, model: str = "gpt-4o-mini"):
        self.api_key = api_key or os.getenv("OPENAI_API_KEY")
        self.model = model
        self.base_url = "https://api.openai.com/v1"

    def generate(self, messages: List[LLMMessage], temperature: float = 0.7,
                 max_tokens: int = 1500) -> LLMResponse:
        if not self.api_key:
            raise RuntimeError("OpenAI API key not configured")

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": self.model,
            "messages": [{"role": m.role, "content": m.content} for m in messages],
            "temperature": temperature,
            "max_tokens": max_tokens
        }

        response = httpx.post(
            f"{self.base_url}/chat/completions",
            headers=headers,
            json=payload,
            timeout=45.0
        )
        response.raise_for_status()
        data = response.json()

        return LLMResponse(
            content=data["choices"][0]["message"]["content"],
            tokens_used=data.get("usage", {}).get("total_tokens", 0),
            model=self.model
        )


class HuggingFaceClient(BaseLLMClient):
    """HuggingFace Inference API client."""

    def __init__(self, api_key: Optional[str] = None, 
                 model: str = "mistralai/Mistral-7B-Instruct-v0.2"):
        self.api_key = api_key or os.getenv("HUGGINGFACE_API_KEY")
        self.model = model

    def generate(self, messages: List[LLMMessage], temperature: float = 0.7,
                 max_tokens: int = 1500) -> LLMResponse:
        if not self.api_key:
            raise RuntimeError("HuggingFace API key not configured")

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }

        # Try Hugging Face modern router
        router_url = "https://router.huggingface.co/v1/chat/completions"
        payload = {
            "model": self.model,
            "messages": [{"role": m.role, "content": m.content} for m in messages],
            "temperature": temperature,
            "max_tokens": max_tokens
        }

        try:
            response = httpx.post(router_url, headers=headers, json=payload, timeout=40.0)
            if response.status_code == 200:
                data = response.json()
                content = data["choices"][0]["message"]["content"]
                return LLMResponse(content=content, model=self.model)
            else:
                logger.warning(f"HF router returned {response.status_code}: {response.text[:120]}")
        except Exception as e:
            logger.warning(f"HF router error: {e}")

        # Try direct inference endpoint
        direct_url = f"https://router.huggingface.co/hf-inference/models/{self.model}"
        prompt = "\n".join([f"{m.role.upper()}: {m.content}" for m in messages])
        try:
            r = httpx.post(
                direct_url,
                headers=headers,
                json={"inputs": prompt, "parameters": {"max_new_tokens": max_tokens, "temperature": temperature}},
                timeout=40.0
            )
            if r.status_code == 200:
                res = r.json()
                if isinstance(res, list) and res:
                    return LLMResponse(content=res[0].get("generated_text", ""), model=self.model)
                elif isinstance(res, dict) and "generated_text" in res:
                    return LLMResponse(content=res["generated_text"], model=self.model)
        except Exception as e:
            logger.warning(f"HF direct endpoint error: {e}")

        raise RuntimeError(f"Hugging Face Inference call failed for model {self.model}")


class FallbackLLMClient(BaseLLMClient):
    """
    Fallback client signalling that native astrological synthesis should run.
    """

    def generate(self, messages: List[LLMMessage], temperature: float = 0.7,
                 max_tokens: int = 1500) -> LLMResponse:
        return LLMResponse(content="", model="synthesis")


def get_llm_client() -> BaseLLMClient:
    """Factory function to get the appropriate LLM client."""
    settings = get_settings()

    # Priority 1: Google Gemini (Free & highly capable)
    if settings.GEMINI_API_KEY:
        return GeminiClient(api_key=settings.GEMINI_API_KEY)

    # Priority 2: Groq (Free & fast)
    if settings.GROQ_API_KEY:
        return GroqClient(api_key=settings.GROQ_API_KEY, model=settings.GROQ_MODEL)

    # Priority 3: OpenAI
    if settings.OPENAI_API_KEY and settings.LLM_PROVIDER in ["openai", "fallback"]:
        return OpenAIClient(api_key=settings.OPENAI_API_KEY)

    # Priority 4: Hugging Face
    if settings.HUGGINGFACE_API_KEY and settings.LLM_PROVIDER in ["huggingface", "fallback"]:
        return HuggingFaceClient(
            api_key=settings.HUGGINGFACE_API_KEY,
            model=settings.HUGGINGFACE_MODEL
        )

    # Fallback to astrological synthesis engine
    return FallbackLLMClient()
