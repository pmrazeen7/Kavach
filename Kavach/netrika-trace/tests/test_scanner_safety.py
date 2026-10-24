"""Safety properties: fail closed, no raw secrets in logs, model output is masked."""

import logging
import os
import types

import pytest

os.environ.setdefault("SCANNER_HMAC_KEY", "unit-test-key")

from scanner import service
from scanner.engine import Scanner
from scanner.settings import Store

GITHUB = "ghp_" + "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8"


@pytest.fixture(autouse=True)
def in_memory_scanner(monkeypatch):
    monkeypatch.setattr(service, "_scanner", Scanner(Store()))


def addon_class(monkeypatch):
    """The addon only needs mitmproxy for type names; stub it when it is not installed."""
    import importlib
    import sys

    try:
        importlib.import_module("mitmproxy.http")
    except ImportError:
        pkg = types.ModuleType("mitmproxy")
        http = types.ModuleType("mitmproxy.http")
        http.HTTPFlow = object
        pkg.http, pkg.ctx = http, types.SimpleNamespace()
        monkeypatch.setitem(sys.modules, "mitmproxy", pkg)
        monkeypatch.setitem(sys.modules, "mitmproxy.http", http)
    from proxy.addon import NetrikaTraceAddon

    return NetrikaTraceAddon


def test_pipeline_fails_closed_when_the_scanner_breaks(monkeypatch):
    from agents import forensic_node as fn

    def boom(*a, **k):
        raise RuntimeError("scanner down")

    monkeypatch.setattr(service, "scan_text", boom)
    monkeypatch.setattr(fn, "_run_pii_detection", lambda t: (0.0, []))
    monkeypatch.setattr(fn, "_run_ner_extraction", lambda t, n: (0.0, []))
    monkeypatch.setattr(fn, "_run_code_detection", lambda t: (False, False, []))
    state = fn.forensic_node({"payload": "an innocent sentence about lunch", "incident_id": "t", "user_ip": "chat-ui", "entities_found": []})
    assert state["scanner_action"] == "BLOCK" and state["scanner_summary"]["error"] == "scanner_unavailable"

    from agents.decision_node import decision_node

    assert decision_node(state)["decision"] == "BLOCK"


def test_nothing_secret_is_ever_logged(caplog):
    caplog.set_level(logging.DEBUG)
    s = Scanner(Store())
    s.scan("my key is " + GITHUB)
    s.scan("xyzwudguwd")
    s.scan("my aadhaar is 2345 6789 0124")
    joined = "\n".join(r.getMessage() for r in caplog.records)
    for secret in (GITHUB, GITHUB[8:30], "xyzwudguwd", "2345 6789 0124"):
        assert secret not in joined


def test_pipeline_logs_never_contain_the_payload(caplog, monkeypatch):
    from agents import forensic_node as fn

    caplog.set_level(logging.DEBUG)
    monkeypatch.setattr(fn, "_run_pii_detection", lambda t: (0.0, []))
    monkeypatch.setattr(fn, "_run_ner_extraction", lambda t, n: (0.0, []))
    monkeypatch.setattr(fn, "_run_code_detection", lambda t: (False, False, []))
    fn.forensic_node({"payload": "deploy with " + GITHUB, "incident_id": "t", "user_ip": "chat-ui", "entities_found": []})
    assert GITHUB not in "\n".join(r.getMessage() for r in caplog.records)


def test_scan_summary_kept_in_pipeline_state_has_no_values():
    r = service.scan_text("deploy with " + GITHUB, deep=False)
    blob = str(service.summarize(r)) + str(service.to_entities(r))
    assert GITHUB not in blob and GITHUB[10:30] not in blob


def test_proxy_masks_secrets_in_the_models_reply(monkeypatch):
    NetrikaTraceAddon = addon_class(monkeypatch)

    body = ('{"choices":[{"message":{"content":"Sure, use ' + GITHUB + ' to log in"}}]}').encode()
    resp = types.SimpleNamespace(content=body, headers={"content-type": "application/json"})
    flow = types.SimpleNamespace(response=resp, metadata={})
    NetrikaTraceAddon._mask_model_output(flow)
    assert GITHUB.encode() not in resp.content and b"Sure, use" in resp.content
    assert flow.metadata["netrika_output_masked"] == 1

    stream = types.SimpleNamespace(content=body, headers={"content-type": "text/event-stream"})
    flow2 = types.SimpleNamespace(response=stream, metadata={})
    NetrikaTraceAddon._mask_model_output(flow2)
    assert stream.content == body  # streamed replies are a documented limitation


def test_scan_output_setting_can_turn_reply_masking_off(monkeypatch):
    NetrikaTraceAddon = addon_class(monkeypatch)

    st = service.get_store().settings()
    st.scan_output = False
    service.get_store().save_settings(st)
    body = ('{"x":"' + GITHUB + '"}').encode()
    resp = types.SimpleNamespace(content=body, headers={"content-type": "application/json"})
    NetrikaTraceAddon._mask_model_output(types.SimpleNamespace(response=resp, metadata={}))
    assert resp.content == body
