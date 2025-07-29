import { DriveEvent, DriveEventType } from '../../../sdk/src';

export async function runForever() {
    return new Promise(() => {});
}

function mapEventToIcon(eventType: DriveEventType): string {
    switch (eventType) {
        case DriveEventType.NodeUpdated:
            return '♻️';
        case DriveEventType.NodeCreated:
            return '🐤';
        case DriveEventType.NodeDeleted:
            return '❌';
        case DriveEventType.TreeRefresh:
            return '🐤';
        case DriveEventType.SharedWithMeUpdated:
            return '👪';
        case DriveEventType.TreeRemove:
            return '🪓';
        case DriveEventType.FastForward:
            return '⏩';
    }
}

export function eventsCallback(json: boolean, filter: (event: DriveEvent) => boolean, event: DriveEvent) {
    if (!filter(event)) {
        return;
    }
    if (json) {
        console.log(JSON.stringify(event));
    } else {
        const icon = mapEventToIcon(event.type);
        console.log(icon, event);
    }
}
