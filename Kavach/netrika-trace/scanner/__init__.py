"""Local, layered sensitive-data scanner. See scanner/README.md."""

from scanner.engine import Scanner, get_scanner, scan  # noqa: F401
from scanner.result import Finding, ScanResult  # noqa: F401
