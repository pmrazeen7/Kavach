"""Netrika-Trace Streamlit Admin Dashboard.

Multi-page Streamlit application with 4 pages:
1. War Room — Live monitoring and incident overview
2. Incident Detail — Deep dive into individual incidents
3. DPDP Compliance Report — Weekly compliance statistics
4. Policy Config — System configuration management
"""

import json
import os
import sys
import time
from datetime import datetime, timezone

import pandas as pd
import streamlit as st

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from db.session import ensure_data_dir, init_database
from db.crud import (
    get_incident_stats,
    get_recent_incidents,
    get_hourly_breakdown,
    get_entity_type_breakdown,
    get_incident_by_id,
    get_entity_detections_for_incident,
    get_weekly_compliance_stats,
    get_all_endpoints,
    add_endpoint,
    toggle_endpoint,
    delete_endpoint,
    mark_incident_reviewed,
    seed_default_endpoints,
)
from dashboard.charts import build_hourly_bar_chart, build_entity_pie_chart, build_compliance_trend_chart
from reports.pdf_builder import IncidentPDFBuilder, CompliancePDFBuilder

# Initialize database
ensure_data_dir()
init_database()
seed_default_endpoints()

# ── Page Config ─────────────────────────────────────────────────────

st.set_page_config(
    page_title="Netrika-Trace — Admin Dashboard",
    page_icon="🛡️",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ── Custom CSS ──────────────────────────────────────────────────────

st.markdown("""
<style>
    @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;700&family=JetBrains+Mono:wght@300;400;700&display=swap');

    .stApp {
        background-color: #060a0f;
        color: #c8d8e8;
    }
    .stSidebar {
        background-color: #0b1017;
    }
    h1, h2, h3 {
        font-family: 'Rajdhani', sans-serif !important;
        color: #c8d8e8 !important;
    }
    .metric-card {
        background: #0b1017;
        border: 1px solid #1a2535;
        padding: 16px;
        border-radius: 4px;
        text-align: center;
    }
    .metric-value {
        font-family: 'Rajdhani', sans-serif;
        font-weight: 700;
        font-size: 32px;
    }
    .metric-label {
        font-size: 10px;
        color: #4a6278;
        letter-spacing: 2px;
        text-transform: uppercase;
    }
    .block-badge { color: #ff2d55; }
    .warn-badge { color: #ffb020; }
    .allow-badge { color: #00e87a; }
</style>
""", unsafe_allow_html=True)


# ── Sidebar Navigation ─────────────────────────────────────────────

st.sidebar.markdown("### 🛡️ NETRIKA·TRACE")
st.sidebar.markdown("---")
page = st.sidebar.radio(
    "NAVIGATION",
    ["🎯 War Room", "🔍 Incident Detail", "📋 DPDP Compliance", "⚙️ Policy Config"],
    label_visibility="collapsed",
)


# ── Page 1: War Room ───────────────────────────────────────────────

if page == "🎯 War Room":
    st.title("🎯 WAR ROOM")
    st.caption("Real-time monitoring dashboard")

    # Stats row
    stats = get_incident_stats()
    col1, col2, col3, col4 = st.columns(4)
    with col1:
        st.metric("📊 INTERCEPTED TODAY", stats["total"])
    with col2:
        st.metric("🛑 BLOCKED", stats["blocked"])
    with col3:
        st.metric("⚠️ WARNED", stats["warned"])
    with col4:
        st.metric("✅ ALLOWED", stats["allowed"])

    st.markdown("---")

    # Charts row
    chart_col1, chart_col2 = st.columns(2)

    with chart_col1:
        hourly = get_hourly_breakdown()
        fig = build_hourly_bar_chart(hourly)
        st.plotly_chart(fig, use_container_width=True)

    with chart_col2:
        entity_breakdown = get_entity_type_breakdown()
        fig = build_entity_pie_chart(entity_breakdown)
        st.plotly_chart(fig, use_container_width=True)

    st.markdown("---")

    # Recent incidents table
    st.subheader("RECENT INCIDENTS")
    incidents = get_recent_incidents(limit=50)

    if incidents:
        data = []
        for inc in incidents:
            decision_icon = {"BLOCK": "🛑", "WARN": "⚠️", "ALLOW": "✅"}.get(inc.decision, "❓")
            data.append({
                "ID": inc.id[:8],
                "Time": inc.timestamp.strftime("%H:%M:%S") if inc.timestamp else "",
                "Source IP": inc.user_ip,
                "Target": inc.target_host,
                "Score": inc.risk_score,
                "Decision": f"{decision_icon} {inc.decision}",
                "Intent": inc.intent_label or "-",
                "Code": "✓" if inc.code_detected else "-",
            })
        df = pd.DataFrame(data)
        st.dataframe(df, use_container_width=True, hide_index=True)
    else:
        st.info("No incidents recorded yet. The proxy is waiting for traffic.")

    # Auto-refresh
    time.sleep(5)
    st.rerun()


# ── Page 2: Incident Detail ────────────────────────────────────────

elif page == "🔍 Incident Detail":
    st.title("🔍 INCIDENT DETAIL")

    incidents = get_recent_incidents(limit=100)
    if not incidents:
        st.info("No incidents to display.")
    else:
        incident_options = {f"{inc.id[:8]}... | {inc.decision} | Score {inc.risk_score}": inc.id for inc in incidents}
        selected = st.selectbox("Select Incident", list(incident_options.keys()))
        incident_id = incident_options[selected]

        incident = get_incident_by_id(incident_id)
        if incident:
            # Metadata grid
            col1, col2, col3 = st.columns(3)
            with col1:
                st.markdown(f"**Timestamp:** {incident.timestamp}")
                st.markdown(f"**Source IP:** `{incident.user_ip}`")
                st.markdown(f"**HTTP Method:** `{incident.http_method}`")
            with col2:
                st.markdown(f"**Target:** `{incident.target_host}`")
                st.markdown(f"**Target URL:** `{incident.target_url[:80] + '...' if incident.target_url and len(incident.target_url) > 80 else incident.target_url}`")
                st.markdown(f"**Payload Size:** {incident.payload_size_bytes:,} bytes")
            with col3:
                risk_color = "#ff2d55" if incident.risk_score >= 70 else ("#ffb020" if incident.risk_score >= 30 else "#00e87a")
                st.markdown(f"**Risk Score:** <span style='color:{risk_color};font-size:28px;font-weight:bold;'>{incident.risk_score}</span>/100", unsafe_allow_html=True)
                st.markdown(f"**Decision:** {incident.decision}")
                st.markdown(f"**Intent:** {incident.intent_label}")

            # Decision banner
            banner_colors = {"BLOCK": "#ff2d55", "WARN": "#ffb020", "ALLOW": "#00e87a"}
            banner_text = {"BLOCK": "REQUEST BLOCKED — DATA LEAK PREVENTED", "WARN": "WARNING ISSUED", "ALLOW": "REQUEST ALLOWED"}
            st.markdown(
                f'<div style="background:{banner_colors.get(incident.decision, "#333")};padding:12px;text-align:center;margin:12px 0;border-radius:4px;">'
                f'<span style="color:#000;font-weight:bold;font-size:16px;letter-spacing:2px;">'
                f'{banner_text.get(incident.decision, incident.decision)}</span></div>',
                unsafe_allow_html=True,
            )

            # Entity detections
            st.subheader("Detected Entities")
            detections = get_entity_detections_for_incident(incident_id)
            if detections:
                tags_html = " ".join(
                    f'<span style="background:rgba(255,45,85,0.12);color:#ff2d55;padding:4px 12px;border-radius:4px;margin:4px;display:inline-block;font-family:monospace;font-size:12px;">'
                    f'{d.entity_type} ×{d.entity_count}</span>'
                    for d in detections
                )
                st.markdown(tags_html, unsafe_allow_html=True)
            elif incident.entities_json:
                try:
                    entities = json.loads(incident.entities_json)
                    tags_html = " ".join(
                        f'<span style="background:rgba(255,45,85,0.12);color:#ff2d55;padding:4px 12px;border-radius:4px;margin:4px;display:inline-block;font-family:monospace;">{k} ×{v}</span>'
                        for k, v in entities.items()
                    )
                    st.markdown(tags_html, unsafe_allow_html=True)
                except json.JSONDecodeError:
                    st.write("No entity data available.")

            # Breach simulation
            if incident.simulation_html:
                st.subheader("AI-Generated Breach Simulation")
                st.warning("⚠️ This simulation is AI-generated for educational purposes. No actual data was used.")
                st.markdown(f'<div style="background:#111820;border-left:3px solid #ff2d55;padding:16px;font-family:monospace;line-height:1.8;">{incident.simulation_html}</div>', unsafe_allow_html=True)

            # Actions
            st.markdown("---")
            col1, col2, col3 = st.columns(3)
            with col1:
                if st.button("📄 Download Incident PDF"):
                    builder = IncidentPDFBuilder()
                    pdf_bytes = builder.build_incident_report(incident, detections)
                    st.download_button(
                        "⬇️ Download PDF",
                        data=pdf_bytes,
                        file_name=f"incident_{incident.id[:8]}.pdf",
                        mime="application/pdf",
                    )
            with col2:
                if st.button("✅ Mark as Reviewed"):
                    mark_incident_reviewed(incident.id, "admin")
                    st.success("Incident marked as reviewed.")
                    st.rerun()
            with col3:
                st.markdown(f"**Reviewed:** {'✅ Yes' if incident.reviewed else '❌ No'}")


# ── Page 3: DPDP Compliance ────────────────────────────────────────

elif page == "📋 DPDP Compliance":
    st.title("📋 DPDP ACT COMPLIANCE REPORT")
    st.caption("Digital Personal Data Protection Act, 2023 (India)")

    # Weekly stats
    stats = get_weekly_compliance_stats()
    col1, col2, col3, col4 = st.columns(4)
    with col1:
        st.metric("🆔 Aadhaar Detections", stats.get("AADHAAR", 0))
    with col2:
        st.metric("💳 PAN Detections", stats.get("PAN", 0))
    with col3:
        st.metric("💻 Code Detections", stats.get("SOURCE_CODE", 0))
    with col4:
        st.metric("📊 Total Incidents", stats.get("total_incidents", 0))

    st.markdown("---")

    # DPDP sections
    st.subheader("Applicable DPDP Act Sections")
    from reports.dpdp_template import DPDP_SECTIONS
    for section_id, data in DPDP_SECTIONS.items():
        with st.expander(data["title"]):
            st.markdown(data["summary"])
            st.info(f"**Relevance:** {data['relevance']}")

    st.markdown("---")

    # Generate PDF
    if st.button("📄 Generate Weekly Compliance Report PDF", type="primary"):
        builder = CompliancePDFBuilder()
        pdf_bytes = builder.build_compliance_report(stats)
        st.download_button(
            "⬇️ Download Compliance PDF",
            data=pdf_bytes,
            file_name="dpdp_compliance_report.pdf",
            mime="application/pdf",
        )


# ── Page 4: Policy Config ──────────────────────────────────────────

elif page == "⚙️ Policy Config":
    st.title("⚙️ POLICY CONFIGURATION")

    # Load current config
    config_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "config.json")
    try:
        with open(config_path, "r") as f:
            config = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        config = {"block_threshold": 70, "warn_threshold": 30}

    col1, col2 = st.columns(2)

    with col1:
        st.subheader("Threshold Settings")
        block_threshold = st.slider(
            "🛑 BLOCK Threshold",
            min_value=50, max_value=100,
            value=config.get("block_threshold", 70),
            help="Requests with risk score ≥ this value are blocked",
        )
        warn_threshold = st.slider(
            "⚠️ WARN Threshold",
            min_value=10, max_value=69,
            value=min(config.get("warn_threshold", 30), 69),
            help="Requests with risk score ≥ this value receive a warning",
        )

    with col2:
        st.subheader("Feature Toggles")
        enable_code = st.toggle("💻 Source Code Detection", value=config.get("enable_code_detection", True))
        enable_secrets = st.toggle("🔑 Secrets Scanner (API keys, JWTs)", value=config.get("enable_secrets_scanner", True))
        enable_sim = st.toggle("🤖 Breach Simulation via Phi-3", value=config.get("enable_breach_simulation", True))
        enable_email = st.toggle("📧 Email Alerts", value=config.get("enable_email_alerts", False))

    st.markdown("---")

    # Save config
    if st.button("💾 Save Configuration", type="primary"):
        config["block_threshold"] = block_threshold
        config["warn_threshold"] = warn_threshold
        config["enable_code_detection"] = enable_code
        config["enable_secrets_scanner"] = enable_secrets
        config["enable_breach_simulation"] = enable_sim
        config["enable_email_alerts"] = enable_email

        with open(config_path, "w") as f:
            json.dump(config, f, indent=2)
        st.success("✅ Policy configuration saved!")

    st.markdown("---")

    # Endpoint management
    st.subheader("AI Endpoints to Monitor")
    endpoints = get_all_endpoints()

    if endpoints:
        for ep in endpoints:
            col1, col2, col3 = st.columns([3, 1, 1])
            with col1:
                st.markdown(f"`{ep.hostname}` — {ep.display_name}")
            with col2:
                if st.checkbox("Active", value=ep.is_active, key=f"ep_{ep.id}"):
                    if not ep.is_active:
                        toggle_endpoint(ep.id, True)
                else:
                    if ep.is_active:
                        toggle_endpoint(ep.id, False)
            with col3:
                if st.button("🗑️", key=f"del_{ep.id}"):
                    delete_endpoint(ep.id)
                    st.rerun()

    # Add new endpoint
    st.markdown("#### Add New Endpoint")
    new_col1, new_col2, new_col3 = st.columns([2, 2, 1])
    with new_col1:
        new_hostname = st.text_input("Hostname", placeholder="api.example.com")
    with new_col2:
        new_display = st.text_input("Display Name", placeholder="Example AI")
    with new_col3:
        if st.button("➕ Add"):
            if new_hostname:
                add_endpoint(new_hostname, new_display or new_hostname)
                st.success(f"Added {new_hostname}")
                st.rerun()
