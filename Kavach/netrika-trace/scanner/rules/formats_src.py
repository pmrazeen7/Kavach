"""Source of truth for the format rule pack. Run `python -m scanner.rules.build` to
regenerate formats.json (shared with the browser engine).

Patterns are written to be valid in both Python `re` and JavaScript RegExp:
no inline flags, no named groups, no possessive quantifiers. `group` is the
capture group holding the secret value (0 = whole match).

Reference material: the public rule sets of gitleaks (MIT) and detect-secrets
(Apache-2.0) informed which providers to cover and what their token shapes look
like. Patterns here were written for this project; nothing was copied verbatim,
and TruffleHog (AGPL-3.0) was deliberately not used. See scanner/NOTICE.md.

Fields
  id        stable identifier
  name      human label shown in the UI
  cat       secret | credential_url | pii | financial | key_material
  pattern   regex source
  flags     "" or "i"
  group     capture group with the sensitive value
  conf      base confidence 0..1 when the shape alone matches
  validator optional checksum/shape validator (see validators.py)
  min_ent   optional minimum Shannon entropy of the captured value
  allow     True if a user may mark a finding of this type as safe
"""

R = []


def rule(id, name, cat, pattern, conf=0.97, flags="", group=0, validator=None, min_ent=None, allow=False):
    r = {"id": id, "name": name, "cat": cat, "pattern": pattern, "flags": flags, "group": group, "conf": conf, "allow": allow}
    if validator:
        r["validator"] = validator
    if min_ent is not None:
        r["min_ent"] = min_ent
    R.append(r)


# ── Cloud providers ───────────────────────────────────────────────
rule("aws_access_key", "AWS access key ID", "secret", r"\b(?:AKIA|ASIA|AGPA|AIDA|AROA|ANPA|ANVA|AIPA)[A-Z0-9]{16}\b", 0.98)
rule("aws_secret_key", "AWS secret access key", "secret", r"(?:aws|secret|sk)[A-Za-z0-9_\-. ]{0,24}[\"'=:\s]{1,6}([A-Za-z0-9/+=]{40})\b", 0.9, "i", 1, min_ent=4.0)
rule("gcp_api_key", "Google API key", "secret", r"\bAIza[0-9A-Za-z_\-]{35}\b", 0.97)
rule("gcp_oauth_secret", "Google OAuth client secret", "secret", r"\bGOCSPX-[A-Za-z0-9_\-]{28}\b", 0.98)
rule("gcp_oauth_access", "Google OAuth access token", "secret", r"\bya29\.[0-9A-Za-z_\-]{20,}", 0.95)
rule("gcp_oauth_refresh", "Google OAuth refresh token", "secret", r"\b1//[0-9A-Za-z_\-]{40,}", 0.9)
rule("gcp_service_account", "GCP service-account key file", "key_material", r"\\?\"type\\?\"\s*:\s*\\?\"service_account\\?\"", 0.9)
rule("azure_storage_key", "Azure storage account key", "secret", r"AccountKey=([A-Za-z0-9+/=]{86,88})", 0.98, "", 1)
rule("azure_ad_secret", "Azure AD client secret", "secret", r"\b[A-Za-z0-9_~.\-]{3}8Q~[A-Za-z0-9_~.\-]{34}\b", 0.95)
rule("azure_sas", "Azure SAS signature", "secret", r"[?&]sig=([A-Za-z0-9%]{43,})", 0.85, "", 1)
rule("azure_conn", "Azure connection string", "secret", r"DefaultEndpointsProtocol=https?;AccountName=[^;\s]+;AccountKey=[^;\s]+", 0.98)
rule("alibaba_key", "Alibaba Cloud access key", "secret", r"\bLTAI[A-Za-z0-9]{12,20}\b", 0.9)
rule("tencent_key", "Tencent Cloud secret ID", "secret", r"\bAKID[A-Za-z0-9]{32}\b", 0.92)
rule("digitalocean", "DigitalOcean token", "secret", r"\bdo[opr]_v1_[a-f0-9]{64}\b", 0.98)
rule("cloudflare_origin_ca", "Cloudflare origin CA key", "secret", r"\bv1\.0-[a-f0-9]{24}-[a-f0-9]{146}\b", 0.95)
rule("heroku_key", "Heroku API key", "secret", r"\bHRKU-[A-Za-z0-9_\-]{60}\b", 0.97)
rule("firebase_fcm", "Firebase server key", "secret", r"\bAAAA[A-Za-z0-9_\-]{7}:[A-Za-z0-9_\-]{140}\b", 0.97)

