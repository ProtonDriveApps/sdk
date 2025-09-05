import { c } from 'ttag';

import { ValidationError } from '../../../errors';

/**
 * Parse the token and password from the URL.
 *
 * The URL format is: https://drive.proton.me/urls/token#password
 *
 * @param url - The URL of the public link.
 * @returns The token and password.
 */
export function getTokenAndPasswordFromUrl(url: string): { token: string; password: string } {
    const urlObj = new URL(url);
    const token = urlObj.pathname.split('/').pop();
    const password = urlObj.hash.slice(1);

    if (!token || !password) {
        throw new ValidationError(c('Error').t`Invalid URL`);
    }

    return { token, password };
}
