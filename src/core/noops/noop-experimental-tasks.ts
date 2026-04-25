export class ExperimentalServerTasks {
    constructor(_server?: unknown) {
        // Keep constructor compatibility with the SDK experimental tasks wrapper.
    }
}

export function assertToolsCallTaskCapability(_requests?: unknown, _method?: string, _entityName?: string) {
    // No-op: this project does not use SDK experimental task APIs.
}

export function assertClientRequestTaskCapability(_requests?: unknown, _method?: string, _entityName?: string) {
    // No-op: this project does not use SDK experimental task APIs.
}

export default {};
