import { Device } from './devices.js';
import { NodeEntity, NodeOrUid } from './nodes.js';

export interface Events {
    subscribeToRemoteDataUpdates(): void,

    subscribeToDevices(callback: DeviceEventCallback): () => void,
    subscribeToSharedNodesByMe(callback: NodeEventCallback): () => void,
    subscribeToSharedNodesWithMe(callback: NodeEventCallback): () => void,
    subscribeToTrashedNodes(callback: NodeEventCallback): () => void,
    subscribeToChildren(parentNodeUid: NodeOrUid, callback: NodeEventCallback): () => void,

    onMessage(eventName: SDKEvent, callback: () => void): () => void,
}

export type DeviceEventCallback = (deviceEvent: DeviceEvent) => void;
export type NodeEventCallback = (nodeEvent: NodeEvent) => void;

export type NodeEvent = {
    type: 'update',
    uid: string,
    node: NodeEntity,
} | {
    type: 'remove',
    uid: string,
}

export type DeviceEvent = {
    type: 'update',
    uid: string,
    device: Device,
} | {
    type: 'remove',
    uid: string,
}

export enum SDKEvent {
    TransfersPaused = "transfersPaused",
    TransfersResumed = "transfersResumed",
    SpeedLimited = "speedLimited",
    SpeedResumed = "speedResumed",
}
