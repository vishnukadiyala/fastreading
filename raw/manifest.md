# Raw Sources Manifest

This project doesn't have separate raw source documents in the research sense
(no papers, no JSON result files, no experiment logs). The authoritative raw
sources are:

| Source | Location | Notes |
|--------|----------|-------|
| Source code | `../app.js`, `../index.html`, `../styles.css` | The whole app — three files, no build step |
| Git history | `git log` | Commit messages capture intent for each change |
| Remote | `https://github.com/vishnukadiyala/fastreading` | Public repo + GitHub Pages deploy |
| Live site | `http://vishnu.kadiyala.net/fastreading/` | Auto-deploys on push to `main` |

External documentation we depend on (cached version dates noted on each
wiki page; refetch if behavior has changed):

- pdf.js API — `https://mozilla.github.io/pdf.js/api/`
- Anthropic Messages API — `https://platform.claude.com/docs/en/api/messages`

If we ever ingest real raw documents (e.g., user feedback notes, design
mockups, papers about RSVP/bionic reading), add them here.
