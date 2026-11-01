import os, sys, shutil
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_docs as b
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), "architecture")
b.PARTS_DIR = os.path.join(OUT, "parts")
b.OUT_DIR = OUT
b.OUT_NAME = "ARCHITECTURE"
b.DIAG_DIR = os.path.join(OUT, "diagrams")
b.LANDSCAPE = True
b.TITLE = "Kavach (Netrika-Trace)"
b.SUBTITLE = "System Architecture"
b.DOC_KIND = "Flowcharts of every framework and package, with the workflow explained in simple words"
b.FOOTER = "Kavach (Netrika-Trace) - Architecture"
b.COVER_BLURB = "One master flowchart of all frameworks, focused diagrams for each layer, the end-to-end workflow, and a plain-language description of every package."
b.COVER_NOTES = [f"Prepared {b.DATE}.", "Diagram images are also saved as PNG files in the diagrams folder for use in slides."]
b.MD_NOTE = "> The diagram PNG files are in the `diagrams/` folder next to this file."
import arch_poster
os.makedirs(b.DIAG_DIR, exist_ok=True)
arch_poster.main(os.path.join(b.DIAG_DIR, "master_architecture.png"))
b.main()
