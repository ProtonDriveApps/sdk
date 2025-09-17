import { ValidationError } from "../../errors";

export class NodeOutOfSyncError extends ValidationError {
    name = 'NodeOutOfSyncError';
}
