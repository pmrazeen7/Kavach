# syntax=docker/dockerfile:1

FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir uv
RUN --mount=type=cache,target=/root/.cache/uv \
    uv pip install --system --index-url https://download.pytorch.org/whl/cpu "torch>=2.1.0" && \
    python -c "import torch; print('torch==' + torch.__version__)" > /tmp/torch-constraints.txt && \
    uv pip install --system --constraint /tmp/torch-constraints.txt -r requirements.txt
RUN --mount=type=cache,target=/root/.cache/pip \
    python -m spacy download en_core_web_sm

COPY . .

RUN mkdir -p /app/data

EXPOSE 8080 8501 8888

CMD ["python", "proxy/run_proxy.py"]
