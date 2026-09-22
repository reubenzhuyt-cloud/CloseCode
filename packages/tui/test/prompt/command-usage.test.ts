import { expect, test } from "bun:test"
import { compareCommandUsage, type CommandUsage, type CommandUsageOption } from "../../src/prompt/command-usage"

const option = (name: string): CommandUsageOption => ({ name, display: `/${name}` })
const order = (items: CommandUsageOption[], usage: Record<string, CommandUsage>) =>
  items.toSorted((left, right) => compareCommandUsage(left, right, usage)).map((item) => item.name)

test("used commands sort before unused ones", () => {
  expect(order([option("beta"), option("alpha")], { beta: { count: 1, usedAt: 1 } })).toEqual(["beta", "alpha"])
})

test("higher usage count sorts first", () => {
  expect(
    order([option("alpha"), option("beta")], {
      alpha: { count: 1, usedAt: 10 },
      beta: { count: 2, usedAt: 1 },
    }),
  ).toEqual(["beta", "alpha"])
})

test("equal usage count sorts by most recent use", () => {
  expect(
    order([option("alpha"), option("beta")], {
      alpha: { count: 1, usedAt: 1 },
      beta: { count: 1, usedAt: 10 },
    }),
  ).toEqual(["beta", "alpha"])
})

test("unused commands stay alphabetical by display", () => {
  expect(order([option("beta"), option("alpha")], {})).toEqual(["alpha", "beta"])
})

test("used commands precede the alphabetical tail", () => {
  expect(
    order([option("delta"), option("charlie"), option("bravo"), option("alpha")], {
      delta: { count: 1, usedAt: 5 },
      charlie: { count: 3, usedAt: 1 },
    }),
  ).toEqual(["charlie", "delta", "alpha", "bravo"])
})
