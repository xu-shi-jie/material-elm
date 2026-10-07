/*
 * Copyright (c) 2016-2025 Martin Donath <martin.donath@squidfunk.com>
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to
 * deal in the Software without restriction, including without limitation the
 * rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
 * sell copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NON-INFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
 * IN THE SOFTWARE.
 */

/** Native page controls. Search remains in its on-demand worker. */
interface SearchDocument {
  location: string
  title: string
  text: string
  terms: Record<string, boolean>
}
interface SearchResult {
  items: SearchDocument[][]
  suggest?: string[]
}
const settings = JSON.parse(document.getElementById("__config")!.textContent!) as {
  base: string
  search: string
  translations: Record<string, string>
}
const base = new URL(`${settings.base}/`, location.href)
const select = <T extends HTMLElement = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector)!
const all = <T extends HTMLElement = HTMLElement>(selector: string) =>
  Array.from(document.querySelectorAll<T>(selector))
const drawer = select<HTMLInputElement>("#__drawer")
const searchToggle = select<HTMLInputElement>("#__search")
const query = select<HTMLInputElement>("[data-md-component=search-query]")
const search = select(".md-search")
const list = select(".md-search-result__list")
const meta = select(".md-search-result__meta")
const suggest = select("[data-md-component=search-suggest]")
let worker: Worker | undefined
let ready = false
let busy = false
let sent = ""
let timer = 0
let priorFocus: HTMLElement | undefined
const copiedTimers = new WeakMap<Element, number>()

/** Keep the latest query after asynchronous index setup and sequential worker messages. */
function sendQuery(): void {
  if (!ready || busy)
    return
  busy = true
  sent = query.value.trim()
  worker!.postMessage({ type: 2, data: sent })
}

/**
 * Use only the worker's trusted, locally generated snippets as result markup.
 * @param doc - Search document
 * @returns Search result link
 * @param parent - Whether this is the page title
 */
function resultLink(doc: SearchDocument, parent: boolean): HTMLAnchorElement {
  const link = document.createElement("a")
  const url = new URL(doc.location, base)
  const terms = Object.keys(doc.terms).filter(term => doc.terms[term])
  if (terms.length)
    url.searchParams.set("h", terms.join(" "))
  link.href = url.href
  link.className = "md-search-result__link"
  const article = document.createElement("article")
  article.className = "md-search-result__article md-typeset"
  if (parent) {
    const icon = document.createElement("div")
    icon.className = "md-search-result__icon md-icon"
    article.append(icon)
  }
  const title = document.createElement(parent ? "h1" : "h2")
  title.innerHTML = doc.title
  article.append(title)
  const snippet = document.createElement("div")
  snippet.innerHTML = doc.text
  article.append(snippet)
  link.append(article)
  return link
}

/**
 * Group matches by page and keep long section lists in native details elements.
 * @param result - Grouped search matches
 */
function renderResults(result: SearchResult): void {
  list.replaceChildren()
  const count = result.items.length
  meta.textContent = query.value.trim()
    ? count ? `${count} matching ${count === 1 ? "document" : "documents"}` : "No matching documents"
    : settings.translations["search.result.placeholder"]
  if (suggest) suggest.textContent = ""
  let offset = 0
  const more = document.createElement("button")
  more.type = "button"
  more.className = "md-search-more"
  more.textContent = "Show more results"
  const append = () => {
    more.remove()
    for (const group of result.items.slice(offset, offset + 20)) {
      const item = document.createElement("li")
      item.className = "md-search-result__item"
      const parent = group.find(doc => !doc.location.includes("#"))!
      item.append(resultLink(parent, true))
      const sections = group.filter(doc => doc !== parent)
      for (const doc of sections.slice(0, 3))
        item.append(resultLink(doc, false))
      if (sections.length > 3) {
        const details = document.createElement("details")
        details.className = "md-search-result__more"
        const summary = document.createElement("summary")
        summary.textContent = `${sections.length - 3} more on this page`
        details.append(summary, ...sections.slice(3).map(doc => resultLink(doc, false)))
        item.append(details)
      }
      list.append(item)
    }
    offset += 20
    if (offset < count)
      list.append(more)
  }
  more.addEventListener("click", append)
  append()
  const completion = result.suggest?.find(term => term.startsWith(query.value.toLowerCase()))
  if (suggest && completion && completion !== query.value.toLowerCase())
    suggest.textContent = query.value + completion.slice(query.value.length)
}

