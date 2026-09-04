# Agent Session Provenance

`provenance` records which Agent discussion supplied knowledge and which Agent session performed the SiYuan write. It stores the durable history as session and event blocks under a project hub, while target atoms receive only the latest summary attributes.

## Actions

| Action | Purpose |
|---|---|
| `register_session` | Register or refresh one project session record |
| `record_event` | Record one knowledgeization event and update all target atoms |
| `list_project_sessions` | List distinct Agent sessions associated with a project |
| `list_atom_events` | List all recorded knowledgeization events that reference one atom |
| `resolve_session_link` | Return the verified native link, launcher link, or resume command for a session |
| `validate_session` | Check whether the local rollout or session artifact still exists |

## Data model

- A project session is uniquely identified by `projectId + provider + hostAlias + sessionId`.
- An event keeps separate `sourceSession` and `compileSession` references. Both sessions must already be registered; `record_event` no longer registers them implicitly.
- `record_event` requires `workstream` and writes `custom-progress-role`, schema, workstream, and `kind=knowledge` in the same operation.
- Event blocks contain real SiYuan block references to every target atom, enabling reverse lookup without parsing prose.
- Session identifiers live in custom attributes. Atom content remains self-contained and readable when old rollout files have expired.

## Link capability

- Codex sessions use the native `codex://threads/<sessionId>` link.
- Hermes returns the verified `hermes --resume <sessionId>` command. Hermes.app currently registers no URL scheme, so the adapter does not invent `hermes://` or `@session:` native deep links.
- ZCode and Claude Code currently return a tested `--resume <sessionId>` command. No native session deep link is claimed until the client exposes and verifies one.
- Remote hosts return metadata but are not opened on the current device.

`register_session` and `record_event` are strict writes: first call them with `validateOnly: true`, then replay with the returned state hash and a stable request ID.