# ── Code hosting / package registries / CI ───────────────────────
rule("github_pat", "GitHub personal access token", "secret", r"\bgh[pousr]_[A-Za-z0-9]{36,255}\b", 0.99)
rule("github_fine_pat", "GitHub fine-grained token", "secret", r"\bgithub_pat_[A-Za-z0-9_]{22,}\b", 0.99)
rule("gitlab_pat", "GitLab token", "secret", r"\bgl(?:pat|rt|ptt|dt|ft|imt|agent|oas)-[A-Za-z0-9_\-]{20,}\b", 0.98)
rule("bitbucket_app", "Bitbucket app password", "secret", r"\bATBB[A-Za-z0-9_=.\-]{32,}\b", 0.9)
rule("npm_token", "npm access token", "secret", r"\bnpm_[A-Za-z0-9]{36}\b", 0.99)
rule("pypi_token", "PyPI upload token", "secret", r"\bpypi-AgEIcHlwaS5vcmc[A-Za-z0-9_\-]{50,}\b", 0.99)
rule("docker_pat", "Docker Hub token", "secret", r"\bdckr_pat_[A-Za-z0-9_\-]{27,}\b", 0.99)
rule("rubygems", "RubyGems API key", "secret", r"\brubygems_[a-f0-9]{48}\b", 0.98)
rule("nuget", "NuGet API key", "secret", r"\boy2[a-z0-9]{43}\b", 0.9)
rule("circleci", "CircleCI token", "secret", r"\bCCIPAT_[A-Za-z0-9]{22}_[a-f0-9]{40}\b", 0.97)
rule("hashicorp_vault", "HashiCorp Vault token", "secret", r"\bhv[sbr]\.[A-Za-z0-9_\-]{24,}\b", 0.96)
rule("terraform_cloud", "Terraform Cloud token", "secret", r"\b[A-Za-z0-9]{14}\.atlasv1\.[A-Za-z0-9_\-]{60,}\b", 0.98)

# ── Payments ──────────────────────────────────────────────────────
rule("stripe_secret", "Stripe secret key", "secret", r"\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{24,99}\b", 0.99)
rule("stripe_webhook", "Stripe webhook secret", "secret", r"\bwhsec_[A-Za-z0-9]{32,}\b", 0.97)
rule("square_token", "Square access token", "secret", r"\b(?:sq0atp-[A-Za-z0-9_\-]{22}|EAAA[A-Za-z0-9_\-]{60})\b", 0.95)
rule("braintree", "Braintree access token", "secret", r"\baccess_token\$(?:production|sandbox)\$[a-z0-9]{16}\$[a-f0-9]{32}\b", 0.98)
rule("razorpay", "Razorpay key", "secret", r"\brzp_(?:live|test)_[A-Za-z0-9]{14,}\b", 0.97)
rule("shopify", "Shopify token", "secret", r"\bshp(?:at|ss|ca|pa)_[a-fA-F0-9]{32}\b", 0.99)