/** Fetch nothing for search until the reader uses it or opens a shared query.
 * @returns Search initialization promise
 */
async function startSearch(): Promise<void> {
  if (worker)
    return
  meta.textContent = "Preparing search…"
  worker = new Worker(new URL(settings.search, location.href))
  const failure = () => { meta.textContent = "Search could not load. Reload the page to try again." }
  worker.addEventListener("error", failure)
  worker.addEventListener("message", event => {
    const message = event.data as { type: number, data: SearchResult }
    if (message.type === 1) {
      ready = true
      sendQuery()
    } else if (message.type === 3) {
      busy = false
      if (sent === query.value.trim())
        renderResults(message.data)
      else
        sendQuery()
    }
  })
  try {
    const response = await fetch(new URL("search/search_index.json", base))
    if (!response.ok)
      throw new Error("Search index unavailable")
    const index = await response.json()
    worker.postMessage({ type: 0, data: { ...index, options: { suggest: true } } })
  } catch {
    failure()
  }
}

/** Open search without changing the page's navigation or history. */
function openSearch(): void {
  if (!searchToggle.checked)
    priorFocus = document.activeElement === query ? undefined : document.activeElement as HTMLElement
  searchToggle.checked = true
  document.documentElement.style.overflow = "hidden"
  drawer.checked = false
  query.focus()
  void startSearch()
}

/** Return keyboard focus to the control that opened the search dialog. */
function closeSearch(): void {
  searchToggle.checked = false
  document.documentElement.style.overflow = drawer.checked ? "hidden" : ""
  query.blur()
  priorFocus?.focus()
}
query.addEventListener("focus", openSearch)
query.addEventListener("input", () => {
  clearTimeout(timer)
  timer = window.setTimeout(sendQuery, 100)
})
select<HTMLFormElement>("form[name=search]").addEventListener("submit", event => {
  event.preventDefault()
  list.querySelector<HTMLAnchorElement>("a")?.click()
})
select<HTMLFormElement>("form[name=search]").addEventListener("reset", () => {
  query.value = ""
  sendQuery()
  query.focus()
})
searchToggle.addEventListener("change", () => searchToggle.checked ? openSearch() : closeSearch())
drawer.addEventListener("change", () => {
  document.documentElement.style.overflow = drawer.checked ? "hidden" : ""
})
document.addEventListener("keydown", event => {
  const active = document.activeElement as HTMLElement
  if (event.key === "Escape") {
    if (searchToggle.checked)
      closeSearch()
    drawer.checked = false
    document.documentElement.style.overflow = ""
  } else if (searchToggle.checked && ["ArrowDown", "ArrowUp"].includes(event.key)) {
    const choices = [query, ...all(".md-search-result a, .md-search-result summary, .md-search-more")]
      .filter(el => el.getClientRects().length)
    const position = Math.max(0, choices.indexOf(active))
    choices[(position + choices.length + (event.key === "ArrowDown" ? 1 : -1)) % choices.length].focus()
    event.preventDefault()
  } else if (searchToggle.checked && event.key === "ArrowRight" && active === query &&
    query.selectionStart === query.value.length && suggest?.textContent) {
    query.value = suggest.textContent
    sendQuery()
  } else if (searchToggle.checked && event.key === "Tab") {
    const choices = [query, ...all(".md-search a, .md-search button, .md-search summary")]
      .filter(el => el.tabIndex >= 0 && el.getClientRects().length)
    const position = choices.indexOf(active)
    if (event.shiftKey && position === 0 || !event.shiftKey && position === choices.length - 1) {
      choices[event.shiftKey ? choices.length - 1 : 0].focus()
      event.preventDefault()
    }
  } else if (!event.ctrlKey && !event.metaKey && !event.altKey &&
    !active.matches("input:not([type=radio]):not([type=checkbox]), textarea, select, [contenteditable]") && ["/", "s", "f"].includes(event.key)) {
    event.preventDefault()
    openSearch()
    query.select()
  } else if (event.key === "Enter" && active.matches("input[name=__palette]")) {
    const next = palettes[(palettes.indexOf(active as HTMLInputElement) + 1) % palettes.length]
    next.click()
    next.focus()
    event.preventDefault()
  } else if (event.key === "Enter" && active instanceof HTMLLabelElement) {
    active.click()
    event.preventDefault()
  }
})

