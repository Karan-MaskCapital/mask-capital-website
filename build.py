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
NAV_KEYS = ["about", "strategies", "team", "contact"]

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
