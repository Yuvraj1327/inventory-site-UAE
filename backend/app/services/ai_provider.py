"""
Provider abstraction for AI-based invoice/document extraction.

Providers
---------
* GeminiExtractionProvider  — live multimodal extraction via Gemini Vision,
                               used when GEMINI_API_KEY is set.
* NotConfiguredProvider     — safe fallback that never invents data.
* OpenAIExtractionProvider  — placeholder; not wired to a real call.

Swap providers by editing get_extraction_provider() below — no caller
code needs to change.
"""
import json
import logging
import re
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional

from app.core.config import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Gemini model for receipt/invoice extraction.
# gemini-flash-latest resolves to the newest flash model (gemini-3.8-flash).
# gemini-1.5-flash was deprecated for new API keys.
# ---------------------------------------------------------------------------
GEMINI_EXTRACTION_MODEL = "gemini-flash-latest"


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------
@dataclass
class ExtractedLine:
    part_number: str = ""
    description: str = ""
    quantity: float = 0.0
    unit_cost: float = 0.0


@dataclass
class ExtractionResult:
    ok: bool
    needs_manual_review: bool = True
    supplier_name: Optional[str] = None
    invoice_reference: Optional[str] = None
    # Receipt-scanner fields
    vendor: Optional[str] = None
    date: Optional[str] = None
    subtotal: Optional[float] = None
    tax: Optional[float] = None
    total: Optional[float] = None
    currency: Optional[str] = None
    category: Optional[str] = None
    line_items: list[dict] = field(default_factory=list)
    # Purchase-import fields
    lines: list[ExtractedLine] = field(default_factory=list)
    message: str = ""

    def to_dict(self) -> dict:
        return {
            "ok": self.ok,
            "needs_manual_review": self.needs_manual_review,
            "supplier_name": self.supplier_name,
            "invoice_reference": self.invoice_reference,
            "vendor": self.vendor,
            "date": self.date,
            "subtotal": self.subtotal,
            "tax": self.tax,
            "total": self.total,
            "currency": self.currency,
            "category": self.category,
            "line_items": self.line_items,
            "lines": [vars(l) for l in self.lines],
            "message": self.message,
        }


# ---------------------------------------------------------------------------
# Abstract base
# ---------------------------------------------------------------------------
class InvoiceExtractionProvider(ABC):
    @abstractmethod
    async def extract(self, file_bytes: bytes, filename: str) -> ExtractionResult:
        ...

    def name(self) -> str:
        return self.__class__.__name__


# ---------------------------------------------------------------------------
# NotConfiguredProvider — safe fallback
# ---------------------------------------------------------------------------
class NotConfiguredProvider(InvoiceExtractionProvider):
    """Default provider: makes no claims about invoice contents, ever."""

    async def extract(self, file_bytes: bytes, filename: str) -> ExtractionResult:
        return ExtractionResult(
            ok=False,
            needs_manual_review=True,
            message=(
                "No AI extraction provider is configured in this environment "
                "(set GEMINI_API_KEY in backend/.env to enable Gemini extraction). "
                "Enter the purchase lines manually from the uploaded document — "
                "it has been stored and is available for reference."
            ),
        )


# ---------------------------------------------------------------------------
# OpenAIExtractionProvider — placeholder (not implemented)
# ---------------------------------------------------------------------------
class OpenAIExtractionProvider(InvoiceExtractionProvider):
    """
    Placeholder for a real OpenAI-based extraction implementation.
    Not wired up to an actual API call — intentionally: shipping a provider
    that *claims* to extract data without a tested prompt/schema would risk
    silently-wrong purchase costs, which is worse than no extraction at all.
    """

    def __init__(self, api_key: str):
        self.api_key = api_key

    async def extract(self, file_bytes: bytes, filename: str) -> ExtractionResult:
        return ExtractionResult(
            ok=False,
            needs_manual_review=True,
            message=(
                "OPENAI_API_KEY is set, but extraction via OpenAI is not "
                "implemented yet. Use GEMINI_API_KEY for live extraction."
            ),
        )


# ---------------------------------------------------------------------------
# GeminiExtractionProvider — live multimodal extraction
# ---------------------------------------------------------------------------
_EXTRACTION_PROMPT = """You are an expert document extraction AI. Examine this receipt or invoice image and extract all available information.

Return ONLY a valid JSON object (no markdown, no code fences) with these fields:
{
  "vendor": "Supplier or store name",
  "invoice_reference": "Invoice or receipt number if visible",
  "date": "Date in YYYY-MM-DD format if visible",
  "subtotal": numeric amount before tax (null if not found),
  "tax": numeric tax/VAT amount (null if not found),
  "total": numeric total amount (null if not found),
  "currency": "3-letter currency code e.g. AED, USD, EUR (null if not found)",
  "category": "One of: Food, Transport, Utilities, Office Supplies, Technology, Professional Services, Other",
  "line_items": [
    {
      "description": "item description",
      "part_number": "part or SKU number if visible, else empty string",
      "quantity": numeric quantity (null if not visible),
      "unit_cost": numeric unit price (null if not visible),
      "amount": numeric line total (null if not visible)
    }
  ]
}

Rules:
- All numeric values must be actual numbers, not strings.
- If a field is not visible in the image, use null.
- If the image is not a receipt or invoice, set all fields to null and add a "message" field explaining this.
- Do NOT invent or guess values. Only extract what is clearly visible.
- Return ONLY the JSON object, nothing else."""


