# Material ELM

A Material for MkDocs derivative with a small browser entry and plain page navigation.
It provides search on first interaction, palette switching, linked content tabs, code copying,
TOC highlighting, and back-to-top controls. The search worker retains the original search engine.

## Install

Install `material-elm` from a pinned repository commit, with the imaging extra if social cards are enabled.
The repository includes compiled Python/theme assets, so consumers need no Node installation.
The Python implementation uses the `material` module. Install it in a separate environment
from upstream `mkdocs-material`, since both packages provide that module.

```yaml
theme:
  name: material-elm
  features:
    - content.code.copy
    - content.tabs.link
    - navigation.top
plugins:
  - search
  - material-elm/native
markdown_extensions:
  - pymdownx.superfences
  - pymdownx.tabbed:
      alternate_style: true
```

The native plugin creates copy controls, code IDs, table wrappers, and tab anchors during builds.
Search requires the search plugin. Clipboard access requires HTTPS or localhost.
Runtime state classes and attributes use the `md-` prefix. Site-specific header layouts are optional.
Instant navigation, annotations, previews, Mermaid, consent, and version selectors are not implemented.

## Build from source

```bash
npm ci
npm run check:build
npm run build
python3 -m pip wheel --no-deps --wheel-dir dist .
```

Keep the compiled `material/` directory committed together with source changes.
Use a fixed commit in consumer dependencies so rebuilding a site cannot silently change its theme.

## Licensing

Derived from Material for MkDocs. Upstream copyright notices and the MIT license remain intact.
The compiled assets retain their bundled icon and library licenses.
