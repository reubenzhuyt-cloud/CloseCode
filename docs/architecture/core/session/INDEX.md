# Core / Session

> Router only. Open the one module doc you need.

| Module | Covers | Doc |
|--------|--------|-----|
| engine | `Session.make` service, per-session Handle, aggregate entry point | engine.md |
| execution | `SessionExecution` process-global coordinator, wake, interruption, recovery markers | execution.md |
| runner | Single logical step: LLM stream, retries, max-steps, model transport | runner.md |
| history-persistence | Projected history, session store/read models, durable rows | history-persistence.md |
| inbox-prompt | Prompt admission, inbox steering/delivery, prompt preparation | inbox-prompt.md |
| compaction-instructions | Oversized-context compaction and Session-scoped instruction epochs | compaction-instructions.md |