/** Copy exactly the displayed command and confirm only a successful clipboard write. */
document.addEventListener("click", async event => {
  if (!(event.target instanceof Element))
    return
  const button = event.target.closest<HTMLButtonElement>("[data-clipboard-target]")
  if (!button)
    return
  const code = select(button.dataset.clipboardTarget!)
  code.setAttribute("data-md-copying", "")
  const text = code.closest("[data-copy]")?.getAttribute("data-copy") ?? code.innerText.trimEnd()
  code.removeAttribute("data-md-copying")
  try {
    await navigator.clipboard.writeText(text)
    const block = button.closest(".highlight") || button.parentElement!
    clearTimeout(copiedTimers.get(block))
    block.classList.add("is-copied")
    button.setAttribute("aria-label", "Copied to clipboard")
    if (event.detail > 0)
      button.blur()
    copiedTimers.set(block, window.setTimeout(() => {
      block.classList.remove("is-copied")
      button.setAttribute("aria-label", "Copy to clipboard")
    }, 1500))
  } catch {
    const dialog = select(".md-dialog")
    select(".md-dialog__inner").textContent = "Copy failed. Select the command and copy it manually."
    dialog.setAttribute("data-md-state", "open")
    window.setTimeout(() => dialog.removeAttribute("data-md-state"), 2500)
  }
})

/** Keep explicit palette choices across page loads; otherwise follow the system preference. */
const palettes = all<HTMLInputElement>("[data-md-color-scheme][type=radio]")

/**
 *
 * @param input - Palette radio control
 * @param persist - Whether this is an explicit user selection
 */
function applyPalette(input: HTMLInputElement, persist: boolean): void {
  input.checked = true
  for (const candidate of palettes)
    (candidate.nextElementSibling as HTMLElement).hidden = candidate !== input
  const color: Record<string, string> = {}
  for (const key of ["media", "scheme", "primary", "accent"]) {
    color[key] = input.getAttribute(`data-md-color-${key}`)!
    document.body.setAttribute(`data-md-color-${key}`, color[key])
  }
  if (persist)
    __md_set("__palette", { index: palettes.indexOf(input), color })
}
for (const input of palettes)
  input.addEventListener("change", () => applyPalette(input, true))
const dark = matchMedia("(prefers-color-scheme: dark)")
const systemPalette = () => {
  if (!__md_get("__palette"))
    applyPalette(palettes[dark.matches ? 1 : 0], false)
}
const storedPalette = __md_get<{ index: number }>("__palette")
if (storedPalette && palettes[storedPalette.index])
  applyPalette(palettes[storedPalette.index], false)
else
  systemPalette()
dark.addEventListener("change", systemPalette)

