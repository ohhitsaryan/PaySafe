"""
paypal_service.py – PaySafe
PayPal Sandbox REST API v2 & Disputes API integration with token caching.
"""

import logging
import os
import requests
from requests.auth import HTTPBasicAuth

logger = logging.getLogger(__name__)

PAYPAL_BASE_URL = os.getenv(
    "PAYPAL_BASE_URL", "https://api-m.sandbox.paypal.com"
)


class PayPalService:
    """
    Service client for PayPal Sandbox APIs.
    Caches bearer tokens in-memory for the lifetime of the service instance.
    """

    def __init__(self) -> None:
        self.client_id = os.getenv("PAYPAL_CLIENT_ID", "")
        self.client_secret = os.getenv("PAYPAL_CLIENT_SECRET", "")
        self._access_token: str | None = None

    def get_access_token(self) -> str:
        """
        Retrieves or returns cached OAuth2 Bearer token using client credentials.
        """
        if self._access_token:
            return self._access_token

        if not self.client_id or not self.client_secret:
            raise RuntimeError(
                "PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET must be configured."
            )

        url = f"{PAYPAL_BASE_URL}/v1/oauth2/token"
        response = requests.post(
            url,
            data={"grant_type": "client_credentials"},
            auth=HTTPBasicAuth(self.client_id, self.client_secret),
            timeout=10,
        )

        if not response.ok:
            logger.error(
                "PayPal authentication failed [%s]: %s",
                response.status_code,
                response.text,
            )
            response.raise_for_status()

        self._access_token = response.json()["access_token"]
        return self._access_token

    def create_secure_checkout(
        self, amount: float, description: str = "PaySafe Protected Checkout"
    ) -> dict:
        """
        Creates an Orders v2 checkout in PayPal Sandbox and extracts the HATEOAS
        buyer-approval URL.
        """
        token = self.get_access_token()
        url = f"{PAYPAL_BASE_URL}/v2/checkout/orders"

        payload = {
            "intent": "CAPTURE",
            "purchase_units": [
                {
                    "description": description[:127],
                    "amount": {
                        "currency_code": "USD",
                        "value": f"{amount:.2f}",
                    },
                }
            ],
            "application_context": {
                "brand_name": "PaySafe",
                "user_action": "PAY_NOW",
                "shipping_preference": "NO_SHIPPING",
                "return_url": os.getenv(
                    "PAYPAL_RETURN_URL", "http://localhost:3000/success"
                ),
                "cancel_url": os.getenv(
                    "PAYPAL_CANCEL_URL", "http://localhost:3000/cancel"
                ),
            },
        }

        response = requests.post(
            url,
            json=payload,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            timeout=15,
        )

        if not response.ok:
            logger.error(
                "PayPal order creation failed [%s]: %s",
                response.status_code,
                response.text,
            )
            response.raise_for_status()

        data = response.json()
        approve_url = next(
            (
                link["href"]
                for link in data.get("links", [])
                if link.get("rel") == "approve"
            ),
            None,
        )

        return {
            "order_id": data.get("id"),
            "approve_url": approve_url,
            "status": data.get("status"),
        }

    def file_dispute(
        self,
        transaction_id: str,
        ai_reasoning: str,
        reason: str = "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED",
    ) -> dict:
        """
        Files a customer dispute with PayPal Sandbox under /v1/customer/disputes.
        """
        token = self.get_access_token()
        url = f"{PAYPAL_BASE_URL}/v1/customer/disputes"

        payload = {
            "disputed_transaction": {
                "buyer_transaction_id": transaction_id,
            },
            "reason": reason,
            "messages": [
                {
                    "posted_by": "BUYER",
                    "content": ai_reasoning,
                }
            ],
        }

        response = requests.post(
            url,
            json=payload,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            timeout=15,
        )

        if not response.ok:
            logger.error(
                "PayPal dispute filing failed [%s]: %s",
                response.status_code,
                response.text,
            )
            response.raise_for_status()

        return response.json()
