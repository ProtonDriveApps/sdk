import { Device } from './devices';
import { MaybeNode } from './nodes';

export type DeviceEventCallback = (deviceEvent: DeviceEvent) => void;
export type NodeEventCallback = (nodeEvent: NodeEvent) => void;

export type NodeEvent = {
    type: 'update',
    uid: string,
    node: MaybeNode,
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
    RequestsThrottled = "requestsThrottled",
    RequestsUnthrottled = "requestsUnthrottled",
}
