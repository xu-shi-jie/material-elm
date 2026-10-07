"""Generate accessible copy controls and table wrappers before browser rendering."""

import re
from html import escape

from mkdocs.plugins import BasePlugin

class NativePlugin(BasePlugin):
    """Prepare page markup for the native runtime."""

    def on_config(self, config):
        omitted = {"navigation.instant", "navigation.instant.preview", "navigation.instant.progress",
                   "content.code.annotate", "content.code.select", "content.tooltips",
                   "content.footnote.tooltips", "content.lazy", "search.share", "announce.dismiss"}
        unsupported = set(config["theme"].get("features") or []) & omitted
        if unsupported:
            raise ValueError("Native runtime does not implement: " + ", ".join(sorted(unsupported)))
        return config

    def on_page_content(self, html, page, config, files):
        if "content.code.copy" in (config["theme"].get("features") or []):
            counter = iter(range(1_000_000))

            def code_block(match):
                opening, content = match.groups()
                if "data-clipboard-target" in content or "no-copy" in opening:
                    return match.group()
                identifier = re.search(r'\bid="([^\"]+)"', opening)
                if identifier:
                    target_id = identifier.group(1)
                else:
                    target_id = f"__native_code_{next(counter)}"
                    opening = opening[:-1] + f' id="{target_id}">'
                target = escape(f"#{target_id} > code", quote=True)
                button = ('<nav class="md-code__nav" role="none"><button type="button" '
                          'class="md-code__button" aria-label="Copy to clipboard" '
                          f'data-clipboard-target="{target}" data-md-type="copy"></button></nav>')
                content = re.sub(r"<code(\s[^>]*)?>", lambda tag: button +
                                 tag.group()[:-1] + ' tabindex="0">', content, count=1)
                return opening + content + "</pre>"

            html = re.sub(r"(<pre\b[^>]*>)(.*?)</pre>", code_block, html, flags=re.S)
        html = re.sub(r'(<div class="tabbed-labels">)(.*?)(</div>)',
                      lambda row: row.group(1) + re.sub(
                          r'(<label[^>]*for="([^"]+)"[^>]*>)(.*?)(</label>)',
                          lambda label: label.group(1) + '<a href="#' + label.group(2) +
                          '" tabindex="-1">' + label.group(3) + '</a>' + label.group(4),
                          row.group(2), flags=re.S) + row.group(3), html, flags=re.S)
        return re.sub(r"<table\b[^>]*>.*?</table>",
                      lambda table: '<div class="md-typeset__scrollwrap"><div class="md-typeset__table">' +
                      table.group() + '</div></div>', html, flags=re.S)
