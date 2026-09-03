"""
Chat provider abstraction for the AI Assistant (/api/chat).

Providers
---------
* GeminiChatProvider  — live, when GEMINI_API_KEY is set.
* NotConfiguredChatProvider — safe fallback that never invents data.

Usage
-----
    from app.services.chat_provider import get_chat_provider
    provider = get_chat_provider()
    async for chunk in provider.chat(session_id, message, history):
        yield chunk          # SSE delta string
"""
import logging
from abc import ABC, abstractmethod
from typing import AsyncIterator

from app.core.config import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Gemini model to use.  gemini-flash-latest resolves to the newest supported
# flash model on the API key (currently gemini-3.8-flash).
# gemini-1.5-flash was deprecated and removed for new API keys.
# ---------------------------------------------------------------------------
GEMINI_CHAT_MODEL = "gemini-flash-latest"

# ---------------------------------------------------------------------------
# System prompt — gives the model context about the ERP product.
# ---------------------------------------------------------------------------
_SYSTEM_PROMPT = (
    "You are an expert AI accounting and ERP assistant embedded inside Ledgerly, "
    "a UAE-based inventory and accounting ERP system. "
    "You help business owners and staff with questions about: "
    "accounting principles, VAT (UAE 5% standard rate), financial analysis, "
    "inventory management, purchase orders, invoicing, cash flow, and general ERP usage. "
    "When asked about specific data (balances, stock counts, etc.), remind the user that "
    "you cannot query the live database directly, but you can guide them to the correct "
    "screen or explain the concept. "
    "Be concise, professional, and practical. Use AED (UAE Dirham) as the default currency "
    "unless the user specifies otherwise. "
    "Never fabricate specific financial figures for the user's business."
)


# ---------------------------------------------------------------------------
# Abstract base
# ---------------------------------------------------------------------------
class ChatProvider(ABC):
    @abstractmethod
    async def chat(
        self,
        session_id: str,
        message: str,
        history: list[dict],
    ) -> AsyncIterator[str]:
        """
        Yield text delta strings (plain text, not SSE-formatted).
        Each yielded string is a chunk of the assistant's reply.
        history is a list of {"role": "user"|"model", "parts": [str]} dicts.
        """
        ...

    def name(self) -> str:
        return self.__class__.__name__


# ---------------------------------------------------------------------------
# NotConfiguredChatProvider — safe fallback
# ---------------------------------------------------------------------------
class NotConfiguredChatProvider(ChatProvider):
    """Returns a clear, honest 'not configured' message — never invents data."""

    async def chat(
        self,
        session_id: str,
        message: str,
        history: list[dict],
    ) -> AsyncIterator[str]:
        async def _gen():
            yield (
                "The AI Assistant is not configured in this environment. "
                "Set GEMINI_API_KEY in backend/.env to enable it."
            )
        return _gen()


# ---------------------------------------------------------------------------
# GeminiChatProvider — live Gemini integration
# ---------------------------------------------------------------------------
class GeminiChatProvider(ChatProvider):
    """
    Streams responses from Google Gemini (gemini-1.5-flash).
    History is maintained by the caller (router) and passed in per-request.
    """

    def __init__(self, api_key: str):
        from google import genai  # lazy import — only when key is set
        self._client = genai.Client(api_key=api_key)
        self._model_name = GEMINI_CHAT_MODEL
        logger.info(
            "[GeminiChatProvider] Initialised with model=%s (key configured: %s)",
            self._model_name,
            bool(api_key),
        )

    async def chat(
        self,
        session_id: str,
        message: str,
        history: list[dict],
    ) -> AsyncIterator[str]:
        """
        Stream a Gemini reply.  history is a list of Content dicts already
        in Gemini format: [{"role": "user"|"model", "parts": ["text..."]}].
        """
        import asyncio
        from google.genai import types as genai_types

        # Build the conversation history for Gemini (Contents list)
        gemini_history = []
        for turn in history:
            role = turn.get("role", "user")
            # google.genai uses "model" not "assistant"
            if role == "assistant":
                role = "model"
            parts = turn.get("parts") or turn.get("content")
            if isinstance(parts, str):
                parts = [parts]
            gemini_history.append(
                genai_types.Content(role=role, parts=[genai_types.Part(text=p) for p in parts])
            )

        logger.info(
            "[GeminiChatProvider] Sending message to %s (session=%s, history_turns=%d)",
            self._model_name,
            session_id,
            len(gemini_history),
        )

        config = genai_types.GenerateContentConfig(
            system_instruction=_SYSTEM_PROMPT,
            temperature=0.7,
            max_output_tokens=4096,
            # Disable extended thinking so token budget goes to the actual response.
            # For an ERP assistant, fast conversational replies are preferred over
            # slow deep-reasoning outputs.
            thinking_config=genai_types.ThinkingConfig(thinking_budget=0),
        )

        async def _stream_gen() -> AsyncIterator[str]:
            try:
                loop = asyncio.get_event_loop()

                # Append the current user message to history for context
                full_contents = gemini_history + [
                    genai_types.Content(role="user", parts=[genai_types.Part(text=message)])
                ]

                def _send_stream():
                    return self._client.models.generate_content_stream(
                        model=self._model_name,
                        contents=full_contents,
                        config=config,
                    )

                stream = await loop.run_in_executor(None, _send_stream)

                for chunk in stream:
                    text = ""
                    if hasattr(chunk, "text") and chunk.text:
                        text = chunk.text
                    if text:
                        yield text

            except Exception as exc:
                logger.error("[GeminiChatProvider] API error: %s: %s", type(exc).__name__, exc)
                yield f"\n\n[AI Error: {type(exc).__name__} — please try again or check your API key quota.]"

        return _stream_gen()

    def name(self) -> str:
        return f"GeminiChatProvider({GEMINI_CHAT_MODEL})"


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------
def get_chat_provider() -> ChatProvider:
    """
    Returns the appropriate chat provider based on available configuration.
    GeminiChatProvider when GEMINI_API_KEY is set; NotConfiguredChatProvider otherwise.
    """
    if settings.GEMINI_API_KEY:
        return GeminiChatProvider(settings.GEMINI_API_KEY)
    return NotConfiguredChatProvider()
