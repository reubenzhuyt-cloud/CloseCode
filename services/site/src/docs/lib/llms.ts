import { latestDocs } from "../config"
import { docsSections } from "./navigation"

export function renderLlmsTxt(site: URL, navigation = docsSections) {
  const root = new URL(latestDocs.base, site)
  const sections = navigation.flatMap((section) => [
    `## ${section.title}`,
    "",
    ...section.groups.flatMap((group) => [
      ...(group.title && group.title !== section.title ? [`### ${group.title}`, ""] : []),
      ...group.items.flatMap((item) => {
        // A page in another app is that app's llms.txt.
        if (item.href) return []
        const path = item.slug === "index" ? "" : `${item.slug.replace(/\/index$/, "")}/`
        return [`- [${item.title}](${new URL(path, root)})`]
      }),
      "",
    ]),
  ])

  return [
    "# OpenCode V2 Documentation",
    "",
    "> Official documentation for using, configuring, and building with OpenCode V2.",
    "",
    ...sections,
  ].join("\n")
}
