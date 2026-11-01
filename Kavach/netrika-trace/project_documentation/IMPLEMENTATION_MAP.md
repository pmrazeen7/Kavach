# Implementation Map: Kavach (Netrika-Trace)

A concise map from feature to source files, functions, APIs and database tables. Paths are relative to `netrika-trace/`. Status tags are defined in `PROJECT_DOCUMENTATION.md` section 1.1.

## 1. Feature map

| # | Feature | Entry point | Key files and functions | API / channel | DB tables touched | Status |
|---|---|---|---|---|---|---|
| 1 | Network proxy | `proxy/run_proxy.py` (mitmdump) | `proxy/addon.py`: `NetrikaTraceAddon.request`, `_extract_payload`, `_extract_text_from_json`, `response`, `_mask_model_output`; `proxy/ai_endpoints.py`: `AIEndpointRegistry` | HTTP(S) proxy :8080; 302 to `/incident/{id}` | via pipeline | Implemented; live TLS unverified |
| 2 | Browser extension | `extension/manifest.json` | `injected_script.js` (hooks, `showScanningUI`), `content.js` (`showScanning`, `showInterventionDialog`), `pdf_extract.js`, `background.js` (`registerDevice`, `fetchPolicy`, `connectWebSocket`, `ANALYZE_API`), `paste_guard.js`, `kavach-scanner.js` | `/api/v1/analyze`, `/api/v1/auth/register-device`, `/api/v1/policies/extension-sync`, `ws /ws/policy-sync` | devices | Implemented; real sites unverified |
| 3 | Pipeline orchestration | `agents/graph.py::run_pipeline` | `build_graph`, `agents/state.py::AgentState` | in-process | none | Implemented |
| 4 | Sniffer | `agents/sniffer_node.py::sniffer_node` | UUID, SHA-256, trim to 50,000, empty preview | in-process | none | Implemented |
| 5 | PII detection | `agents/forensic_node.py::_run_pii_detection` | `pii/presidio_analyzer.py`: `PresidioAnalyzerWrapper.analyze`, `_regex_analyze`, `compute_pii_score`, `get_entity_summary` | in-process | entity_detections | Implemented |
| 6 | NER | `_run_ner_extraction` | `pii/spacy_ner.py::SpacyNERExtractor` (score always 0.0) | in-process | entity_detections (source NER) | Implemented (audit only) |
| 7 | Code and secrets | `_run_code_detection` | `agents/code_detector.py::CodeDetector.analyze`, `detect_secrets`, `detect_code_patterns`, `detect_with_pygments` | in-process | entity_detections | Implemented |
| 8 | Semantic score | `forensic_node` (non-fast path) | `pii/semantic_scorer.py::SemanticScorer.compute_semantic_score`, `classify_intent` | in-process | incidents.intent_label | Partial (weight 0) |
| 9 | Risk and decision | `forensic_node`, `decision_node` | `pii/risk_calculator.py::RiskCalculator.calculate`, `get_decision`, `explain`; `agents/decision_node.py::decision_node`, `should_intervene`; `config.json` | in-process | incidents.risk_score, decision | Implemented |
| 10 | Layered scanner (server) | `agents/forensic_node.py::_run_scanner` | `scanner/service.py` (`scan_text`, `summarize`, `to_entities`, `sanitize`), `scanner/engine.py::Scanner.scan`, `normalize.py`, `rules/formats_src.py` to `formats.json`, `validators.py`, `statistical.py`, `context.py`, `fingerprints.py`, `decision.py`, `redact.py`, `files.py`, `settings.py` | `/api/v1/scanner/*` | policy_config | Implemented |
| 11 | Layered scanner (browser) | `frontend/src/scanner/` | `engine.ts`, `normalize.ts`, `statistical.ts`, `context.ts`, `validators.ts`, `worker.ts`, `client.ts`, `useComposerScan.ts`, `rewrite.ts`, `ocr.ts`, `extension-entry.ts` | Web Worker; `kavach-scanner.js` bundle | none | Implemented |
| 12 | Server gate | `backend/main.py` middleware | `backend/scanner_gate.py::scanner_gate`, `_record_block` | `/api/chat*` (401, 422) | incidents | Implemented |
| 13 | Chat sandbox | `frontend/src/pages/Chat.tsx`, `hooks/useChat.ts` | `server/intervention_server.py`: `api_chat`, `api_chat_upload_scan`, `api_chat_upload_respond`, `api_chat_upload`, `api_chat_memory_test`, `api_chat_sessions`; `agents/llm_service.py` (`chat_with_llm` mock, `extract_text_from_document`) | `/api/chat*` | incidents (via pipeline) | Implemented; reply mocked |
| 14 | Breach simulation | `agents/intervention_node.py::intervention_node` | `_generate_breach_simulation` (Ollama), `_fallback_simulation`, `_build_intervention_html`; `simulation/page_builder.py`, `breach_simulator.py`, templates | writes `data/incidents/<id>.html` | incidents.simulation_html | Implemented; Ollama unverified |
| 15 | Logging | `agents/logger_node.py::logger_node` | `database/crud.py::create_incident`, `create_entity_detection`; `_broadcast_event` (Redis) | Redis `netrika:incidents` | incidents, entity_detections | Implemented |
| 16 | Authentication and RBAC | `backend/api/auth_routes.py` | `backend/auth/security.py` (`hash_password`, `verify_password`, `create_access_token`, `decode_token`), `rbac.py` (`require_auth`, `require_permission`, `ROLE_PERMISSIONS`) | `/api/v1/auth/*` | users, devices, audit_logs, organizations | Implemented; gaps in 7.4 |
| 17 | Incidents API | `backend/api/incident_routes.py` | `api_get_incidents`, `api_get_incident_detail`, `api_mark_reviewed`, `api_get_incident_pdf`; `crud.get_recent_incidents`, `search_incidents`, `mark_incident_reviewed` | `/api/v1/incidents*` | incidents, entity_detections, audit_logs | Implemented |
| 18 | Analytics and reports | `backend/api/analytics_routes.py` | `api_get_stats`, `api_global_search`, `api_get_endpoint_stats`, `api_get_compliance`, `api_get_compliance_pdf`, `api_export_incidents_csv`; `reports/pdf_builder.py`, `reports/dpdp_template.py` | `/api/v1/analytics/*` | incidents, entity_detections, ai_endpoints | Partial (`reports/` ignored by git) |
| 19 | Policy | `backend/api/policy_routes.py` | `api_get_policy`, `api_update_policy`, `api_sync_extension_policy`; `crud.create_enterprise_policy`, `update_enterprise_policy`; `broker.broadcast_policy_update` | `/api/v1/policies*`, `ws /ws/policy-sync` | enterprise_policies, audit_logs | Partial (not consumed by pipeline) |
| 20 | Live feed | `backend/websocket/broker.py` | `websocket_feed_handler`, `websocket_policy_handler`, `broadcast_incident_event`, `broadcast_policy_update`; `frontend/src/hooks/useWebSocket.ts`, `stores/incidentStore.ts` | `ws /ws/alerts`, `/ws/live-feed`, `/ws/policy-sync` | none | Implemented |
| 21 | Evaluation | `backend/api/eval_routes.py` | `calculate_metrics`, `api_run_evaluation`, `api_get_evaluations`; `backend/services/evaluator.py` (unused) | `/api/v1/eval/*` | model_evaluations | Implemented |
| 22 | Alerts | `agents/logger_node.py` | `utils/mailer.py::EmailService.send_incident_alert`; `backend/services/notifier.py` (not called) | SMTP | policy_config | Email implemented; webhooks not wired |
| 23 | Workers | `workers/celery_app.py` | `workers/tasks.py::generate_incident_pdf_task`, `dispatch_webhook_alert_task` | Redis broker | incidents | Defined, not wired |
| 24 | Admin panel | `dashboard/app.py` | pages: War Room, Incident Detail, DPDP Compliance, Policy Config; `charts.py`, `pdf_export.py` | Streamlit :8501 | reads DB | Legacy; not exercised |
| 25 | Dashboard UI | `frontend/src/App.tsx` | pages `Dashboard`, `Incidents`, `IncidentDetail`, `Devices`, `Detection`, `Reports`, `Chat`, `Landing`, `Login`, `StyleGuide`; `components/`; `lib/api.ts` | REST + WebSocket | none | Implemented |
| 26 | Deployment | `docker-compose.yml` | services postgres, redis, backend, proxy, celery_worker, frontend | ports 5432, 6379, 8888, 8080, 3000 | all | Config only; not run |

