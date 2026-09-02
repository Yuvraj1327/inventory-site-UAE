"""
Provider abstraction for automated supplier availability/price checks
(the "Supplier AI Agent"). No real supplier API/browser-automation
integration exists in this environment — building one requires each
supplier's explicit authorization, which is outside what can be
verified here (see Phase 8 report).

Two providers ship:
  - NotConfiguredProvider (default): performs no check, says so plainly.
  - MockTestProvider: opt-in only, for local development/demoing the
    Control Center UI. Every result it returns is tagged
    source='mock_test' end-to-end (never 'manual' or 'api') so it can
    never be mistaken for a real supplier response, on-screen or in the
    database.

A real provider (official supplier API, or authorized/session-based
portal automation with the supplier's consent) is a self-contained
addition here — nothing else in the app needs to change.
"""
import random
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional

from app.core.config import settings


@dataclass
class CheckResult:
    ok: bool
    available_qty: Optional[float] = None
    price: Optional[float] = None
    eta: Optional[str] = None
    source: str = "not_configured"
    message: str = ""


class SupplierCheckProvider(ABC):
    @abstractmethod
    async def check(self, supplier_name: str, part_number: str) -> CheckResult:
        ...


class NotConfiguredProvider(SupplierCheckProvider):
    async def check(self, supplier_name: str, part_number: str) -> CheckResult:
        return CheckResult(
            ok=False, source="not_configured",
            message=(
                "No automated supplier-check provider is configured. Real "
                "integrations require each supplier's explicit authorization "
                "(API access or a permitted, session-based portal check) — "
                "see app/services/supplier_provider.py. Record checks "
                "manually via Supplier Monitoring in the meantime."
            ),
        )


class MockTestProvider(SupplierCheckProvider):
    """
    Deterministic-looking but clearly-fake data for exercising the AI
    Control Center UI end-to-end without a real supplier connection.
    Only used when SUPPLIER_MOCK_PROVIDER=true is explicitly set — never
    the default — and every result is tagged source='mock_test'.
    """

    async def check(self, supplier_name: str, part_number: str) -> CheckResult:
        rnd = random.Random(f"{supplier_name}:{part_number}")
        return CheckResult(
            ok=True,
            available_qty=float(rnd.randint(0, 40)),
            price=round(rnd.uniform(20, 300), 2),
            eta=rnd.choice(["Same day", "Tomorrow", "2-3 days", "1 week"]),
            source="mock_test",
            message="TEST DATA — not a real supplier response (SUPPLIER_MOCK_PROVIDER is enabled).",
        )


def get_supplier_check_provider() -> SupplierCheckProvider:
    if settings.SUPPLIER_MOCK_PROVIDER:
        return MockTestProvider()
    return NotConfiguredProvider()
