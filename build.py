"""Tiny static-site builder for mask-capital.com (no dependencies).

Edit content in src/pages/*.html and the shared header/footer in src/layout.html,
then run:  python build.py
The finished pages are written to the repository root, which GitHub Pages serves.

Each page file starts with metadata comments:
    <!-- title: Page title -->
    <!-- description: Meta description -->
    <!-- nav: about -->            (which nav link to highlight; optional)
"""
import re
from datetime import date
from pathlib import Path

ROOT = Path(__file__).parent
SRC = ROOT / "src"
SITE = "https://mask-capital.com"
NAV_KEYS = ["about", "strategies", "team", "tools", "contact"]

layout = (SRC / "layout.html").read_text(encoding="utf-8")
pages = sorted((SRC / "pages").glob("*.html"))
sitemap = []

for page in pages:
    raw = page.read_text(encoding="utf-8")
    meta = dict(re.findall(r"<!--\s*(\w+):\s*(.*?)\s*-->", raw[:600]))
    body = re.sub(r"\A(\s*<!--.*?-->\s*)+", "", raw, flags=re.S)
    name = page.stem
    url_path = "/" if name == "index" else f"/{name}"

    html = layout
    for key in NAV_KEYS:
        html = html.replace(f"{{{{active_{key}}}}}", ' aria-current="page"' if meta.get("nav") == key else "")
    html = (html.replace("{{title}}", meta.get("title", "MASK Capital Management"))
                .replace("{{description}}", meta.get("description", ""))
                .replace("{{canonical}}", SITE + url_path)
                .replace("{{base}}", '\n  <base href="/">' if name == "404" else "")
                .replace("{{body_class}}", meta.get("bodyclass", ""))
                .replace("{{content}}", body.strip()))
    (ROOT / f"{name}.html").write_text(html, encoding="utf-8", newline="\n")
    if name != "404":
        sitemap.append(SITE + url_path)
    print("built", f"{name}.html")

today = date.today().isoformat()
urls = "\n".join(f"  <url><loc>{u}</loc><lastmod>{today}</lastmod></url>" for u in sitemap)
(ROOT / "sitemap.xml").write_text(
    f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{urls}\n</urlset>\n',
    encoding="utf-8", newline="\n")
print("built sitemap.xml")

# Back office: stamp every local script / stylesheet with a hash of its contents, so phones and
# browsers always fetch the new file after an update instead of mixing cached and new versions.
import hashlib, re
BO = ROOT / "backoffice"
def _stamp(match):
    attr, path = match.group(1), match.group(2)
    f = (BO / path).resolve()
    if not f.is_file():
        return match.group(0)
    v = hashlib.sha1(f.read_bytes()).hexdigest()[:10]
    return f'{attr}="{path}?v={v}"'
for page in ("index.html", "portal.html"):
    p = BO / page
    html = p.read_text(encoding="utf-8")
    html = re.sub(r'(src|href)="((?!https?:|#|mailto:)[^"?]+\.(?:js|css))(?:\?v=[0-9a-f]+)?"', _stamp, html)
    p.write_text(html, encoding="utf-8", newline="\n")
    print("stamped", "backoffice/" + page)

# Back office version: one stamp for the whole portal. portal.html compares it with version.json on load
# and reloads itself when a newer version is live, so a cached page never lingers after an update.
_portal = BO / "portal.html"
_html = _portal.read_text(encoding="utf-8")
_assets = sorted(re.findall(r'(?:src|href)="([^"]+\?v=[0-9a-f]+)"', _html))
_body = re.sub(r'<meta name="bo-version" content="[^"]*">', "", _html)
_ver = hashlib.sha1(("|".join(_assets) + _body).encode("utf-8")).hexdigest()[:12]
_html = re.sub(r'<meta name="bo-version" content="[^"]*">', f'<meta name="bo-version" content="{_ver}">', _html)
_portal.write_text(_html, encoding="utf-8", newline="\n")
(BO / "version.json").write_text('{"v":"' + _ver + '"}\n', encoding="utf-8", newline="\n")
print("back office version", _ver)
