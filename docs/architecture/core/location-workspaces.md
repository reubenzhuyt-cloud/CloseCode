# Core / Location, Projects & Workspaces

> last-verified: 05bcb72b59 @ 2026-11-10

## Responsibility
Owns the placement model: a `Location` (a directory + optional workspace) that scopes services, plus project identity, workspaces, worktrees, and git/VCS integration. Does not own session placement semantics beyond resolving a location for a session.

## Key Paths
- `packages/core/src/location.ts` — `Location.Service`, `Info`, `Ref`, `response`; `node` (unbound) and `boundNode(ref, { discovery })`
- `packages/core/src/location-services.ts`, `location-service-map.ts` — `LocationServices`, `LocationServiceMap.get(ref)`, `buildLocationServiceMap`
- `packages/core/src/location-lifecycle.ts`, `location-mutation.ts`, `location-activity.ts` — lifecycle/activity transitions
- `packages/core/src/project.ts`, `project/` (`schema.ts`, `sql.ts`) — project identity, `Project.ID`, `Current`, `Info`
- `packages/core/src/workspace.ts`, `workspace/` (`driver.ts`, `sql.ts`) — provider-backed workspaces (internal; no `workspace` group exists in `packages/protocol/src/groups/`, so they are not part of the V2 HTTP contract)
- `packages/core/src/worktree.ts`, `worktree/` (`git.ts`, `directory.ts`, `strategies.ts`, `sql.ts`) — worktree strategies
- `packages/core/src/vcs.ts`, `vcs/patch.ts` — `Vcs.Service` (adapter + `State.Transformable<VcsEditor>`), `DiffError`
- `packages/core/src/git.ts`, `repository.ts`, `repository-cache.ts` — git repository access
- `packages/schema/src/location.ts`, `project.ts`, `workspace.ts`, `worktree.ts`, `vcs.ts` — wire shapes

## Public API / Key Types
- `Location.Service` (`@opencode/Location`), `Location.Ref`, `Location.Info`
- `Project.Service`, `Workspace.Service`, `Worktree.Service`, `Vcs.Service`, `Git.Service`
- `LocationServiceMap.get(session.location)` — how SessionExecution discovers placement (AGENTS.md)

## Dependencies
- In: `schema/location|project|workspace|worktree|vcs`, util, database.
- Out: session execution, server (`location`/`project`/`worktree`/`vcs` routes), sdk/CLI.

## Links
- Parent: INDEX.md
