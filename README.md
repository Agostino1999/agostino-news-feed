# agostino-news-feed

Feed Google News automatico per Agostino Dashboard.

- `scripts/generate-news.mjs` recupera Google News in modo sequenziale e prudente.
- `.github/workflows/update-news.yml` aggiorna `news.json` ogni 5 minuti.
- `news.json` è il file pubblico letto dalla dashboard Cloudflare.
- Se Google restituisce temporaneamente errori, lo script conserva l'ultimo feed valido invece di svuotarlo.


## V2 — Filtri Immigrazione / Crimini & immigrazione

- Più query mirate per arresti, aggressioni, rapine e irregolari.
- Classificazione incrociata automatica: una news viene aggiunta a `Crimini & immigrazione` se contiene sia termini relativi a immigrazione/stranieri sia termini di reato/sicurezza.
- `Immigrazione` viene assegnata anche a news trovate originariamente in altre categorie quando il contenuto è chiaramente pertinente.
- Nessuna modifica all'architettura GitHub Actions → news.json → Cloudflare.