# ── Messaging / comms ─────────────────────────────────────────────
rule("slack_token", "Slack token", "secret", r"\bxox[baprso]-[A-Za-z0-9-]{10,}\b", 0.98)
rule("slack_webhook", "Slack webhook URL", "secret", r"https://hooks\.slack\.com/(?:services|workflows)/[A-Za-z0-9/_\-]{20,}", 0.98)
rule("discord_webhook", "Discord webhook URL", "secret", r"https://(?:discord|discordapp)\.com/api/webhooks/\d+/[A-Za-z0-9_\-]{30,}", 0.98)
rule("discord_bot", "Discord bot token", "secret", r"\b[MNO][A-Za-z0-9_\-]{23,25}\.[A-Za-z0-9_\-]{6}\.[A-Za-z0-9_\-]{27,38}\b", 0.9)
rule("teams_webhook", "Microsoft Teams webhook", "secret", r"https://[a-z0-9\-]+\.webhook\.office\.com/webhookb2/[A-Za-z0-9@\-/]+", 0.97)
rule("telegram_bot", "Telegram bot token", "secret", r"\b\d{8,10}:AA[A-Za-z0-9_\-]{33}\b", 0.97)
rule("twilio_api_key", "Twilio API key", "secret", r"\bSK[0-9a-fA-F]{32}\b", 0.9)
rule("sendgrid", "SendGrid API key", "secret", r"\bSG\.[A-Za-z0-9_\-]{22}\.[A-Za-z0-9_\-]{43}\b", 0.99)
rule("mailgun", "Mailgun API key", "secret", r"\bkey-[0-9a-f]{32}\b", 0.9)
rule("mailchimp", "Mailchimp API key", "secret", r"\b[0-9a-f]{32}-us\d{1,2}\b", 0.95)

# ── AI / ML providers ─────────────────────────────────────────────
rule("anthropic", "Anthropic API key", "secret", r"\bsk-ant-(?:api|admin)\d{2}-[A-Za-z0-9_\-]{40,}", 0.99)
rule("openai_proj", "OpenAI API key", "secret", r"\bsk-(?:proj|svcacct|admin)-[A-Za-z0-9_\-]{20,}", 0.99)
rule("openai_legacy", "OpenAI API key (legacy)", "secret", r"\bsk-[A-Za-z0-9]{32,64}\b", 0.9, min_ent=3.8)
rule("huggingface", "Hugging Face token", "secret", r"\bhf_[A-Za-z0-9]{34}\b", 0.98)
rule("groq", "Groq API key", "secret", r"\bgsk_[A-Za-z0-9]{52}\b", 0.99)
rule("replicate", "Replicate API token", "secret", r"\br8_[A-Za-z0-9]{37}\b", 0.98)
rule("perplexity", "Perplexity API key", "secret", r"\bpplx-[A-Za-z0-9]{48}\b", 0.99)
rule("xai", "xAI API key", "secret", r"\bxai-[A-Za-z0-9]{80}\b", 0.98)

# ── SaaS / observability ──────────────────────────────────────────
rule("newrelic", "New Relic key", "secret", r"\bNRAK-[A-Z0-9]{27}\b", 0.98)
rule("sentry_dsn", "Sentry DSN", "secret", r"https://[a-f0-9]{32}@[a-z0-9.\-]+/\d+", 0.9)
rule("linear", "Linear API key", "secret", r"\blin_api_[A-Za-z0-9]{40}\b", 0.99)
rule("notion", "Notion token", "secret", r"\b(?:secret_[A-Za-z0-9]{43}|ntn_[A-Za-z0-9]{40,})\b", 0.97)
rule("postman", "Postman API key", "secret", r"\bPMAK-[a-f0-9]{24}-[a-f0-9]{34}\b", 0.99)
rule("atlassian", "Atlassian API token", "secret", r"\bATATT3[A-Za-z0-9_\-=]{150,}", 0.98)
rule("mapbox_secret", "Mapbox secret token", "secret", r"\bsk\.eyJ[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{20,}", 0.97)
rule("facebook", "Facebook access token", "secret", r"\bEAA[A-Za-z0-9]{80,}\b", 0.85)
rule("twitter_bearer", "Twitter/X bearer token", "secret", r"\bAAAAAAAAAAAAAAAAAAAAA[A-Za-z0-9%]{30,}", 0.95)
rule("age_key", "age secret key", "key_material", r"\bAGE-SECRET-KEY-1[QPZRY9X8GF2TVDW0S3JN54KHCE6MUA7L]{58}\b", 0.99)
rule("planetscale", "PlanetScale token", "secret", r"\bpscale_(?:tkn|pw|oauth)_[A-Za-z0-9_\-.]{32,}\b", 0.98)

