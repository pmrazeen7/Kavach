import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_docs as b
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), "study_guide")
b.PARTS_DIR = os.path.join(OUT, "parts")
b.OUT_DIR = OUT
b.OUT_NAME = "STUDY_GUIDE"
b.DIAG_DIR = os.path.join(HERE, "diagrams_study")
b.TITLE = "Kavach (Netrika-Trace)"
b.SUBTITLE = "Study Guide: How It Works and the Tools Behind It"
b.DOC_KIND = "Learning guide for understanding the project and preparing for interviews"
b.FOOTER = "Kavach (Netrika-Trace) - Study Guide"
b.COVER_BLURB = "The project explained in plain language, then every tool and framework it uses: what it is, why it is here, how it works, and the interview questions that come with it."
b.COVER_NOTES = [f"Prepared {b.DATE}.", "For deeper detail (routes, schema, bugs) see PROJECT_DOCUMENTATION.pdf."]
b.MD_NOTE = "> A learning guide, not a code audit. For routes, schema and known issues see `PROJECT_DOCUMENTATION.pdf`."
b.main()
