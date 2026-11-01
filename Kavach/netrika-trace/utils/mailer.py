import os
import smtplib
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime
from agents.state import AgentState

logger = logging.getLogger(__name__)

class EmailService:
    @staticmethod
    def send_incident_alert(state: AgentState) -> bool:
        """Send an email alert for a security incident."""
        
        # Load configuration from environment
        smtp_host = os.getenv("SMTP_HOST")
        smtp_port = int(os.getenv("SMTP_PORT", 587))
        smtp_user = os.getenv("SMTP_USER")
        smtp_pass = os.getenv("SMTP_PASS")
        admin_email = os.getenv("ADMIN_EMAIL", "admin@company.com")
        use_tls = os.getenv("SMTP_STARTTLS", "true").lower() == "true"

        if not smtp_host:
            logger.warning("[MAILER] SMTP host missing. Email alert skipped.")
            return False

        incident_id = state.get("incident_id", "unknown")
        risk_score = state.get("risk_score", 0)
        decision = state.get("decision", "ALLOW")
        user_ip = state.get("user_ip", "unknown")
        target_host = state.get("target_host", "unknown")
        intent = state.get("intent_label", "SAFE")
        entities = state.get("entities_found", [])

        subject = f"🛡️ Netrika-Trace Alert: {decision} Incident ({risk_score}/100)"
        
        # Build HTML content
        entities_html = "".join([
            f"<li><b>{e.get('type')}:</b> {e.get('count', 1)} detections</li>" 
            for e in entities
        ])
        
        html = f"""
        <html>
        <body style="font-family: sans-serif; color: #333;">
            <h2 style="color: {'#ff2d55' if decision == 'BLOCK' else '#ffb020'};">
                Security Incident Detected
            </h2>
            <p>Netrika-Trace has intercepted a sensitive request to an AI endpoint.</p>
            <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 8px; border: 1px solid #ddd;"><b>Incident ID</b></td><td style="padding: 8px; border: 1px solid #ddd;">{incident_id}</td></tr>
                <tr><td style="padding: 8px; border: 1px solid #ddd;"><b>Decision</b></td><td style="padding: 8px; border: 1px solid #ddd;">{decision}</td></tr>
                <tr><td style="padding: 8px; border: 1px solid #ddd;"><b>Risk Score</b></td><td style="padding: 8px; border: 1px solid #ddd;">{risk_score}/100</td></tr>
                <tr><td style="padding: 8px; border: 1px solid #ddd;"><b>User IP</b></td><td style="padding: 8px; border: 1px solid #ddd;">{user_ip}</td></tr>
                <tr><td style="padding: 8px; border: 1px solid #ddd;"><b>Target Host</b></td><td style="padding: 8px; border: 1px solid #ddd;">{target_host}</td></tr>
                <tr><td style="padding: 8px; border: 1px solid #ddd;"><b>Intent</b></td><td style="padding: 8px; border: 1px solid #ddd;">{intent}</td></tr>
            </table>
            
            <h3>Detected Entities</h3>
            <ul>{entities_html or "<li>None detected</li>"}</ul>
            
            <p><i>This is an automated alert. Please log in to the Netrika-Trace dashboard for full details.</i></p>
        </body>
        </html>
        """

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = smtp_user or "alerts@netrika-trace.local"
        msg["To"] = admin_email
        msg.attach(MIMEText(html, "html"))

        try:
            with smtplib.SMTP(smtp_host, smtp_port) as server:
                if use_tls:
                    server.starttls()
                
                # Only login if credentials are provided
                if smtp_user and smtp_pass:
                    server.login(smtp_user, smtp_pass)
                
                server.send_message(msg)
            logger.info(f"[MAILER] Email alert sent for incident {incident_id}")
            return True
        except Exception as e:
            logger.error(f"[MAILER] Failed to send email alert: {e}")
            return False
