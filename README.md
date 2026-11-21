# Quilt Studio Tools — Quilt Binding Calculator

Pure static web application (HTML + CSS + ES Modules) designed for Cloudflare Pages, Vercel, or GitHub Pages.

## Routes
- `/` — Minimal Home page (site name + tool card)
- `/quilt-binding-calculator/` — Quilt Binding Calculator
- `/about/` — Minimal About page (with contact email placeholder)

## Analytics Configuration
Edit `config/analytics.js` to fill in your IDs when ready:
- `ga4MeasurementId` (e.g. `G-XXXXXXXXXX`)
- `clarityProjectId` (e.g. `xxxxxxxxxx`)

Both are intentionally left empty (`""`) by default.

## Verification
Run the math engine test suite:
```bash
node tests/verify_math.mjs
```
