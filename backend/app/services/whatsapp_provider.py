"""
WhatsApp receipt delivery, via an official WhatsApp Business API
provider only (e.g. Meta's Cloud API, Twilio, etc.) — never unofficial
automation or WhatsApp Web scraping.

No provider credentials exist in this environment
(WHATSAPP_PROVIDER_API_KEY is unset), so `NotConfiguredProvider` is
active by default and every send is recorded as `not_configured`
rather than pretending to have been sent.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional

import httpx

from app.core.config import settings


@dataclass
class SendResult:
    status: str  # "sent" | "failed" | "not_applicable" (used for not-configured)
    message_id: Optional[str] = None
    error: Optional[str] = None

    def to_dict(self) -> dict:
        return {"status": self.status, "message_id": self.message_id, "error": self.error}


class WhatsAppProvider(ABC):
    @abstractmethod
    async def send_receipt(self, to_number: str, customer_name: str, receipt_number: str, amount: float) -> SendResult:
        ...


class NotConfiguredProvider(WhatsAppProvider):
    async def send_receipt(self, to_number, customer_name, receipt_number, amount) -> SendResult:
        return SendResult(
            status="not_applicable",
            error=(
                "No WhatsApp Business API provider is configured "
                "(set WHATSAPP_PROVIDER_API_KEY / WHATSAPP_PROVIDER_URL / "
                "WHATSAPP_PROVIDER_FROM). The receipt was created and can be "
                "downloaded/shared manually."
            ),
        )


class GenericHttpWhatsAppProvider(WhatsAppProvider):
    """
    Minimal official-API-style sender: POSTs to WHATSAPP_PROVIDER_URL with
    a bearer token, matching the general shape of Meta's Cloud API /
    most BSPs. Field names may need adjusting to your specific provider's
    contract — this is a starting point, not a guarantee of compatibility.
    """

    def __init__(self, api_key: str, url: str, from_number: str):
        self.api_key = api_key
        self.url = url
        self.from_number = from_number

    async def send_receipt(self, to_number: str, customer_name: str, receipt_number: str, amount: float) -> SendResult:
        if not to_number:
            return SendResult(status="failed", error="Customer has no WhatsApp/phone number on file")
        body = {
            "from": self.from_number,
            "to": to_number,
            "type": "text",
            "text": {"body": f"Hi {customer_name}, your payment receipt {receipt_number} for AED {amount:.2f} has been recorded. Thank you."},
        }
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(self.url, json=body, headers={"Authorization": f"Bearer {self.api_key}"})
            if resp.status_code >= 400:
                return SendResult(status="failed", error=f"Provider returned {resp.status_code}: {resp.text[:300]}")
            data = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
            return SendResult(status="sent", message_id=data.get("id") or data.get("message_id"))
        except Exception as e:
            return SendResult(status="failed", error=str(e))


def get_whatsapp_provider() -> WhatsAppProvider:
    if settings.WHATSAPP_PROVIDER_API_KEY and settings.WHATSAPP_PROVIDER_URL:
        return GenericHttpWhatsAppProvider(settings.WHATSAPP_PROVIDER_API_KEY, settings.WHATSAPP_PROVIDER_URL, settings.WHATSAPP_PROVIDER_FROM)
    return NotConfiguredProvider()
