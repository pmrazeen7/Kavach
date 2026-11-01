#!/usr/bin/env bash
# Netrika-Trace Setup Script
# Installs dependencies, downloads models, and initializes the database.
set -e

echo "============================================"
echo "  NETRIKA-TRACE — Setup Script"
echo "============================================"
echo ""

# ── 1. Install mitmproxy CA Certificate ────────────────────────────
echo "[1/6] Installing mitmproxy CA certificate..."

if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Ubuntu/Debian
    if command -v update-ca-certificates &> /dev/null; then
        MITM_CERT="$HOME/.mitmproxy/mitmproxy-ca-cert.pem"
        if [ -f "$MITM_CERT" ]; then
            sudo cp "$MITM_CERT" /usr/local/share/ca-certificates/mitmproxy-ca.crt
            sudo update-ca-certificates
            echo "  ✓ CA cert installed (Linux)"
        else
            echo "  ⚠ mitmproxy CA cert not found. Run 'mitmproxy' once to generate it."
            echo "    Then re-run this script."
        fi
    fi
elif [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    MITM_CERT="$HOME/.mitmproxy/mitmproxy-ca-cert.pem"
    if [ -f "$MITM_CERT" ]; then
        sudo security add-trusted-cert -d -p ssl \
            -k /Library/Keychains/System.keychain "$MITM_CERT"
        echo "  ✓ CA cert installed (macOS)"
    else
        echo "  ⚠ mitmproxy CA cert not found. Run 'mitmproxy' once first."
    fi
else
    echo "  ⚠ Unsupported OS for automatic cert install."
    echo "    Please install the mitmproxy CA cert manually."
fi

# ── 2. Install SpaCy Model ─────────────────────────────────────────
echo ""
echo "[2/6] Downloading SpaCy model (en_core_web_trf)..."
python -m spacy download en_core_web_trf || {
    echo "  ⚠ en_core_web_trf failed, falling back to en_core_web_sm..."
    python -m spacy download en_core_web_sm
}
echo "  ✓ SpaCy model installed"

# ── 3. Pull Phi-3 via Ollama ───────────────────────────────────────
echo ""
echo "[3/6] Pulling Phi-3 model via Ollama..."
if command -v ollama &> /dev/null; then
    ollama pull phi3:mini
    echo "  ✓ Phi-3 model pulled"
else
    echo "  ⚠ Ollama not installed. Install from https://ollama.ai"
    echo "    Then run: ollama pull phi3:mini"
fi

# ── 4. Download sentence-transformers model ────────────────────────
echo ""
echo "[4/6] Downloading sentence-transformers model..."
python -c "
from sentence_transformers import SentenceTransformer
model = SentenceTransformer('all-MiniLM-L6-v2')
print('  ✓ Model downloaded and cached')
" || echo "  ⚠ Failed to download model. Will download on first use."

# ── 5. Initialize SQLite Database ──────────────────────────────────
echo ""
echo "[5/6] Initializing SQLite database..."
mkdir -p data
python -c "
import sys
sys.path.insert(0, '.')
from db.session import ensure_data_dir, init_database
from db.crud import seed_default_endpoints
ensure_data_dir()
init_database()
seed_default_endpoints()
print('  ✓ Database initialized with default endpoints')
"

# ── 6. Copy .env if needed ─────────────────────────────────────────
echo ""
echo "[6/6] Environment setup..."
if [ ! -f .env ]; then
    cp .env.example .env
    echo "  ✓ Created .env from .env.example"
else
    echo "  ✓ .env already exists"
fi

# ── Done ───────────────────────────────────────────────────────────
echo ""
echo "============================================"
echo "  ✅ SETUP COMPLETE"
echo "============================================"
echo ""
echo "To start the proxy:"
echo "  python proxy/run_proxy.py"
echo ""
echo "To start the dashboard:"
echo "  streamlit run dashboard/app.py"
echo ""
echo "To start the intervention server:"
echo "  python server/intervention_server.py"
echo ""
echo "Or use Docker Compose:"
echo "  docker-compose up -d"
echo ""
echo "Browser proxy settings:"
echo "  HTTP Proxy:  127.0.0.1:8080"
echo "  HTTPS Proxy: 127.0.0.1:8080"
echo ""
echo "Install the mitmproxy CA cert in your browser:"
echo "  Visit http://mitm.it after setting the proxy"
echo ""
