# mask-capital.com

Public website for MASK Capital Management, hosted on GitHub Pages.

## Editing

- Page content lives in `src/pages/*.html`; the shared header and footer are in `src/layout.html`.
- Styles: `styles.css` (brand tokens at the top). Behaviour: `script.js`.
- After editing anything in `src/`, rebuild the pages, then commit and push:

```
python build.py
git add -A
git commit -m "Describe the change"
git push
```

GitHub Pages publishes the push within about a minute.

## Notes

- Brand assets are in `assets/` (generated from the supplied logo PNG).
- The contact form posts to FormSubmit (formsubmit.co) for `contact@mask-capital.com`. The first submission triggers an activation email to that inbox that must be confirmed once.
- DNS is managed at Spaceship: four A records for `@` (185.199.108-111.153) and `www` CNAME to `karan-maskcapital.github.io`. Keep the Spacemail MX/SPF/DKIM/DMARC and Anthropic verification TXT records intact.
