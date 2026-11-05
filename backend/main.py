"""
main.py – PaySafe FastAPI Application
"""

import logging
import os
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import uvicorn

from ai_service import analyze_checkout_text, generate_dispute_claim
from paypal_service import PayPalService

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s – %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="PaySafe API",
    description="Backend service for detecting e-commerce traps, hidden subscriptions, and automating PayPal disputes with PaySafe protection",
    version="1.1.0",
)

# Allow CORS for Chrome Extension origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Request & Response Schemas
# ---------------------------------------------------------------------------
class AnalyzeRequest(BaseModel):
    page_text: str = Field(..., min_length=1, description="Raw innerText from page")
    cart_total: float = Field(default=0.0, ge=0.0, description="Scraped cart total USD")


class AnalyzeResponse(BaseModel):
    risk_score: int
    is_scam: bool
    reason: str
    intercept_required: bool
    paypal_url: str | None = None
    paypal_order_id: str | None = None


class DisputeRequest(BaseModel):
    transaction_id: str = Field(..., min_length=1, description="PayPal transaction or capture ID")
    page_text: str = Field(..., min_length=1, description="Original checkout / merchant page text")
    reason_code: str = Field(
        default="MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED",
        description="PayPal dispute reason code",
    )


class DisputeResponse(BaseModel):
    success: bool
    dispute_id: str | None = None
    status: str | None = None
    ai_claim: str
    message: str


# ---------------------------------------------------------------------------
# Core Endpoints (with explicit /api prefix & aliases to eliminate 404s)
# ---------------------------------------------------------------------------
@app.get("/api/health", tags=["Health"])
@app.get("/health", include_in_schema=False)
@app.get("/", include_in_schema=False)
async def health_check():
    """Liveness health check probe."""
    return {"status": "ok", "service": "PaySafe"}


@app.post("/api/analyze", response_model=AnalyzeResponse, tags=["Analysis"])
@app.post("/analyze", response_model=AnalyzeResponse, include_in_schema=False)
async def analyze(payload: AnalyzeRequest):
    """
    Evaluates page text with Gemini for dark patterns, traps, and hidden subscriptions.
    If high-risk, generates a protected PayPal sandbox checkout URL.
    """
    logger.info("[PaySafe] Analyze request received | Cart Total: $%.2f | Text Length: %d", payload.cart_total, len(payload.page_text))

    assessment = await analyze_checkout_text(payload.page_text)
    paypal_url = None
    paypal_order_id = None

    if assessment.get("intercept_required"):
        try:
            svc = PayPalService()
            charge_amount = max(payload.cart_total, 1.0)
            checkout = svc.create_secure_checkout(
                amount=charge_amount,
                description="PaySafe Protected Checkout",
            )
            paypal_url = checkout.get("approve_url")
            paypal_order_id = checkout.get("order_id")
            logger.info("[PaySafe] Created secure PayPal checkout: %s -> %s", paypal_order_id, paypal_url)
        except Exception as exc:
            logger.warning("[PaySafe] PayPal checkout creation error: %s", exc)
            assessment["reason"] += " (PayPal link unavailable - verify Sandbox credentials)"

    return AnalyzeResponse(
        risk_score=assessment["risk_score"],
        is_scam=assessment["is_scam"],
        reason=assessment["reason"],
        intercept_required=assessment["intercept_required"],
        paypal_url=paypal_url,
        paypal_order_id=paypal_order_id,
    )


@app.post("/api/dispute", response_model=DisputeResponse, tags=["Disputes"])
@app.post("/dispute", response_model=DisputeResponse, include_in_schema=False)
async def dispute(payload: DisputeRequest):
    """
    Synthesizes an authoritative dispute claim from deceptive site text
    and files the dispute via PayPal's Disputes API.
    """
    logger.info("[PaySafe] Dispute requested for transaction: %s", payload.transaction_id)

    ai_claim = await generate_dispute_claim(payload.page_text)

    try:
        svc = PayPalService()
        result = svc.file_dispute(
            transaction_id=payload.transaction_id,
            ai_reasoning=ai_claim,
            reason=payload.reason_code,
        )
        dispute_id = result.get("dispute_id") or result.get("id")
        return DisputeResponse(
            success=True,
            dispute_id=dispute_id,
            status=result.get("status", "SUBMITTED"),
            ai_claim=ai_claim,
            message="PayPal dispute filed successfully via PaySafe.",
        )
    except Exception as exc:
        logger.error("[PaySafe] Failed to submit PayPal dispute: %s", exc)
        raise HTTPException(
            status_code=502,
            detail=f"Failed to submit PayPal dispute: {str(exc)}",
        )


if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
