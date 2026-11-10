import { docsSets, latestDocs, type DocsSet } from "./config"
import { docsHref } from "./lib/navigation"

/**
 * What a request under a docs set's base gets, given each set's page slugs (`virtual:docs-pages`, the
 * list the build prerenders): one of the set's own files, a page or its Markdown twin, or a redirect.
 * Any /docs path that isn't a page here goes to the docs' intro, temporarily, because the docs may add
 * the page later. The old /v1 docs' URLs go to the same path here. Undefined outside the docs.
 */
export function docsRoute(url: URL, accept: string, slugs: Record<DocsSet["id"], readonly string[]>) {
  const set = docsSets.find((set) => `${url.pathname.replace(/\.md$/, "")}/`.startsWith(set.base))
  if (!set) return retiredDocsRoute(url.pathname, url.search)
  // Agents try a page's URL plus .md first, which for the intro is /docs.md.
  const pathname = url.pathname === `${set.base.slice(0, -1)}.md` ? `${set.base}index.md` : url.pathname
  const path = pathname.slice(set.base.length - 1)
  if (set.files.includes(path.split("/")[1] ?? "")) return { type: "file" as const, set, path }

  const file = path.endsWith(".md")
  const page = file ? path.slice(0, -3) : path
  const slug = page.replace(/^\/|\/$/g, "") || "index"
  const target = moved.get(slug)
  if (target) return redirect(docsHref(target, latestDocs), 301)
  if (!slugs[set.id].includes(slug)) return redirect(latestDocs.base, 302)
  const canonical = docsHref(slug, set)
  if (!file && path.endsWith("/") && !canonical.endsWith("/")) return redirect(canonical, 307)
  // The API reference has no Markdown twin.
  const twin = slug !== "api"
  const markdown = file || (twin && (accept.includes("text/markdown") || accept.includes("text/x-markdown")))
  if (markdown && !twin) return { type: "missing" as const }
  return { type: "page" as const, set, slug, markdown, twin }
}

/**
 * docs.opencode.ai (and docs.dev.opencode.ai) served the old docs from their own app: every address
 * there is the same path on the docs here, permanently.
 */
export function docsHostRedirect(url: URL) {
  if (!url.hostname.startsWith("docs.")) return
  const path = url.pathname.replace(/^\/docs(?=\/|$)/, "") || "/"
  return `https://${url.hostname.slice("docs.".length)}${latestDocs.base.slice(0, -1)}${path}${url.search}`
}

// Pages that moved, by slug: the old docs' Go and Zen pages, which became Console pages.
const moved = new Map([
  ["console/inference", "console/api/inference"],
  ["go", "console/go"],
  ["zen", "console/models"],
])

/**
 * The /v1 docs that this site no longer serves: their addresses go to the same path on the docs here
 * (temporarily, so a page added later takes its old URL over), which is also where the /docs fallback
 * above lands, so an address that has no page here ends at the docs' intro.
 */
function retiredDocsRoute(pathname: string, search: string) {
  if (!/^\/v1\/docs(?=\/|\.|$)/.test(pathname)) return
  return redirect(`${pathname.replace(/^\/v1\/docs/, latestDocs.base.slice(0, -1))}${search}`, 302)
}

function redirect(location: string, status: number) {
  return { type: "redirect" as const, location, status }
}
