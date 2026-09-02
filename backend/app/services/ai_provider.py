"""
Provider abstraction for AI-based invoice/document extraction (Phase 4).

No AI provider is wired up in this environment (the old Emergent LLM
integration was removed in Phase 1 and not replaced). This module
defines the interface any real provider must satisfy, plus a
`NotConfiguredProvider` that always returns a clear "needs manual
review" result rather than inventing data. Swap in a real provider by
setting OPENAI_API_KEY (or extending this file) — no caller code needs
to change.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional

from app.core.config import settings


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
    lines: list[ExtractedLine] = field(default_factory=list)
    message: str = ""

    def to_dict(self) -> dict:
        return {
            "ok": self.ok,
            "needs_manual_review": self.needs_manual_review,
            "supplier_name": self.supplier_name,
            "invoice_reference": self.invoice_reference,
            "lines": [vars(l) for l in self.lines],
            "message": self.message,
        }


class InvoiceExtractionProvider(ABC):
    @abstractmethod
    async def extract(self, file_bytes: bytes, filename: str) -> ExtractionResult:
        ...


class NotConfiguredProvider(InvoiceExtractionProvider):
    """Default provider: makes no claims about invoice contents, ever."""

    async def extract(self, file_bytes: bytes, filename: str) -> ExtractionResult:
        return ExtractionResult(
            ok=False,
            needs_manual_review=True,
            message=(
                "No AI extraction provider is configured in this environment "
                "(set OPENAI_API_KEY, or wire up a different provider in "
                "app/services/ai_provider.py). Enter the purchase lines "
                "manually from the uploaded document — it has been stored "
                "and is available for reference."
            ),
        )


class OpenAIExtractionProvider(InvoiceExtractionProvider):
    """
    Placeholder for a real OpenAI-based extraction implementation. Not
    wired up to an actual API call yet — intentionally: shipping a
    provider that *claims* to extract data without a tested prompt/schema
    would risk silently-wrong purchase costs, which is worse than no
    extraction at all. Implement `extract()` here when a provider and
    extraction schema have been decided (Phase 4 follow-up / Phase 8).
    """

    def __init__(self, api_key: str):
        self.api_key = api_key

    async def extract(self, file_bytes: bytes, filename: str) -> ExtractionResult:
        return ExtractionResult(
            ok=False,
            needs_manual_review=True,
            message=(
                "OPENAI_API_KEY is set, but the extraction call itself is not "
                "implemented yet in this environment. Enter the purchase "
                "lines manually — the uploaded document is stored for reference."
            ),
        )


def get_extraction_provider() -> InvoiceExtractionProvider:
    if settings.OPENAI_API_KEY:
        return OpenAIExtractionProvider(settings.OPENAI_API_KEY)
    return NotConfiguredProvider()