# ── Tokens / key material / credentials in URLs ───────────────────
rule("jwt", "JSON Web Token", "secret", r"\beyJ[A-Za-z0-9_\-]{8,}\.eyJ[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]*", 0.9, validator="jwt")
rule("pem_private_key", "Private key (PEM)", "key_material", r"-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----", 0.99)
rule("ssh_private_body", "OpenSSH private key body", "key_material", r"\bb3BlbnNzaC1rZXktdjEA[A-Za-z0-9+/=]{40,}", 0.97)
rule("db_url", "Database connection string", "credential_url", r"\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis|rediss|amqps?|mssql|sqlserver)://[^\s:@/]+:[^\s@/]+@[^\s/]+[^\s]*", 0.98)
rule("url_creds", "URL with embedded credentials", "credential_url", r"\b[a-z][a-z0-9+.\-]*://[^\s:@/]+:([^\s@/]{3,})@[^\s/]+", 0.93, "i", 1)
rule("basic_auth", "HTTP Basic credentials", "secret", r"authorization:\s*basic\s+([A-Za-z0-9+/=]{8,})", 0.95, "i", 1)
rule("bearer", "Bearer token", "secret", r"\bbearer\s+([A-Za-z0-9_\-.~+/]{16,}=*)", 0.85, "i", 1, min_ent=3.0)
rule("sql_password", "Password in connection string", "secret", r"\b(?:pwd|password)=([^;\s]{4,})(?:;|\s|$)", 0.85, "i", 1)
rule("eth_private_key", "Ethereum/crypto private key", "key_material", r"\b0x[a-fA-F0-9]{64}\b", 0.7, min_ent=3.0, allow=True)

# ── PII / financial IDs (validated) ───────────────────────────────
rule("aadhaar", "Aadhaar number", "pii", r"(?<![\d])[2-9]\d{3}[ \-]?\d{4}[ \-]?\d{4}(?![\d])", 0.95, validator="verhoeff", allow=True)
rule("pan", "PAN (India)", "pii", r"\b[A-Z]{5}[0-9]{4}[A-Z]\b", 0.92, validator="pan", allow=True)
rule("gstin", "GSTIN", "financial", r"\b\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b", 0.95, validator="gstin", allow=True)
rule("ifsc", "IFSC code", "financial", r"\b[A-Z]{4}0[A-Z0-9]{6}\b", 0.7, validator="ifsc", allow=True)
rule("card", "Payment card number", "financial", r"(?<![\d.\-])(?:\d{4}[ \-]\d{4}[ \-]\d{4}[ \-]\d{1,7}|\d{4}[ \-]\d{6}[ \-]\d{5}|\d{13,19})(?![\d.\-]?\d)", 0.95, validator="luhn", allow=True)
rule("iban", "IBAN", "financial", r"\b[A-Z]{2}\d{2}[ ]?(?:[A-Z0-9]{4}[ ]?){2,7}[A-Z0-9]{1,4}\b", 0.93, validator="iban", allow=True)
rule("ssn", "US Social Security number", "pii", r"(?<![\d])\d{3}-\d{2}-\d{4}(?![\d])", 0.9, validator="ssn", allow=True)
rule("passport_in", "Indian passport number", "pii", r"\b[A-PR-WY][1-9]\d{6}\b", 0.55, validator="passport_in", allow=True)
rule("phone_in", "Indian mobile number", "pii", r"(?<![\d])(?:\+91[\- ]?|0)?[6-9]\d{9}(?![\d])", 0.75, allow=True)
rule("phone_intl", "International phone number", "pii", r"(?<![\d])\+(?!91)[1-9]\d{0,2}[ \-]?\(?\d{2,4}\)?[ \-]?\d{3,4}[ \-]?\d{3,4}(?![\d])", 0.6, allow=True)
rule("email", "Email address", "pii", r"\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b", 0.85, allow=True)
rule("ipv4_private", "Internal IP address", "business", r"\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b", 0.6, validator="ipv4", allow=True)
