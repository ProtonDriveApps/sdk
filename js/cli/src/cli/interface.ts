import { ParseArgsConfig } from "util";
import { ProtonDriveClient } from "../../../sdk/src";
import { Account } from "../account/account";
import { Paths } from "./paths";

export interface Command {
    group: string;
    name: string;
    isAuthAction?: boolean;
    args?: string[];
    options?: ParseArgsConfig['options'];

    action: (args: ActionArgs) => Promise<void>;
}

export interface ActionArgs {
    account: Account;
    sdk: ProtonDriveClient;
    paths: Paths;
    args: string[];
    options: { [name: string]: any };
}
