# agostino-news-feed

Feed Google News automatico per Agostino Dashboard.

- `scripts/generate-news.mjs` recupera Google News in modo sequenziale e prudente.
- `.github/workflows/update-news.yml` aggiorna `news.json` ogni 5 minuti.
- `news.json` è il file pubblico letto dalla dashboard Cloudflare.
- Se Google restituisce temporaneamente errori, lo script conserva l'ultimo feed valido invece di svuotarlo.