## 2. Database model relationships

```
organizations 1--* users
organizations 1--* devices      users 1--* devices
organizations 1--* enterprise_policies
organizations 1--* incidents    users 1--* incidents    devices 1--* incidents
incidents     1--* entity_detections
audit_logs (org_id, user_id nullable)       model_evaluations (org_id nullable)
policy_config (key/value)                   ai_endpoints (hostname)
```

## 3. Pipeline state to database columns

| `AgentState` field | Stored as |
|---|---|
| `incident_id` | `incidents.id` |
| `user_ip` | `incidents.user_ip` (also a source tag) |
| `target_host`, `target_url`, `http_method` | same-named columns |
| `payload_hash`, `payload_size_bytes` | same-named columns |
| `payload_preview` | always `""` |
| `risk_score`, `decision`, `intent_label` | same-named columns |
| `entities_found` | `incidents.entities_json` (type to count) and `entity_detections` rows |
| `audit_ner_entities` | `entity_detections` rows with `detector_source = 'NER'` |
| `code_detected` | `incidents.code_detected` |
| `simulation_html` | `incidents.simulation_html` |
| `secrets_detected`, `scanner_action`, `scanner_summary`, `pii_score`, `entity_score`, `semantic_score` | not stored |
| tenant fields | **not passed**, so `org_id`, `user_id`, `device_id`, `latency_ms` stay `NULL` or `0` |

## 4. Configuration inputs

| Input | Used by |
|---|---|
| `config.json`: `block_threshold`, `warn_threshold`, `pii_weight`, `entity_weight`, `semantic_weight`, `code_detection_score_boost`, `enable_breach_simulation`, `ai_endpoints` | `decision_node`, `risk_calculator`, `intervention_node`, `proxy/ai_endpoints.py` |
| `DATABASE_URL` | `database/session.py` |
| `REDIS_URL` | `logger_node`, `intervention_server`, Celery |
| `JWT_SECRET` | `backend/auth/security.py` |
| `OLLAMA_HOST`, `OLLAMA_MODEL` | `intervention_node` |
| `SBERT_MODEL`, `SPACY_MODEL` | `semantic_scorer`, `spacy_ner` |
| `SMTP_*`, `ADMIN_EMAIL` | `utils/mailer.py` |
| `SCANNER_HMAC_KEY`, `SCANNER_KEY_PATH` | `scanner/fingerprints.py` |
| `PROXY_PORT`, `PROXY_FAIL_CLOSED` | `proxy/` |
| `INTERVENTION_PORT`, `LOG_LEVEL` | `backend/main.py` |
