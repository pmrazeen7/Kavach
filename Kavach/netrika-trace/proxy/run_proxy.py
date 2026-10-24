"""Launcher script for mitmproxy with the Netrika-Trace addon.

Starts mitmproxy in regular proxy mode on port 8080 with the
DLP interception addon loaded.
"""

import os
import sys
import logging

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=getattr(logging, os.getenv("LOG_LEVEL", "INFO")),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

logger = logging.getLogger(__name__)


def main() -> None:
    """Start mitmproxy with the Netrika-Trace addon."""
    from db.session import ensure_data_dir, init_database
    from db.crud import seed_default_endpoints

    # Initialize database
    ensure_data_dir()
    init_database()
    seed_default_endpoints()

    logger.info("Database initialized and endpoints seeded")

    proxy_port = int(os.getenv("PROXY_PORT", "8080"))

    # Import and run mitmproxy
    from mitmproxy.tools.main import mitmdump

    logger.info(f"Starting Netrika-Trace proxy on port {proxy_port}")
    logger.info("Configure your browser proxy to 127.0.0.1:{proxy_port}")

    addon_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "addon.py")

    sys.exit(
        mitmdump(
            args=[
                "--listen-port", str(proxy_port),
                "--set", "block_global=false",
                "--scripts", addon_path,
            ]
        )
    )


if __name__ == "__main__":
    main()
