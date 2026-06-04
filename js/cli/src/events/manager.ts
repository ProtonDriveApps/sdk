import {
    type DriveEvent,
    DriveEventType,
    type DriveListener,
    type EventSubscription,
    Logger,
    type ProtonDriveClient,
} from '@protontech/drive-sdk';

import type { EventsContext, EventsProvider } from './interface';

const CORE_TREE_EVENT_SCOPE_ID = 'core';

type TreeSdk = Pick<ProtonDriveClient, 'subscribeToDriveEvents' | 'subscribeToTreeEvents'>;

export class Manager {
    private coreSubscription: EventSubscription | null = null;
    private readonly volumeSubscriptions = {
        drive: new Map<string, EventSubscription>(),
        photos: new Map<string, EventSubscription>(),
    };

    private processingEvents = new Set<Promise<void>>();

    private constructor(
        private readonly logger: Logger,
        private readonly driveSdk: TreeSdk,
        private readonly photosSdk: TreeSdk,
        private readonly provider: EventsProvider,
    ) {}

    static async create(
        logger: Logger,
        driveSdk: TreeSdk,
        photosSdk: TreeSdk,
        provider: EventsProvider,
        startSubscriptions: boolean = true,
    ): Promise<Manager> {
        const manager = new Manager(logger, driveSdk, photosSdk, provider);
        if (startSubscriptions) {
            await manager.startSubscriptions();
        }
        return manager;
    }

    async startSubscriptions() {
        if (this.provider.canListenForEvents()) {
            await this.subscribeCoreEvents();
            await this.subscribeInitialScopesFromProvider();
        }
    }

    private async subscribeInitialScopesFromProvider(): Promise<void> {
        for (const { context, treeEventScopeIds } of this.provider.getInitialSubscriptionScopeIds()) {
            for (const scopeId of treeEventScopeIds) {
                if (context === 'drive') {
                    await this.subscribeDriveScope(scopeId);
                } else {
                    await this.subscribePhotosScope(scopeId);
                }
            }
        }
    }

    async subscribeDriveScope(scopeId: string): Promise<void> {
        await this.subscribeForSdk('drive', scopeId, this.driveSdk);
    }

    async subscribePhotosScope(scopeId: string): Promise<void> {
        await this.subscribeForSdk('photos', scopeId, this.photosSdk);
    }

    private async subscribeForSdk(sdkContext: EventsContext, scopeId: string, sdk: TreeSdk): Promise<void> {
        if (!this.provider.canListenForEvents()) {
            return;
        }
        if (scopeId === CORE_TREE_EVENT_SCOPE_ID) {
            await this.subscribeCoreEvents();
            return;
        }
        await this.subscribeVolumeForSdk(sdkContext, scopeId, sdk);
    }

    private async subscribeCoreEvents(): Promise<void> {
        if (this.coreSubscription) {
            return;
        }
        this.coreSubscription = await this.driveSdk.subscribeToDriveEvents(this.createHandler('drive'));
        const latestEventId = this.coreSubscription.getLatestEventId();
        if (latestEventId) {
            this.logger.debug(
                `Subscribed to scope drive:${CORE_TREE_EVENT_SCOPE_ID} with latest event ID ${latestEventId}`,
            );
            await this.provider.setLatestEventId('drive', CORE_TREE_EVENT_SCOPE_ID, latestEventId);
        }
    }

    private async subscribeVolumeForSdk(sdkContext: EventsContext, scopeId: string, sdk: TreeSdk): Promise<void> {
        if (this.volumeSubscriptions[sdkContext].has(scopeId)) {
            return;
        }
        const subscription = await sdk.subscribeToTreeEvents(scopeId, this.createHandler(sdkContext));
        this.volumeSubscriptions[sdkContext].set(scopeId, subscription);
        const latestEventId = subscription.getLatestEventId();
        if (latestEventId) {
            this.logger.debug(`Subscribed to scope ${sdkContext}:${scopeId} with latest event ID ${latestEventId}`);
            await this.provider.setLatestEventId(sdkContext, scopeId, latestEventId);
        }
    }

    private createHandler(sdkContext: EventsContext): DriveListener {
        return async (event: DriveEvent) => {
            const { promise, resolve } = Promise.withResolvers<void>();
            this.processingEvents.add(promise);

            const scopeId = event.treeEventScopeId;
            try {
                if (event.type === DriveEventType.TreeRemove) {
                    const sub = this.volumeSubscriptions[sdkContext].get(scopeId);
                    if (sub) {
                        try {
                            sub.dispose();
                        } catch (error: unknown) {
                            this.logger.warn(`Failed to dispose volume event subscription: ${error}`);
                        }
                        this.volumeSubscriptions[sdkContext].delete(scopeId);
                    }
                    await this.provider.removeScope(sdkContext, scopeId);
                    return;
                }

                const eventId = event.eventId;
                this.logger.debug(`Updating latest event ID for scope ${sdkContext}:${scopeId} to ${eventId}`);
                await this.provider.setLatestEventId(sdkContext, scopeId, eventId);
            } catch (error: unknown) {
                this.logger.error(`Failed to handle event ${event.type} for scope ${scopeId}`, error);
                throw error;
            } finally {
                this.processingEvents.delete(promise);
                resolve();
            }
        };
    }

    async clear(): Promise<void> {
        await this.dispose();
        await this.provider.clear();
    }

    async dispose(): Promise<void> {
        this.logger.debug('Disposing events manager');

        if (this.coreSubscription) {
            try {
                this.coreSubscription.dispose();
            } catch (error: unknown) {
                this.logger.warn(`Failed to dispose core event subscription: ${error}`);
            }
            this.coreSubscription = null;
        }

        const subscriptions = [...this.volumeSubscriptions.drive.values(), ...this.volumeSubscriptions.photos.values()];
        for (const sub of subscriptions) {
            try {
                sub.dispose();
            } catch (error: unknown) {
                this.logger.warn(`Failed to dispose event subscription: ${error}`);
            }
        }
        this.volumeSubscriptions.drive.clear();
        this.volumeSubscriptions.photos.clear();

        try {
            await Promise.all(this.processingEvents);
        } catch (error: unknown) {
            this.logger.warn(`Failed to wait for processing events: ${error}`);
        }

        await this.provider.dispose();
    }
}
