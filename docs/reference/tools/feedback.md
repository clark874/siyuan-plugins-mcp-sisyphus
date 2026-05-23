# Feedback Tool

Use the `feedback` tool to submit plain-text product feedback to the plugin developer.

## Actions

| Action | Purpose |
|--------|---------|
| `submit` | Send an issue report, suggestion, or usage experience through the configured WPS form channel. |

## Example

```json
{
  "action": "submit",
  "description": "The document create help is hard to follow.",
  "impact": "Agents often choose the wrong path shape.",
  "suggestion": "Add a shorter example near the required fields.",
  "agent": "Claude Desktop / Claude Sonnet 4.5"
}
```

The source and plugin version fields are filled automatically.

Avoid sending secrets, API tokens, private note content, or sensitive local paths.
