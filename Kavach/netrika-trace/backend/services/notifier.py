"""Enterprise Multi-Channel Alert & Notification Service (Slack, MS Teams, Email)."""

import json
import logging
import os
import urllib.request
from typing import Any

logger = logging.getLogger(__name__)


class NotificationService:
    """Dispatches real-time security alerts to Slack, Microsoft Teams, and Email."""

    @staticmethod
    def send_slack_notification(incident_data: dict[str, Any], webhook_url: str | None = None) -> bool:
        url = webhook_url or os.getenv("SLACK_WEBHOOK_URL", "")
        if not url:
            logger.debug("Slack webhook URL not configured.")
            return False

        message = {
            "text": f"🛑 *HIGH RISK DLP VIOLATION DETECTED*\n"
                    f"*Incident ID*: `{incident_data.get('id', 'N/A')}`\n"
                    f"*Decision*: *{incident_data.get('decision', 'BLOCK')}*\n"
                    f"*Risk Score*: `{incident_data.get('risk_score', 0)}/100`\n"
                    f"*User/IP*: `{incident_data.get('user_ip', 'unknown')}`\n"
                    f"*Target*: `{incident_data.get('target_host', 'unknown')}`",
        }
        return NotificationService._post_json(url, message)

    @staticmethod
    def send_teams_notification(incident_data: dict[str, Any], webhook_url: str | None = None) -> bool:
        url = webhook_url or os.getenv("TEAMS_WEBHOOK_URL", "")
        if not url:
            logger.debug("Teams webhook URL not configured.")
            return False

        message = {
            "@type": "MessageCard",
            "@context": "http://schema.org/extensions",
            "themeColor": "DC2626",
            "summary": f"DLP Alert - {incident_data.get('decision', 'BLOCK')}",
            "sections": [{
                "activityTitle": "🛡️ Netrika-Trace Security Gateway Alert",
                "facts": [
                    {"name": "Incident ID", "value": str(incident_data.get("id", ""))},
                    {"name": "Decision", "value": str(incident_data.get("decision", ""))},
                    {"name": "Risk Score", "value": f"{incident_data.get('risk_score', 0)} / 100"},
                    {"name": "Target Host", "value": str(incident_data.get("target_host", ""))},
                ],
                "markdown": True,
            }],
        }
        return NotificationService._post_json(url, message)

    @staticmethod
    def send_all_alerts(incident_data: dict[str, Any]) -> None:
        """Dispatch incident alerts across all configured external channels."""
        NotificationService.send_slack_notification(incident_data)
        NotificationService.send_teams_notification(incident_data)

    @staticmethod
    def _post_json(url: str, payload: dict) -> bool:
        try:
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"},
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                return resp.getcode() == 200
        except Exception as e:
            logger.warning(f"Notification HTTP POST failed to {url}: {e}")
            return False
