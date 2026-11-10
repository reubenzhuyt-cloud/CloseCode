import type { SkillApi } from "@opencode/client/promise/api"
import type { Skill } from "@opencode/schema/skill"
import type { Types } from "effect"
import type { Transform } from "./registration.js"

export interface SkillEditor {
  list(): readonly Types.DeepMutable<Skill.Info>[]
  get(id: string): Types.DeepMutable<Skill.Info> | undefined
  add(skill: Skill.Info, registration?: Skill.Registration): void
  update(id: string, update: (skill: Types.DeepMutable<Skill.Info>) => void): void
  remove(id: string): void
}

export interface SkillDomain extends Pick<SkillApi, "list"> {
  readonly transform: Transform<SkillEditor>
  readonly reload: () => Promise<void>
}
