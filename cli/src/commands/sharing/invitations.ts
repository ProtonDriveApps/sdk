import { ValidationError } from "@protontech/drive-sdk";

type InvitationContext = 'drive' | 'photos';

export function getInvitationUid(context: InvitationContext, uid: string): string {
    return `${context}~${uid}`;
}

export function parseInvitationUid(input: string): {
    isForPhotos: boolean;
    uid: string;
} {
    if (input.startsWith('drive~')) {
        return {
            isForPhotos: false,
            uid: input.slice('drive~'.length),
        };
    } else if (input.startsWith('photos~')) {
        return {
            isForPhotos: true,
            uid: input.slice('photos~'.length),
        };
    }
    throw new ValidationError(`Invalid invitation UID: ${input}`);
}
