import { applyDefaultCliOptions } from '../cli';

import { CommandAuthLogin } from './auth/commandAuthLogin';
import { CommandAuthLogout } from './auth/commandAuthLogout';

export const COMMANDS = applyDefaultCliOptions([
    new CommandAuthLogin(),
    new CommandAuthLogout(),
]);
