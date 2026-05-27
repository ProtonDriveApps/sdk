const FOREGROUND_POLLING_INTERVAL_SECONDS = 30;
const BACKGROUND_POLLING_INTERVAL_SECONDS = 10 * 60;
const JITTER_SECONDS = 1;

type ScopeState = {
    eventTreeScopeId: string;
    isOwnVolume: boolean;
    isForeground: boolean;
    timeoutHandle?: ReturnType<typeof setTimeout>;
};

export class EventScheduler {
    private scopes = new Map<string, ScopeState>();

    constructor(
        private callback: (eventTreeScopeId: string) => Promise<void>,
        private ownVolumeId: string,
    ) {}

    addScope(eventTreeScopeId: string): void {
        if (this.scopes.has(eventTreeScopeId)) {
            return;
        }

        const isOwnVolume = eventTreeScopeId === this.ownVolumeId;
        const scope = {
            eventTreeScopeId,
            isOwnVolume,
            isForeground: isOwnVolume,
        };
        this.scopes.set(eventTreeScopeId, scope);

        // We need to poll right away to get the initial events.
        this.poll(scope);
    }

    setForeground(eventTreeScopeId: string): void {
        const scope = this.scopes.get(eventTreeScopeId);
        if (!scope || scope.isOwnVolume || scope.isForeground) {
            return;
        }

        this.sendCurrentForegroundSharedScopesToBackground();

        scope.isForeground = true;
        this.stopPolling(scope);

        // We need to poll right away to notify the client that the scope is
        // requested at this moment.
        this.poll(scope);
    }

    setBackground(eventTreeScopeId: string): void {
        const scope = this.scopes.get(eventTreeScopeId);
        if (!scope || scope.isOwnVolume || !scope.isForeground) {
            return;
        }

        scope.isForeground = false;
        this.setPolling(scope);

        // No need to poll here as the scope is put back to background.
    }

    removeScope(eventTreeScopeId: string): void {
        const scope = this.scopes.get(eventTreeScopeId);
        if (!scope) {
            return;
        }

        this.stopPolling(scope);
        this.scopes.delete(eventTreeScopeId);
    }

    private sendCurrentForegroundSharedScopesToBackground(): void {
        const foregroundSharedScopes = Array.from(
            this.scopes.values().filter((scope) => !scope.isOwnVolume && scope.isForeground),
        );

        if (foregroundSharedScopes.length === 0) {
            return;
        }

        for (const scope of foregroundSharedScopes) {
            scope.isForeground = false;
            this.setPolling(scope);
        }
    }

    private poll(scope: ScopeState): void {
        const promise = this.callback(scope.eventTreeScopeId);

        // Setup timer for next poll only after the callback is resolved to
        // avoid race conditions where the client is called before the events
        // are processed.
        void promise.finally(() => {
            this.setPolling(scope);
        });
    }

    private setPolling(scope: ScopeState): void {
        this.stopPolling(scope);

        const pollingIntervalSeconds = scope.isForeground
            ? FOREGROUND_POLLING_INTERVAL_SECONDS
            : BACKGROUND_POLLING_INTERVAL_SECONDS;
        const jitter = Math.random() * JITTER_SECONDS;
        const timeout = (pollingIntervalSeconds + jitter) * 1000;

        scope.timeoutHandle = setTimeout(() => {
            this.poll(scope);
        }, timeout);
    }

    private stopPolling(scope: ScopeState): void {
        if (scope.timeoutHandle === undefined) {
            return;
        }

        clearTimeout(scope.timeoutHandle);
        scope.timeoutHandle = undefined;
    }
}
