// Where the current docs live: the V2 docs (src/docs), which this app serves under /docs.
export const docsBase = "/docs"

/** The retired V1 docs' addresses, which redirect to the docs here (docs/route.ts), for example `v1DocsUrl("/ide/")`. */
export function v1DocsUrl(path = "") {
  return `/v1/docs${path}`
}

/** A site-relative link into the docs, for example `docsUrl("/models/")`. */
export function docsUrl(path = "") {
  return `${docsBase}${path}`
}
