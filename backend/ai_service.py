"""
ai_service.py – PaySafe
Async AI analysis powered by Google Gemini OpenAI-compatible API.
"""

import json
import logging
import os
from openai import AsyncOpenAI

logger = logging.getLogger(__name__)

GEMINI_BASE_URL = os.getenv(
    "GEMINI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta/openai/"
)

_client: AsyncOpenAI | None = None


def get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        api_key = os.getenv("GEMINI_API_KEY") or os.getenv("OPENAI_API_KEY", "")
        _client = AsyncOpenAI(
            api_key=api_key or "missing-key",
            base_url=GEMINI_BASE_URL,
        )
    return _client


def resolve_model_name(env_model: str | None = None) -> str:
    """
    Resolves the appropriate Gemini model name, ensuring the 'models/' prefix
    required by the Gemini OpenAI-compatible endpoint.
    """
    model = (env_model or os.getenv("OPENAI_MODEL") or "models/gemini-3.5-flash-lite").strip()
    if "1.5" in model or "2.5" in model:
        model = "models/gemini-3.5-flash-lite"
    elif not model.startswith("models/") and "gemini" in model:
        model = f"models/{model}"
    return model


SYSTEM_PROMPT = """
You are a financial fraud analyst and consumer-protection AI specializing in
e-commerce dark patterns.

Your task is to evaluate the innerText of a checkout or product page to identify:
  1. Hidden recurring subscriptions buried in terms or small print.
  2. "Too good to be true" bait pricing (e.g., $1 or $99 for high-value tech).
  3. Dark patterns (pre-ticked recurring options, fake urgency, deceptive free trials).
  4. Misleading refund or cancellation clauses.

Respond ONLY with a valid JSON object matching this schema:
{
  "risk_score": <integer from 0 to 100>,
  "is_scam": <boolean>,
  "reason": "<concise explanation of the detected threat>",
  "intercept_required": <boolean, true if risk_score > 70>
}
""".strip()


async def analyze_checkout_text(text: str) -> dict:
    """
    Analyzes checkout page text using Gemini's OpenAI-compatible endpoint.
    Truncates text to 6,000 characters and clamps risk_score between 0 and 100.
    """
    truncated = text[:6000].strip()
    if not truncated:
        return _safe_fallback("Empty or unreadable page text.")

    client = get_client()
    candidate_models = [
        resolve_model_name(),
        "models/gemini-3.5-flash-lite",
        "models/gemini-flash-latest",
        "models/gemini-3.8-flash",
    ]

    last_error = None
    for model in candidate_models:
        try:
            response = await client.chat.completions.create(
                model=model,
                temperature=0.1,
                response_format={"type": "json_object"},
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {
                        "role": "user",
                        "content": (
                            "Analyze this checkout page text and output the risk JSON:\n\n"
                            f"{truncated}"
                        ),
                    },
                ],
            )

            content = response.choices[0].message.content or "{}"
            data = json.loads(content)
            return _validate_and_coerce(data)

        except json.JSONDecodeError as exc:
            logger.error("AI returned malformed JSON on model %s: %s", model, exc)
            return _safe_fallback("Could not parse AI response JSON.")
        except Exception as exc:
            last_error = exc
            logger.warning("Model %s failed: %s. Trying next candidate...", model, exc)
            continue

    logger.error("All candidate AI models failed: %s", last_error)
    return _safe_fallback(f"Analysis service temporarily unavailable: {last_error}")


async def generate_dispute_claim(text: str) -> str:
    """
    Generates a formal legal/financial dispute claim for PayPal based on the
    page's deceptive text and dark patterns.
    """
    truncated = text[:6000].strip()
    if not truncated:
        return "Transaction conducted under deceptive terms and undisclosed recurring charges."

    client = get_client()
    model = resolve_model_name()

    dispute_prompt = (
        "You are an expert consumer protection attorney and payment dispute specialist. "
        "Review the merchant checkout text and formulate a concise, formal dispute claim "
        "for PayPal on behalf of PaySafe protection. Highlight misleading pricing, undisclosed "
        "recurring billing, or deceptive trade practices. Keep it objective, authoritative, "
        "and between 100-200 words."
    )

    try:
        response = await client.chat.completions.create(
            model=model,
            temperature=0.2,
            messages=[
                {"role": "system", "content": dispute_prompt},
                {
                    "role": "user",
                    "content": f"Merchant checkout text:\n\n{truncated}",
                },
            ],
        )
        return (response.choices[0].message.content or "").strip()
    except Exception as exc:
        logger.warning("AI dispute generation fallback: %s", exc)
        return (
            "Formal Dispute: The merchant engaged in deceptive practices and dark patterns. "
            "PaySafe detected hidden recurring subscription clauses, undisclosed billing terms, "
            "and material misrepresentation of pricing at checkout."
        )


def _validate_and_coerce(data: dict) -> dict:
    risk_score = int(data.get("risk_score", 0))
    risk_score = max(0, min(100, risk_score))
    return {
        "risk_score": risk_score,
        "is_scam": bool(data.get("is_scam", False)),
        "reason": str(data.get("reason", "No significant risk detected.")),
        "intercept_required": risk_score > 70,
    }


def _safe_fallback(reason: str) -> dict:
    return {
        "risk_score": 0,
        "is_scam": False,
        "reason": reason,
        "intercept_required": False,
    }
