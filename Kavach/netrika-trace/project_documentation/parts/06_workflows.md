# Part 6: Important Workflows and Diagrams

The diagrams use the real file, class and function names. Each is followed by a plain-English explanation. (Parts 2 and 3 already contain the architecture, authentication, pipeline, scanner-layer and deployment diagrams.)

## 6.1 Overall application workflow

```mermaid
flowchart TD
  A[Employee tries to send text or a file to an AI tool] --> B{Which door?}
  B -->|Browser| C[injected_script.js hooks the action]
  B -->|Any app on the network| D[addon.py request hook]
  C --> E[background.js ANALYZE_API]
  E --> F[POST /api/v1/analyze]
  D --> G[run_pipeline]
  F --> G
  G --> H{decision}
  H -->|ALLOW| I[Request continues]
  H -->|WARN| J[Warning overlay or banner<br/>user may proceed]
  H -->|BLOCK| K[Blocked overlay or 302 page<br/>request stopped]
  G --> L[Incident saved and live event sent]
  L --> M[Analyst sees it on the dashboard]
  M --> N[Reviews, adds notes, exports report]
```

**In words.** Two doors lead to one pipeline. The pipeline decides, the interceptor enforces the decision, and the logger records it, so the analyst's dashboard reflects what employees experienced.

## 6.2 Browser file upload (a major feature, step by step)

```mermaid
flowchart TD
  A[User picks or drops a file] --> B[injected_script.js<br/>change or drop handler<br/>shows scanning overlay]
  B --> C[content.js NETRIKA_SCAN_BUFFER<br/>extract text, pdf_extract.js for PDFs]
  C --> D[background.js ANALYZE_API<br/>POST /api/v1/analyze]
  D --> E[api_analyze_enterprise<br/>run_pipeline and _apply_block_policy]
  E --> F[content.js NETRIKA_VERDICT]
  F --> G{BLOCK?}
  G -->|yes| M[showInterventionDialog<br/>upload cancelled]
  G -->|no| N[markUploadAllowed<br/>upload proceeds]
```

**In words.** The page script catches the file before the browser sends it, a scanning overlay appears, the text is extracted (PDF text needs pdf.js), the backend decides, and the page script either cancels the upload or marks it allowed for a short window (about 30 seconds) so the real network call is not scanned twice. If the backend is unreachable the handler's fallback applies (the file-scan path blocks, "fail-closed").

## 6.3 Chat message through the server gate

```mermaid
flowchart TD
  A[Composer scans live in a Web Worker<br/>user presses send] --> C[POST /api/chat with Bearer token]
  C --> D[scanner_gate middleware<br/>get_current_user_from_request]
  D -->|no token| E[401 Unauthorized]
  D --> F[service.scan_text<br/>message plus last 6 user messages]
  F --> G{action}
  G -->|BLOCK| H[create_incident hash only<br/>broadcast, HTTP 422]
  G -->|REDACT or TOKENIZE| I[service.sanitize<br/>request scan_message]
  G -->|WARN or ALLOW| J[api_chat handler]
  I --> J
  J --> K[run_pipeline then chat_with_llm mock]
  K --> M[Scan the reply and mask<br/>return response with dlp block]
```

**In words.** The middleware sits in front of the handler, so no client can reach the model without being scanned. The reply is scanned too, in case the model echoes or invents data that must not leave.

## 6.4 Scanner reasoning on a bare token

```mermaid
flowchart TD
  A[Text contains xyzwudguwd<br/>with no label] --> B[Layer 0<br/>normalise and decode]
  B --> C[Layer 1<br/>no known format matches]
  C --> D[Layer 2<br/>entropy, trigram score,<br/>dictionary and shape tests]
  D --> E[Logistic regression<br/>probability it is an opaque secret]
  E --> F[Layer 3<br/>no label nearby, so no boost]
  F --> G[Layer 7<br/>balanced profile<br/>ambiguous opaque token blocks]
  G --> H[BLOCK with masked preview<br/>user can confirm if safe]
```

**In words.** There is no keyword and no format, so the decision rests on statistics: the token looks nothing like words, names or identifiers. The default profile prefers to interrupt and ask. In the project's synthetic evaluation this kind of case was caught 98.17 percent of the time; a person's own memorable password is caught far less often (84.15 percent).

## 6.5 Database interaction when an incident is logged

```mermaid
flowchart TD
  A[logger_node] --> B[ensure_data_dir<br/>init_database]
  B --> C[Build entity summary<br/>type to count only]
  C --> D[create_incident<br/>INSERT incidents]
  D --> E[create_entity_detection<br/>INSERT entity_detections per type]
  E --> F[Redis publish<br/>netrika:incidents]
  F --> G[get_policy_value<br/>enable_email_alerts]
  G -->|true and WARN or BLOCK| H[EmailService.send_incident_alert]
  G -->|false| I[Done]
  H --> I
```

**In words.** Two inserts record the event; each step is individually guarded, so a Redis or email failure never loses the database record, and a database failure never stops the user's decision from being returned.

## 6.6 Error handling and recovery

```mermaid
flowchart LR
  A[Component fails] --> B{Which one?}
  B -->|Presidio| C[Regex fallback _regex_analyze]
  B -->|spaCy| D[Keyword fallback]
  B -->|Semantic model| E[Score 0.5, neutral]
  B -->|Ollama| F[Static breach story]
  B -->|Redis| G[Warning logged, continue]
  B -->|SMTP| H[Warning logged, continue]
  B -->|Scanner engine| I[BLOCK, scanner_unavailable<br/>fail closed]
  B -->|Pipeline in proxy| J[Allow by default<br/>503 if PROXY_FAIL_CLOSED]
  B -->|Backend unreachable| K[Extension fallback<br/>file path blocks]
```

**In words.** The design principle is "degrade, do not crash" for optional features and "fail closed" for the safety-critical scanner. The proxy is the exception: by default it lets traffic through if the whole pipeline crashes, which is a deliberate availability choice that the `PROXY_FAIL_CLOSED` switch can reverse.

## 6.7 Live updates to the dashboard

```mermaid
flowchart TD
  A[api_analyze_enterprise<br/>or api_chat] --> B[broadcast_incident_event]
  B --> C[ws_feed_clients set<br/>/ws/alerts]
  C --> D[useWebSocket hook]
  D --> E[incidentStore Zustand]
  E --> F[Dashboard live feed]
  G[logger_node] --> H[Redis netrika:incidents]
  H --> I[redis_listener<br/>legacy server only]
  I --> C
```

**In words.** The primary server pushes the event itself. The Redis route exists for the legacy server and for sharing events between processes, but the primary server does not subscribe to it.

## 6.8 Policy change reaching the extension

```mermaid
flowchart TD
  A[Admin PATCH /api/v1/policies] --> B[update_enterprise_policy<br/>and log_action]
  B --> C[broadcast_policy_update]
  C --> D[/ws/policy-sync clients/]
  D --> E[background.js onmessage<br/>POLICY_UPDATE]
  E --> F[chrome.storage.local active_policy]
```

**In words.** The update is stored, audited and pushed. The extension keeps it in local storage; as noted in 3.15, the interception scripts do not currently read it.
