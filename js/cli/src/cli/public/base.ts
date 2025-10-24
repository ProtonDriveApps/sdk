import { ParseArgsConfig } from 'util';

export const PUBLIC_OPTIONS: ParseArgsConfig['options'] = {
    url: {
        type: 'string',
        short: 'u',
    },
    'custom-password': {
        type: 'string',
        short: 'c',
        default: '',
    },
};
