# SiYuan Sisyphus MCP & CLI Design & Implementation Insights

> Experience summary from multiple rounds of testing and iterative feedback.

---

## Architecture Design Insights

### 1. Progressive Information Disclosure

**Core Principle**: Avoid returning massive objects in one shot; let the AI explore on demand.

**Practical Example**:
```typescript
// system(action="conf") design
// Step 1: get a summary
{ mode: "summary" }  // returns a list of 32 top-level config items

// Step 2: drill down as needed
{ mode: "get", keyPath: "appearance.mode" }  // returns the specific value
```

**Design Benefits**:
- Reduces token consumption
- Lowers cognitive load
- Supports exploratory interaction

**Applicable Scenarios**:
- System config reading (`system.conf`)
- Scoped config reads (`system.conf` with `keyPath`)
- Document tree depth control (`document.list_tree` with `maxDepth`)

### 2. Aggregated Tool Design Pattern

**Core Principle**: Group related operations by functional domain instead of scattering them by operation type.

**Comparison**:
```
Traditional: createDoc / deleteDoc / renameDoc / moveDoc (by operation)
Current:     document(action="create"|"remove"|"rename"|"move") (by domain)
```

**Design Benefits**:
- Fewer tools, lower selection cost
- Related operations are co-located and easier to understand
- Unified permission checks and error handling

**Implementation Essentials**:
- Each action has independent parameter validation
- Unified response structure (`success` / `error` / `uiRefresh`)

### 3. Layered Permission Design

**Permission Model**:
```
none: no access
r:    read-only
rw:   read and write (no delete)
rwd:  full access (read, write, delete)
```

**Key Design Decisions**:
1. **Notebook-level permissions**: the notebook is the smallest permission unit
2. **Runtime checks**: resolve the target notebook before every operation
3. **Clear error messages**: return `current_permission` and `required_permission`

**Error Response Example**:
```json
{
  "error": {
    "type": "permission_denied",
    "notebook": "xxx",
    "current_permission": "r",
    "required_permission": "write"
  }
}
```

### 4. UI Auto-Refresh Mechanism

**Design Principle**: Decouple data operations from UI synchronization; trigger refreshes via events.

**Implementation Pattern**:
```typescript
// After a successful operation, return a uiRefresh field
{
  "success": true,
  "uiRefresh": {
    "applied": true,
    "operations": [
      { "type": "reloadProtyle", "id": "..." },
      { "type": "reloadFiletree" }
    ]
  }
}
```

**Benefits**:
- Real-time UI synchronization
- Supports unified refresh after batch operations
- Clients can customize refresh strategies

---

## API Design Best Practices

### 1. Minimal Write Response

**Principle**: Write operations return confirmation info rather than the full resource.

**Recommended Structure**:
```typescript
{
  "success": true,
  "id": "block-id",           // created / updated resource ID
  "parentID": "...",          // parent context
  "previousID": "...",        // positional context
  "dataType": "markdown",     // data type
  "uiRefresh": { ... }        // UI refresh instructions
}
```

**Avoid**: Returning complete DOM operation arrays or full resource text (unless explicitly requested).

### 2. Dual Path System

**Two Path Types**:

| Type | Purpose | Example |
|------|---------|---------|
| Human-readable | Creation, ID lookup | `/Inbox/Weekly Note` |
| Storage path | Rename, move, remove | `/20240318112233-abc123.sy` |

**Best Practices**:
1. Clearly document which path type each action accepts
2. On validation failure, hint "current path type does not match"
3. Provide `lookup` for path conversion

**Safe Workflow**:
```
document(action="lookup", id=..., include="path") -> obtain storage path
-> reuse storage path for rename/move/remove
```

### 3. Permission Filtering & Data Security

**Key Principle**: Any operation that returns data must go through permission filtering.

**Scenarios Requiring Filtering**:
- Full-text search (`search.fulltext`)
- SQL queries (`search.query_sql`)
- Recent updates (`block.recent_updated`)
- Backlink queries (`search.get_backlinks`)

**Filtering Strategy**:
```typescript
// Filter search results by permission
const filtered = results.filter(item => {
  const notebook = extractNotebook(item);
  return permissionManager.canRead(notebook);
});

// Return filtering metadata
{
  "results": filtered,
  "filteredOutCount": results.length - filtered.length,
  "pathApplied": true
}
```

### 4. Degradation & Fault Tolerance

**Fallback Mode**: When the primary data source is unavailable, provide an alternative and clearly mark it.