/** One tab selection updates matching labels across this page. */
function updateTabs(): void {
  for (const set of all("[data-tabs]")) {
    const input = set.querySelector<HTMLInputElement>(":scope > input:checked")!
    const label = set.querySelector<HTMLLabelElement>(`label[for="${input.id}"]`)!
    const row = label.parentElement!
    set.style.setProperty("--md-indicator-x", `${label.offsetLeft}px`)
    set.style.setProperty("--md-indicator-width", `${label.offsetWidth}px`)
    if (label.offsetLeft < row.scrollLeft || label.offsetLeft + label.offsetWidth > row.scrollLeft + row.clientWidth)
      row.scrollLeft = Math.max(0, label.offsetLeft - 16)
  }
}
document.addEventListener("click", event => {
  if (!(event.target instanceof Element))
    return
  const link = event.target.closest<HTMLAnchorElement>(".tabbed-labels a")
  if (link && !event.ctrlKey && !event.metaKey) {
    event.preventDefault()
    history.replaceState({}, "", link.hash)
    select<HTMLInputElement>(`#${link.closest<HTMLLabelElement>("label")!.htmlFor}`).click()
  }
})
document.addEventListener("change", event => {
  if (!(event.target instanceof HTMLInputElement) || !event.target.matches("[data-tabs] > input"))
    return
  const label = select<HTMLLabelElement>(`label[for="${event.target.id}"]`).textContent!.trim()
  for (const candidate of all<HTMLLabelElement>("[data-tabs] .tabbed-labels label"))
    if (candidate.textContent!.trim() === label)
      select<HTMLInputElement>(`#${candidate.htmlFor}`).checked = true
  __md_set("__tabs", [...new Set([label, ...__md_get<string[]>("__tabs") || []])])
  updateTabs()
})

/** Reveal linked sections inside tabs and collapsed details on arrival. */
function revealTarget(): void {
  const target = document.getElementById(decodeURIComponent(location.hash.slice(1)))
  if (!target)
    return
  for (let parent = target.parentElement; parent; parent = parent.parentElement)
    if (parent instanceof HTMLDetailsElement)
      parent.open = true
  let input = target instanceof HTMLInputElement ? target : undefined
  const block = target.closest(".tabbed-block")
  if (block) {
    const index = Array.from(block.parentElement!.children).indexOf(block)
    input = block.closest("[data-tabs]")!.querySelectorAll<HTMLInputElement>(":scope > input")[index]
  }
  if (input && input.closest("[data-tabs]")) {
    input.checked = true
    input.dispatchEvent(new Event("change", { bubbles: true }))
  }
  target.scrollIntoView()
}
window.addEventListener("hashchange", revealTarget)
window.addEventListener("resize", updateTabs)

/** Fit the header once per resize, retaining the site's existing compact layout. */
const header = select(".md-header")
const nav = select(".md-header__tabs")
const headerList = select(".md-tabs__list")

/**
 *
 */
function fitHeader(): void {
  if (!nav || !headerList)
    return
  header.classList.add("md-header--measuring")
  header.classList.remove("md-header--collapsed", "md-header--search-compact", "md-header--source-icon-only")
  const fits = () => headerList.scrollWidth <= nav.clientWidth + 1
  if (matchMedia("(min-width: 60em)").matches) {
    if (!fits()) header.classList.add("md-header--search-compact")
    if (!fits()) header.classList.add("md-header--source-icon-only")
  }
  if (!fits()) header.classList.add("md-header--collapsed")
  const narrow = matchMedia("(max-width: 44.984375em)").matches ||
    (matchMedia("(max-width: 76.234375em)").matches && !document.body.hasAttribute("data-md-nonav"))
  header.classList.toggle("md-header--menu-icon", narrow || header.classList.contains("md-header--collapsed"))
  header.classList.remove("md-header--measuring")
  query.placeholder = `Search${  header.classList.contains("md-header--search-compact") ? "" : "  (press /)"}`
}
if (nav)
  new ResizeObserver(fitHeader).observe(nav)

/** Share one scroll update for the floating controls, TOC, and sidebar edge fades. */
const topButton = select<HTMLButtonElement>("[data-md-component=top]")
const toc = all<HTMLAnchorElement>(".md-sidebar--secondary .md-nav__link[href*='#']")
  .map(link => ({ link, heading: document.getElementById(decodeURIComponent(new URL(link.href).hash.slice(1))) }))
  .filter(entry => entry.heading)
const scrollboxes = all(".md-sidebar__scrollwrap, .md-sidebar--secondary .md-nav--secondary > .md-nav__list")
let frame = 0

/**
 *
 */
