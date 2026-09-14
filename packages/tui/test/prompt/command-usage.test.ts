import { describe, expect, test } from "bun:test"
import {
  MAX_COMMAND_USAGE_ENTRIES,
  commandUsageBoost,
  commandUsageKey,
  incrementCommandUsage,
  readCommandUsage,
  sortCommandsByUsage,
} from "../../src/prompt/command-usage"

describe("command usage", () => {
  test("commandUsageKey prefers value and trims padding", () => {
    expect(commandUsageKey({ display: "/help    " })).toBe("/help")
    expect(commandUsageKey({ display: "/help    ", value: "/help" })).toBe("/help")
  })

  test("readCommandUsage drops non-numeric entries", () => {
    expect(readCommandUsage({ "/a": 2, "/b": "x", "/c": Number.NaN })).toEqual({ "/a": 2 })
    expect(readCommandUsage(undefined)).toEqual({})
  })

  test("incrementCommandUsage counts and caps", () => {
    expect(incrementCommandUsage({}, "/a")).toEqual({ "/a": 1 })
    expect(incrementCommandUsage({ "/a": 1 }, "/a")).toEqual({ "/a": 2 })
    const big = Object.fromEntries(Array.from({ length: MAX_COMMAND_USAGE_ENTRIES + 10 }, (_, i) => [`/c${i}`, i]))
    const capped = incrementCommandUsage(big, "/new")
    expect(Object.keys(capped)).toHaveLength(MAX_COMMAND_USAGE_ENTRIES)
    expect(capped["/new"]).toBe(1)
    expect(capped["/c0"]).toBeUndefined()
  })

  test("commandUsageBoost grows with count and is clamped", () => {
    expect(commandUsageBoost(0)).toBe(1)
    expect(commandUsageBoost(5)).toBeGreaterThan(1)
    expect(commandUsageBoost(-5)).toBe(1)
    expect(commandUsageBoost(10)).toBe(2)
    expect(commandUsageBoost(100)).toBe(2)
  })

  test("sortCommandsByUsage orders by count then alphabetically", () => {
    const items = [{ display: "/zeta" }, { display: "/alpha" }, { display: "/beta" }]
    const sorted = sortCommandsByUsage(items, { "/beta": 3 })
    expect(sorted.map((item) => item.display)).toEqual(["/beta", "/alpha", "/zeta"])
  })
})
