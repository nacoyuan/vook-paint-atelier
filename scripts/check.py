"""Dependency-free source and asset checks, not a replacement for visual review."""
from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
site = root / 'site'
html = (site / 'index.html').read_text()
app = (site / 'app.js').read_text()
for asset in set(re.findall(r'[\w-]+\.png', app)):
    data = (site / asset).read_bytes()
    assert data[:8] == b'\x89PNG\r\n\x1a\n', asset
for asset in re.findall(r'(?:src|href)="([^"]+)"', html):
    assert (site / asset).is_file(), asset
ids = re.findall(r'\bid="([^"]+)"', html)
assert len(ids) == len(set(ids)), 'Duplicate HTML IDs'
assert all(f'value="{model}"' in html for model in ('v9', 'v8', 'carbon', 'crv'))
for source in (html, app, (site / 'i18n.js').read_text()):
    assert '/Users/' not in source, 'Private absolute path in source'
assert all((root / name).is_file() for name in ('LICENSE', 'ASSETS.md', 'README.md', 'README.zh-CN.md'))
print('Static checks passed: scripts, PNG references, IDs, models and documentation.')
