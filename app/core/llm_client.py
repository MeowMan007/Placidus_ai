"""
LLM Client Abstraction
Supports multiple providers: OpenAI, HuggingFace Inference API, local models.
Falls back to template-based generation when no API keys are configured.
"""
import os
import json
from typing import List, Dict, Optional, Generator
from dataclasses import dataclass
import httpx

from app.core.config import get_settings


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
                 max_tokens: int = 2000) -> LLMResponse:
        raise NotImplementedError

    def generate_stream(self, messages: List[LLMMessage], temperature: float = 0.7,
                        max_tokens: int = 2000) -> Generator[str, None, None]:
        raise NotImplementedError


class OpenAIClient(BaseLLMClient):
    """OpenAI GPT-4 / GPT-3.5 client."""

    def __init__(self, api_key: Optional[str] = None, model: str = "gpt-4"):
        self.api_key = api_key or os.getenv("OPENAI_API_KEY")
        self.model = model
        self.base_url = "https://api.openai.com/v1"

    def generate(self, messages: List[LLMMessage], temperature: float = 0.7,
                 max_tokens: int = 2000) -> LLMResponse:
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
            timeout=60.0
        )
        response.raise_for_status()
        data = response.json()

        return LLMResponse(
            content=data["choices"][0]["message"]["content"],
            tokens_used=data.get("usage", {}).get("total_tokens", 0),
            model=self.model
        )

    def generate_stream(self, messages: List[LLMMessage], temperature: float = 0.7,
                        max_tokens: int = 2000) -> Generator[str, None, None]:
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
            "max_tokens": max_tokens,
            "stream": True
        }

        with httpx.stream(
            "POST",
            f"{self.base_url}/chat/completions",
            headers=headers,
            json=payload,
            timeout=60.0
        ) as response:
            response.raise_for_status()
            for line in response.iter_lines():
                if line.startswith("data: "):
                    data = line[6:]
                    if data == "[DONE]":
                        break
                    try:
                        chunk = json.loads(data)
                        delta = chunk["choices"][0]["delta"].get("content", "")
                        if delta:
                            yield delta
                    except (json.JSONDecodeError, KeyError):
                        continue


class HuggingFaceClient(BaseLLMClient):
    """HuggingFace Inference API client."""

    def __init__(self, api_key: Optional[str] = None, 
                 model: str = "mistralai/Mistral-7B-Instruct-v0.2"):
        self.api_key = api_key or os.getenv("HUGGINGFACE_API_KEY")
        self.model = model
        self.base_url = f"https://api-inference.huggingface.co/models/{model}"

    def generate(self, messages: List[LLMMessage], temperature: float = 0.7,
                 max_tokens: int = 2000) -> LLMResponse:
        if not self.api_key:
            raise RuntimeError("HuggingFace API key not configured")

        # Convert messages to prompt
        prompt = self._messages_to_prompt(messages)

        headers = {"Authorization": f"Bearer {self.api_key}"}
        payload = {
            "inputs": prompt,
            "parameters": {
                "temperature": temperature,
                "max_new_tokens": max_tokens,
                "return_full_text": False
            }
        }

        response = httpx.post(
            self.base_url,
            headers=headers,
            json=payload,
            timeout=120.0
        )
        response.raise_for_status()
        data = response.json()

        if isinstance(data, list) and len(data) > 0:
            text = data[0].get("generated_text", "")
        else:
            text = str(data)

        return LLMResponse(content=text, model=self.model)

    def _messages_to_prompt(self, messages: List[LLMMessage]) -> str:
        """Convert chat messages to Mistral instruction format."""
        prompt_parts = []
        for m in messages:
            if m.role == "system":
                prompt_parts.append(f"<s>[INST] {m.content} [/INST]")
            elif m.role == "user":
                prompt_parts.append(f"[INST] {m.content} [/INST]")
            else:
                prompt_parts.append(f" {m.content}</s>")
        return "
".join(prompt_parts)


class LocalLLMClient(BaseLLMClient):
    """Local model via llama.cpp or similar local server."""

    def __init__(self, base_url: str = "http://localhost:8080"):
        self.base_url = base_url

    def generate(self, messages: List[LLMMessage], temperature: float = 0.7,
                 max_tokens: int = 2000) -> LLMResponse:
        prompt = "
".join([f"{m.role}: {m.content}" for m in messages])

        response = httpx.post(
            f"{self.base_url}/completion",
            json={
                "prompt": prompt,
                "temperature": temperature,
                "n_predict": max_tokens
            },
            timeout=120.0
        )
        response.raise_for_status()
        data = response.json()

        return LLMResponse(
            content=data.get("content", ""),
            model="local"
        )


class FallbackLLMClient(BaseLLMClient):
    """
    Fallback client that uses template-based generation.
    Used when no external LLM is configured.
    """

    def generate(self, messages: List[LLMMessage], temperature: float = 0.7,
                 max_tokens: int = 2000) -> LLMResponse:
        # Return the last user message as a signal that fallback is active
        user_msg = next((m.content for m in reversed(messages) if m.role == "user"), "")
        return LLMResponse(
            content=f"[Fallback Mode] Query received: {user_msg[:100]}...\n\n"
                    "Configure OPENAI_API_KEY or HUGGINGFACE_API_KEY for AI-generated responses.",
            model="fallback"
        )

    def generate_stream(self, messages: List[LLMMessage], temperature: float = 0.7,
                        max_tokens: int = 2000) -> Generator[str, None, None]:
        yield "[Fallback Mode] "
        yield "Configure an LLM provider to enable streaming responses."


def get_llm_client() -> BaseLLMClient:
    """Factory function to get the appropriate LLM client."""
    settings = get_settings()

    if settings.LLM_PROVIDER == "openai" and settings.OPENAI_API_KEY:
        return OpenAIClient(api_key=settings.OPENAI_API_KEY)
    elif settings.LLM_PROVIDER == "huggingface" and settings.HUGGINGFACE_API_KEY:
        return HuggingFaceClient(
            api_key=settings.HUGGINGFACE_API_KEY,
            model=settings.HUGGINGFACE_MODEL
        )
    elif settings.LLM_PROVIDER == "local":
        return LocalLLMClient()
    else:
        return FallbackLLMClient()
