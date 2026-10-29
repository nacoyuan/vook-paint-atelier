# VOOK Paint Atelier

[中文说明](README.zh-CN.md) · English

A lightweight, bilingual bicycle color studio built with vanilla JavaScript and Canvas. Explore paint ideas on four photographed bicycles, sample a reference image, and export a presentation poster. No account, server, analytics, or image upload required.

## Run locally

Requires Python 3, or any static HTTP server:

```sh
python3 -m http.server 8000 --directory site
```

Open http://localhost:8000. Serve over HTTP rather than opening the HTML file directly so Canvas image access works consistently.

## Features

- English and Simplified Chinese; browser-language default and remembered manual choice.
- V9, V8 carbon wheels, ONE 3.0, and CRV, normalized to a consistent display size.
- Solid and gradient paint; independent logo color; editable hex values.
- Curated palettes and local reference-image sampling with a magnifier.
- Explicit save/restore on your device. Reference images are never saved or uploaded.
- Desktop landscape (2400 × 1600) and phone portrait (1080 × 1920) PNG posters.
- Responsive layout and keyboard-accessible controls.

Choose a bicycle → select a paint mode → choose a part and color → export. Click a painted part in the preview to select it, or use the labeled controls. Save colors before switching languages if you want to restore your design afterwards.

## Project layout

```
site/index.html   Responsive UI and styling
site/app.js       Masks, lighting, paint rendering and exports
site/i18n.js      Translation dictionary and language preferences
site/styles.css  Responsive layout and visual styles
site/*.png       Base photography, paint masks and surface maps
scripts/check.py Static integrity checks
```

The mask PNG packs frame/fork/logo coverage into color channels. Surface maps preserve tube shading and reflection. Painting happens entirely in browser memory. To add a model, supply matching 1536 × 1024 base/mask/surface assets, register them in `modelAssets` and `modelInfo`, and add a selector option. Keep mask edges aligned and test both very dark and saturated colors.

## Validation and deployment

```sh
python3 scripts/check.py
```

GitHub Actions checks source integrity. The Pages workflow publishes only `site/` on pushes to `main`; select **GitHub Actions** in repository Settings → Pages when enabling it. No build dependencies or secret keys are required. Any static host can serve the same folder.

## Limitations and asset rights

This is a color study, not a manufacturing color proof. Photos, masking approximations, displays and lighting can change perceived colors. Logos are visual approximations. Brand-inspired palettes are interpretations, not official paint specifications or endorsements.

Application code is MIT licensed. Bicycle photographs, derived raster assets, brand names and trademarks are **excluded from the MIT license**; no redistribution or commercial-use license for those assets is granted by this repository. See [ASSETS.md](ASSETS.md). Replace them with your own licensed assets when reusing the studio.

See [contribution guidelines](CONTRIBUTING.md) and [security policy](SECURITY.md).