function updateScroll(): void {
  frame = 0
  const scrolled = window.scrollY > 400
  document.documentElement.classList.toggle("md-scrolled", scrolled)
  if (topButton)
    topButton.hidden = !scrolled
  const footer = select(".md-footer")
  const lift = Math.max(0, innerHeight - (footer?.getBoundingClientRect().top ?? innerHeight))
  document.documentElement.style.setProperty("--md-float-lift", `${Math.round(lift)}px`)
  let current = toc[0]
  for (const entry of toc) {
    if (entry.heading!.getBoundingClientRect().top <= 96)
      current = entry
    else
      break
  }
  for (const entry of toc) {
    entry.link.classList.toggle("md-nav__link--active", entry === current)
    if (entry === current)
      entry.link.setAttribute("aria-current", "location")
    else
      entry.link.removeAttribute("aria-current")
  }
  for (const box of scrollboxes) {
    box.classList.toggle("md-more-above", box.scrollTop > 2)
    box.classList.toggle("md-more-below", box.scrollTop + box.clientHeight < box.scrollHeight - 2)
  }
}
const scheduleScroll = () => { if (!frame) frame = requestAnimationFrame(updateScroll) }
window.addEventListener("scroll", scheduleScroll, { passive: true })
window.addEventListener("resize", scheduleScroll)
for (const box of scrollboxes)
  box.addEventListener("scroll", scheduleScroll, { passive: true })
topButton.addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" })
  topButton.blur()
})
new ResizeObserver(scheduleScroll).observe(select(".md-content"))
for (const label of all<HTMLLabelElement>("label[tabindex][for]"))
  label.addEventListener("click", () => setTimeout(() => {
    const input = select<HTMLInputElement>(`#${label.htmlFor}`)
    document.querySelector(`[aria-labelledby="${label.id}"]`)?.setAttribute("aria-expanded", `${input.checked}`)
  }))
for (const element of all(".md-ellipsis")) {
  const host = element.closest("a") || element
  if (!host.hasAttribute("title"))
    host.title = element.textContent!.trim()
}

/** Highlight shared result terms without loading the search index. */
const params = new URLSearchParams(location.search)
const highlight = params.get("h")?.split(/\s+/).filter(Boolean) || []
if (highlight.length) {
  const escaped = highlight.map(term => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  const expression = new RegExp(`(${escaped.join("|")})`, "gi")
  const walker = document.createTreeWalker(select(".md-content"), NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  while (walker.nextNode()) {
    const node = walker.currentNode as Text
    if (!node.parentElement!.closest("script, style, pre, code, .arithmatex, mark"))
      nodes.push(node)
  }
  for (const node of nodes) {
    const parts = node.data.split(expression)
    if (parts.length > 1)
      node.replaceWith(...parts.map((part, index) => {
        if (!(index % 2))
          return document.createTextNode(part)
        const mark = document.createElement("mark")
        mark.textContent = part
        return mark
      }))
  }
}
// Printing expands native details, then restores the reader's open sections.
let closedDetails: HTMLDetailsElement[] = []
window.addEventListener("beforeprint", () => {
  closedDetails = all<HTMLDetailsElement>("details:not([open])")
  for (const detail of closedDetails)
    detail.open = true
})
window.addEventListener("afterprint", () => {
  for (const detail of closedDetails)
    detail.open = false
  closedDetails = []
})
document.documentElement.classList.replace("no-js", "js")
query.setAttribute("aria-keyshortcuts", "/")
search.setAttribute("aria-label", "Search")
meta.setAttribute("aria-live", "polite")
fitHeader()
window.addEventListener("DOMContentLoaded", () => {
  updateTabs()
  updateScroll()
  requestAnimationFrame(() => {
    if (location.hash)
      revealTarget()
    const item = document.querySelector<HTMLElement>(".md-sidebar--primary .md-nav__link--active[href]")
    if (item?.getClientRects().length) {
      const box = item.closest<HTMLElement>(".md-sidebar__scrollwrap")!
      box.scrollTop = Math.max(0, item.offsetTop - box.offsetTop - box.clientHeight / 2)
    }
  })
  if (params.has("q")) {
    query.value = params.get("q")!
    openSearch()
  }
})
