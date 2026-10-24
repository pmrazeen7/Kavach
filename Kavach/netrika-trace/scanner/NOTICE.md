# Third-party material

* **Rule coverage.** The provider list and the shape of each token were informed by the public rule sets of
  [gitleaks](https://github.com/gitleaks/gitleaks) (MIT) and
  [detect-secrets](https://github.com/Yelp/detect-secrets) (Apache-2.0). Every regular expression in
  `rules/formats_src.py` was written for this project; none was copied verbatim.
* **TruffleHog (AGPL-3.0) was deliberately not used**, to avoid copyleft obligations.
* **Dictionary and language model.** Built by `train_lexicon.py` from text already on the machine: the
  English vocabulary that ships with the spaCy `en_core_web_sm` model (MIT), docstrings of the Python
  standard library and installed packages, README/LICENSE text under `site-packages` and `node_modules`, and
  `data/extra_words.txt` (hand-written: transliterated Hindi, Indian names and places, product names,
  business and programming vocabulary). Only word statistics are shipped, not source text.
* **Training and evaluation data are synthetic** (`synth.py`, `eval/corpus.py`). No leaked-credential dataset was
  used: training on real leaked secrets raises legal and ethical problems, and published formats are enough to
  generate realistic positives.
* **OCR** uses [tesseract.js](https://github.com/naptha/tesseract.js) (Apache-2.0) and the English model from
  `@tesseract.js-data/eng` (Apache-2.0), served locally.
