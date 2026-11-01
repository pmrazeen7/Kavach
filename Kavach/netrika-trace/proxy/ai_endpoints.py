"""AI endpoint registry and matching logic.

Maintains the list of AI service endpoints to monitor and
provides matching functions for the mitmproxy addon.
"""

import json
import logging
import os

logger = logging.getLogger(__name__)

# Hardcoded default AI endpoints
DEFAULT_AI_ENDPOINTS: list[dict[str, str]] = [
    {"hostname": "api.openai.com", "display_name": "OpenAI API"},
    {"hostname": "chat.openai.com", "display_name": "ChatGPT"},
    {"hostname": "api.anthropic.com", "display_name": "Anthropic API"},
    {"hostname": "generativelanguage.googleapis.com", "display_name": "Google Gemini API"},
    {"hostname": "bard.google.com", "display_name": "Google Bard"},
    {"hostname": "api.perplexity.ai", "display_name": "Perplexity API"},
    {"hostname": "api.cohere.com", "display_name": "Cohere API"},
    {"hostname": "api.mistral.ai", "display_name": "Mistral API"},
    {"hostname": "huggingface.co", "display_name": "HuggingFace"},
    {"hostname": "replicate.com", "display_name": "Replicate"},
    {"hostname": "claude.ai", "display_name": "Claude"},
    {"hostname": "gemini.google.com", "display_name": "Gemini Web"},
    {"hostname": "copilot.microsoft.com", "display_name": "Microsoft Copilot"},
    {"hostname": "api.groq.com", "display_name": "Groq API"},
    {"hostname": "together.ai", "display_name": "Together AI"},
]


class AIEndpointRegistry:
    """Registry of AI service endpoints to monitor.

    Supports loading from config.json, database, or using hardcoded defaults.
    Provides efficient hostname matching for the mitmproxy addon.
    """

    def __init__(self) -> None:
        """Initialize the endpoint registry."""
        self._endpoints: set[str] = set()
        self._display_names: dict[str, str] = {}
        self._load_endpoints()

    def _load_endpoints(self) -> None:
        """Load endpoints from config.json or database, falling back to defaults."""
        # Try config.json first
        try:
            config_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "config.json")
            with open(config_path, "r") as f:
                config = json.load(f)
            endpoints = config.get("ai_endpoints", [])
            if endpoints:
                for ep in endpoints:
                    if isinstance(ep, str):
                        self._endpoints.add(ep.lower())
                        self._display_names[ep.lower()] = ep
                    elif isinstance(ep, dict):
                        hostname = ep.get("hostname", "").lower()
                        if hostname:
                            self._endpoints.add(hostname)
                            self._display_names[hostname] = ep.get("display_name", hostname)
                logger.info(f"Loaded {len(self._endpoints)} endpoints from config.json")
                return
        except (FileNotFoundError, json.JSONDecodeError) as e:
            logger.warning(f"Config load failed: {e}")

        # Fall back to hardcoded defaults
        for ep in DEFAULT_AI_ENDPOINTS:
            hostname = ep["hostname"].lower()
            self._endpoints.add(hostname)
            self._display_names[hostname] = ep["display_name"]
        logger.info(f"Loaded {len(self._endpoints)} default AI endpoints")

    def is_ai_endpoint(self, hostname: str) -> bool:
        """Check if a hostname matches any monitored AI endpoint.

        Args:
            hostname: The hostname to check (e.g., "api.openai.com").

        Returns:
            True if the hostname matches a monitored endpoint.
        """
        hostname_lower = hostname.lower().strip()

        # Exact match
        if hostname_lower in self._endpoints:
            return True

        # Subdomain match (e.g., "chat.openai.com" matches "openai.com")
        for endpoint in self._endpoints:
            if hostname_lower.endswith("." + endpoint):
                return True
            if endpoint.endswith("." + hostname_lower):
                return True

        return False

    def get_display_name(self, hostname: str) -> str:
        """Get the display name for an endpoint hostname."""
        return self._display_names.get(hostname.lower(), hostname)

    def get_all_endpoints(self) -> list[dict[str, str]]:
        """Get all registered endpoints."""
        return [
            {"hostname": ep, "display_name": self._display_names.get(ep, ep)}
            for ep in sorted(self._endpoints)
        ]

    def add_endpoint(self, hostname: str, display_name: str = "") -> None:
        """Add a new endpoint to the registry."""
        hostname_lower = hostname.lower().strip()
        self._endpoints.add(hostname_lower)
        self._display_names[hostname_lower] = display_name or hostname
        logger.info(f"Added AI endpoint: {hostname_lower}")

    def remove_endpoint(self, hostname: str) -> None:
        """Remove an endpoint from the registry."""
        hostname_lower = hostname.lower().strip()
        self._endpoints.discard(hostname_lower)
        self._display_names.pop(hostname_lower, None)
        logger.info(f"Removed AI endpoint: {hostname_lower}")

    def reload(self) -> None:
        """Reload endpoints from config."""
        self._endpoints.clear()
        self._display_names.clear()
        self._load_endpoints()
