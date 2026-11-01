"""Plotly chart builders for the Streamlit dashboard."""

import plotly.express as px
import plotly.graph_objects as go
import pandas as pd


def build_hourly_bar_chart(hourly_data: list[dict]) -> go.Figure:
    """Build a stacked bar chart of incidents by hour.

    Args:
        hourly_data: List of dicts with hour, BLOCK, WARN, ALLOW counts.

    Returns:
        Plotly Figure object.
    """
    df = pd.DataFrame(hourly_data)

    fig = go.Figure()
    fig.add_trace(go.Bar(
        x=df["hour"], y=df["BLOCK"],
        name="BLOCK", marker_color="#ff2d55",
    ))
    fig.add_trace(go.Bar(
        x=df["hour"], y=df["WARN"],
        name="WARN", marker_color="#ffb020",
    ))
    fig.add_trace(go.Bar(
        x=df["hour"], y=df["ALLOW"],
        name="ALLOW", marker_color="#00e87a",
    ))

    fig.update_layout(
        barmode="stack",
        title="Incidents by Hour (Last 24h)",
        xaxis_title="Hour",
        yaxis_title="Count",
        plot_bgcolor="#0b1017",
        paper_bgcolor="#060a0f",
        font=dict(color="#c8d8e8", family="Courier New"),
        legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="center", x=0.5),
        margin=dict(l=40, r=20, t=60, b=40),
        height=300,
    )

    return fig


def build_entity_pie_chart(entity_breakdown: dict[str, int]) -> go.Figure:
    """Build a pie chart of entity type breakdown.

    Args:
        entity_breakdown: Dict mapping entity type to count.

    Returns:
        Plotly Figure object.
    """
    if not entity_breakdown:
        entity_breakdown = {"No Data": 1}

    colors_map = {
        "AADHAAR": "#ff2d55",
        "PAN": "#ff6b8a",
        "CREDIT_CARD": "#ff4d6d",
        "SOURCE_CODE_DETECTED": "#ffb020",
        "ORG": "#2196f3",
        "PERSON": "#42a5f5",
        "EMAIL_ADDRESS": "#64b5f6",
        "PHONE_NUMBER": "#90caf9",
    }

    labels = list(entity_breakdown.keys())
    values = list(entity_breakdown.values())
    chart_colors = [colors_map.get(label, "#4a6278") for label in labels]

    fig = go.Figure(data=[go.Pie(
        labels=labels,
        values=values,
        hole=0.4,
        marker=dict(colors=chart_colors, line=dict(color="#0b1017", width=2)),
        textinfo="label+percent",
        textfont=dict(size=10, color="#c8d8e8"),
    )])

    fig.update_layout(
        title="Incident Type Breakdown",
        plot_bgcolor="#0b1017",
        paper_bgcolor="#060a0f",
        font=dict(color="#c8d8e8", family="Courier New"),
        margin=dict(l=20, r=20, t=60, b=20),
        showlegend=True,
        legend=dict(font=dict(size=9, color="#c8d8e8")),
        height=300,
    )

    return fig


def build_compliance_trend_chart(daily_data: list[dict]) -> go.Figure:
    """Build a line chart of daily blocked incidents for compliance view.

    Args:
        daily_data: List of dicts with date and count.

    Returns:
        Plotly Figure object.
    """
    if not daily_data:
        daily_data = [{"date": "No data", "count": 0}]

    df = pd.DataFrame(daily_data)

    fig = go.Figure()
    fig.add_trace(go.Scatter(
        x=df["date"], y=df["count"],
        mode="lines+markers",
        line=dict(color="#ff2d55", width=2),
        marker=dict(size=8, color="#ff2d55"),
        fill="tozeroy",
        fillcolor="rgba(255, 45, 85, 0.1)",
    ))

    fig.update_layout(
        title="Blocked Incidents — 7-Day Trend",
        xaxis_title="Date",
        yaxis_title="Count",
        plot_bgcolor="#0b1017",
        paper_bgcolor="#060a0f",
        font=dict(color="#c8d8e8", family="Courier New"),
        margin=dict(l=40, r=20, t=60, b=40),
        height=250,
    )

    return fig
