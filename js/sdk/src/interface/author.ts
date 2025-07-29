import { Result } from './result';

/**
 * Author with verification status.
 *
 * It can be either a string (email) or an anonymous user.
 *
 * If author cannot be verified, the result is failure with an error.
 * The client can still get claimed author from the error object, but
 * it must be used with caution.
 */
export type Author = Result<string | AnonymousUser, UnverifiedAuthorError>;

/**
 * Anonymous user. Used when user shares folder publicly and anonymous
 * users can access the folder and upload new files without being logged in.
 */
export type AnonymousUser = null;

/**
 * Unverified author.
 *
 * If author cannot be verified, the result is this object containing
 * the claimed author and the verification error.
 */
export type UnverifiedAuthorError = {
    claimedAuthor?: string;
    error: string;
};
