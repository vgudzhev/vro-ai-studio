# vRO Action Coding Standards

## Naming Conventions

- **Actions**: camelCase verb phrases — `getVmByName`, `createSnapshot`, `updateNetworkConfig`
- **Variables**: camelCase — `vmObject`, `snapshotList`, `retryCount`
- **Constants**: UPPER_SNAKE_CASE — `MAX_RETRIES`, `DEFAULT_TIMEOUT_MS`, `API_VERSION`
- **Parameters (inputs)**: camelCase nouns — `hostName`, `vmId`, `timeoutSeconds`
- **Boolean variables/params**: prefix with `is`, `has`, or `should` — `isEnabled`, `hasSnapshots`, `shouldRetry`
- **Loop indices**: meaningful names, not `i/j/k` — use `vmIndex`, `retryAttempt`

## File & Module Structure

- One action per file; filename matches the action name (e.g. `getVmByName.js`)
- Place shared helpers in a dedicated `utils/` module category in vRO
- Group related actions under the same vRO module path (e.g. `com.company.vm/snapshot/`)

## Function Design

- Actions must do one thing — split multi-step workflows into smaller composed actions
- Maximum ~80 lines of logic per action; extract helpers if longer
- All inputs must be declared as vRO action inputs, not hardcoded
- Return a single typed value; avoid returning `null` — throw on failure instead

## Error Handling

- Always wrap external calls (REST, vRO API, SDK) in try/catch
- Log before throwing: `System.log("getVmByName: failed to find VM '" + vmId + "': " + e.message)`
- Use descriptive error messages that include the input values that caused the failure
- Do not silently swallow exceptions; re-throw or return a meaningful error object

## Logging

- Use `System.log()` for informational output, `System.warn()` for non-fatal issues, `System.error()` for failures
- Log at the start of non-trivial actions: `System.log("Starting createSnapshot for vmId=" + vmId)`
- Log at completion: `System.log("Snapshot created: " + snapshotId)`
- Do not log sensitive data (passwords, tokens, PII)

## vRO-Specific Patterns

- Use `Server.findAllForType()` / `Server.findForType()` instead of raw SOAP when available
- Always call `VcPlugin.convertToVimManagedObject()` when working with vCenter MoRefs
- Prefer `Properties` objects over plain JS objects for vRO attribute maps
- For REST calls, use `RESTHost` and `RESTRequest` from the vRO REST plugin rather than raw HTTP

## Type Safety

- Declare explicit types for all inputs and the return value in the vRO action metadata
- Avoid `any` casts; if a type is unknown, document why with a comment
- Use `instanceof` checks before accessing plugin-specific properties

## Comments & Documentation

- Each action must have a one-line description in vRO's "Description" field
- Complex logic blocks get an inline comment explaining *why*, not *what*
- JSDoc is not required, but document non-obvious parameter constraints inline:
  ```js
  // vmId must be the MoRef format: "vm-123", not the display name
  ```

## Testing

- Unit test files named `<actionName>.spec.ts`, co-located or in a `__tests__/` folder
- Cover: happy path, missing/null inputs, and at least one error/exception path
- Mock vRO plugin objects (`VcPlugin`, `RESTHost`, etc.) — never call live systems in tests
- Use Jasmine (`describe` / `it` / `expect`) — the default vRO test framework

## Prohibited Patterns

- No `eval()` or `Function()` constructor
- No hardcoded credentials, hostnames, or environment-specific URLs — use vRO Configuration Elements
- No `console.log` — use `System.log` only
- No synchronous `sleep()` loops — use vRO's built-in `System.sleep()` with a documented reason
- No modifying shared/global state across actions
