#!/usr/bin/env bun

import path from 'node:path';
import { execFileSync } from 'node:child_process';

const GIT_ROOT = path.resolve(import.meta.dir, '../..');

let target = 'bun';
let entry = 'src/proton-drive.ts';

// Bundle only mode: build without the embedded Bun.
const bundleOnly = process.argv.includes('--bundle-only');
const argv = process.argv.filter(arg => arg !== '--bundle-only');

const arg2 = argv[2];
const arg3 = argv[3];

if (arg2?.endsWith('.ts') && arg3) {
    entry = arg2;
    target = arg3;
} else if (arg2?.endsWith('.ts')) {
    entry = arg2;
} else if (arg2) {
    target = arg2;
}

let outfileArchitecture = '';
if (target.startsWith('bun-')) {
    outfileArchitecture = '/' + target.slice(4);
}

const entryName = path.basename(entry).replace('.ts', '');
const outfile = `release${outfileArchitecture}/${entryName}${bundleOnly ? '.js' : ''}`;

const args = [
    'build',
    ...(bundleOnly ? [] : [
        '--compile',
        // Slower compile, bigger bundle size, faster execution.
        '--bytecode',
    ]),
    `--target=${target}`,
    // Use modern ESM format to allow await syntax in the entry file.
    '--format=esm',
    // Reduce bundle size (not much, the biggest part is the embedded Bun itself).
    '--minify',
    // Include source maps for readable stack traces.
    '--sourcemap=inline',
    '--define',
    `APP_VERSION=${JSON.stringify(`${process.env.CLI_APP_VERSION_NAME || 'external-drive-sdkclijs'}@${getVersion('cli') || '0.0.0'}`)}`,
    '--define',
    `SDK_VERSION=${JSON.stringify(`js@${getVersion('js')}`)}`,
    '--define',
    `SENTRY_DSN=${JSON.stringify(process.env.SENTRY_DSN)}`,
    entry,
    `--outfile=${outfile}`,
];

const proc = Bun.spawn(['bun', ...args], {
    stdio: ['inherit', 'inherit', 'inherit'],
    env: { ...process.env, NODE_ENV: 'production' },
});
const code = await proc.exited;
if (code !== 0) {
    process.exit(code);
}

/**
 * Returns version from environment variable if set,
 * otherwise from local git repository.
 * Returns undefined if no version can be determined.
 */
function getVersion(tagPrefix) {
    const envName = { cli: 'CLI_VERSION', js: 'JS_VERSION' }[tagPrefix];
    const envVersion = envName ? process.env[envName]?.trim() : undefined;
    if (envVersion) {
        return envVersion;
    }
    try {
        const shortHash = getShortHash();
        const semver = semverFromLatestTag(tagPrefix);
        return `${semver}+${shortHash}`;
    } catch (error) {
        console.warn(`Error getting version for ${tagPrefix}:`, error);
        return undefined;
    }
}

/**
 * Returns latest version (as x.y.z) from tags matching
 * `{tagPrefix}/vx.y.z`, or `0.0.0` if none.
 */
function semverFromLatestTag(tagPrefix) {
    const tags = git(['tag', '-l', `${tagPrefix}/v*`, '--sort=-v:refname']);
    const tag = tags.split('\n').find(Boolean);
    if (!tag) {
        console.warn(`No tag found for ${tagPrefix}`);
        return '0.0.0';
    }
    const prefixSlashV = `${tagPrefix}/v`;
    if (!tag.startsWith(prefixSlashV)) {
        console.warn(`No tag found for ${tagPrefix}`);
        return '0.0.0';
    }
    return tag.slice(prefixSlashV.length);
}

function getShortHash() {
    return git(['rev-parse', '--short', 'HEAD']);
}

function git(args) {
    return execFileSync('git', args, {
        encoding: 'utf8',
        cwd: GIT_ROOT,
        stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
}