class GeminiExtractionProvider(InvoiceExtractionProvider):
    """
    Extracts structured data from receipt/invoice images using Gemini Vision.
    Supports PNG, JPEG, WEBP images.
    """

    def __init__(self, api_key: str):
        from google import genai  # lazy import
        self._client = genai.Client(api_key=api_key)
        self._model_name = GEMINI_EXTRACTION_MODEL
        logger.info(
            "[GeminiExtractionProvider] Initialised with model=%s",
            self._model_name,
        )

    def name(self) -> str:
        return f"GeminiExtractionProvider({GEMINI_EXTRACTION_MODEL})"

    async def extract(self, file_bytes: bytes, filename: str) -> ExtractionResult:
        import asyncio
        from google.genai import types as genai_types

        # Determine MIME type from filename
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        mime_map = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp"}
        mime_type = mime_map.get(ext, "image/jpeg")

        logger.info(
            "[GeminiExtractionProvider] Extracting from file=%s mime=%s size=%d bytes",
            filename,
            mime_type,
            len(file_bytes),
        )

        def _do_extract():
            image_part = genai_types.Part.from_bytes(
                data=file_bytes,
                mime_type=mime_type,
            )
            response = self._client.models.generate_content(
                model=self._model_name,
                contents=[image_part, _EXTRACTION_PROMPT],
                config=genai_types.GenerateContentConfig(
                    temperature=0.1,
                    max_output_tokens=4096,
                    # Disable extended thinking for extraction — we need a structured
                    # JSON output, not a long reasoning chain.
                    thinking_config=genai_types.ThinkingConfig(thinking_budget=0),
                ),
            )
            return response.text

        try:
            loop = asyncio.get_event_loop()
            raw_text = await loop.run_in_executor(None, _do_extract)

            logger.info("[GeminiExtractionProvider] Raw Gemini response received (%d chars)", len(raw_text))

            # Strip markdown code fences if Gemini returns them despite instructions
            cleaned = re.sub(r"```(?:json)?\s*", "", raw_text).strip().rstrip("```").strip()

            try:
                data = json.loads(cleaned)
            except json.JSONDecodeError as je:
                logger.error("[GeminiExtractionProvider] JSON parse error: %s — raw: %r", je, raw_text[:300])
                return ExtractionResult(
                    ok=False,
                    needs_manual_review=True,
                    message=f"Gemini returned a response but it could not be parsed as JSON: {je}. Please enter the data manually.",
                )

            # Build structured line items for purchase-import compatibility
            raw_lines = data.get("line_items") or []
            extracted_lines = [
                ExtractedLine(
                    part_number=li.get("part_number") or "",
                    description=li.get("description") or "",
                    quantity=float(li.get("quantity") or 0),
                    unit_cost=float(li.get("unit_cost") or 0),
                )
                for li in raw_lines
            ]

            return ExtractionResult(
                ok=True,
                needs_manual_review=False,
                supplier_name=data.get("vendor"),
                invoice_reference=data.get("invoice_reference"),
                vendor=data.get("vendor"),
                date=data.get("date"),
                subtotal=_to_float(data.get("subtotal")),
                tax=_to_float(data.get("tax")),
                total=_to_float(data.get("total")),
                currency=data.get("currency"),
                category=data.get("category"),
                line_items=raw_lines,
                lines=extracted_lines,
                message=data.get("message") or "",
            )

        except Exception as exc:
            logger.error("[GeminiExtractionProvider] API error: %s: %s", type(exc).__name__, exc)
            return ExtractionResult(
                ok=False,
                needs_manual_review=True,
                message=(
                    f"Gemini extraction failed ({type(exc).__name__}). "
                    "Please enter the purchase lines manually."
                ),
            )


def _to_float(v) -> Optional[float]:
    """Safely coerce a value to float, returning None if not convertible."""
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------
def get_extraction_provider() -> InvoiceExtractionProvider:
    """
    Returns the appropriate extraction provider.
    GeminiExtractionProvider when GEMINI_API_KEY is set; NotConfiguredProvider otherwise.
    OPENAI_API_KEY is checked as a secondary fallback (placeholder only).
    """
    if settings.GEMINI_API_KEY:
        return GeminiExtractionProvider(settings.GEMINI_API_KEY)
    if settings.OPENAI_API_KEY:
        return OpenAIExtractionProvider(settings.OPENAI_API_KEY)
    return NotConfiguredProvider()