**Example** (backlink query):
```json
{
  "backlinks": [...],
  "fallbackUsed": true,
  "sourcePayloadMissing": true,
  "fallbackQuery": "sql",
  "resultConfidence": "fallback",
  "warning": "SiYuan returned no backlink payload; SQL fallback results are shown."
}
```

**Design Essentials**:
- Explicitly mark fallback usage
- Provide result confidence indicators
- Include warning messages for upstream decision-making

### 5. Self-Documenting Help System

**Design**: Every tool supports `action="help"`, returning:
- Full action list
- Required field descriptions
- Usage tips and examples
- Related resource links

**Implementation Value**:
- Lower learning curve
- Supports AI auto-discovery
- Reduces doc–implementation drift

---

## Testing Strategy Recommendations

### 1. Full Regression Testing Framework

**Test Dimensions**:

| Dimension | Coverage | Tools |
|-----------|----------|-------|
| Functional | All actions | 16 tools |
| Permission | r / rw / none / rwd | notebook tool |
| Scenario | Real user workflows | Multi-role simulation |
| Boundary | Empty, oversized, special chars | Per-tool edge cases |

**Test Environment Isolation**:
- Use dedicated test notebooks
- Keep test data separate from production data
- Write operations only touch test targets

### 2. Multi-Role Experience Testing

**Role Design**:
```
Product Manager: requirements, PRDs, release planning
Developer:       technical notes, code snippets, API docs
Grad Student:    literature management, thesis writing, knowledge graphs
Creator:         article writing, material organization, inspiration logs
Project Manager: task tracking, meeting notes, permission management
```

**Testing Value**:
- Discover experience gaps across scenarios
- Verify functional coverage completeness
- Gather diverse feedback

### 3. Permission Boundary Testing

**Mandatory Test Scenarios**:
1. **Read test**: `none`-permission notebook data must not leak
2. **Write test**: `r`-permission notebooks must block writes
3. **Delete test**: `rw`-permission notebooks must block deletes
4. **Cross-notebook test**: permission checks when multiple notebooks are involved

**Validation Method**:
```typescript
// Set permission -> execute operation -> verify result
notebook(action="set_permission", permission="none");
// Attempt read
document(action="get_doc", ...);  // should return permission_denied
```

### 4. Indexing Delay Handling

**Known Issue**: Immediately querying after document creation may hit indexing delays.

**Handling Strategies**:
1. **Documentation**: mention possible delays in help text
2. **Retry mechanism**: AI should tolerate brief retries if querying right after create
3. **Return value design**: creation operations return full info to reduce immediate query needs

---

## Deployment Experience

### 1. Error Handling Patterns

**Structured Errors**:
```typescript
{
  "error": {
    "type": "permission_denied" | "not_found" | "validation_error" | "api_error",
    "message": "Human-readable description",
    "...": "Additional context"
  }
}
```

**Type Definitions**:
- `permission_denied`: insufficient permissions
- `not_found`: resource does not exist
- `validation_error`: parameter validation failed
- `api_error`: underlying API error

### 2. Time Format Consistency

**Issue**: SQL queries return `20260219162616` format, inconsistent with other places.

**Recommendation**: Provide standardized time formats:
```typescript
// Original format
"created": "20260219162616"

// Standardized
"created": "2026-02-19T16:26:16+08:00",
"createdEpoch": 1708333576000
```

### 3. Batch Operation Support

**Requirement Scenarios**:
- Batch block creation
- Batch cell updates
- Batch document moves

**Implementation Suggestions**:
- Reuse transaction API (`/api/transactions`)
- Provide `batch_*` action series
- Return batch results and failed items

### 4. Performance Optimization

**N+1 Query Problem**:
- `list_tree` fetches document info one by one
- Solution: batch fetching or caching

**Large Data Handling**:
- Paginated search results
- SQL query result truncation with hints
- Tree depth control (`maxDepth`)

---

## Summary

SiYuan Sisyphus MCP & CLI is designed around these core principles:

1. **AI-first**: every decision considers AI usage scenarios
2. **Progressive disclosure**: avoid information overload, support exploratory interaction
3. **Security first**: permission checks permeate all data access
4. **Clear feedback**: operation results are explicit, error messages are actionable
5. **Real-time sync**: data operations and UI state stay consistent

These principles make the MCP not just an API wrapper, but a knowledge-management infrastructure suitable for long-term, stable AI dependency.

---

*Document compiled: 2026-04-14*  
*Based on: AI_MCP_EXPERIENCE_REPORT_001-005, API_MAPPING, API_UPDATE_SUGGESTIONS*
