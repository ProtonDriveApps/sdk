#!/usr/bin/env bun

import path from 'node:path';
import { execFileSync } from 'node:child_process';

const GIT_ROOT = path.resolve(import.meta.dir, '../../..');

const mode = process.argv[2] === 'internal' ? 'internal' : 'main';

const target = process.argv[3] || 'bun';
let outfileSuffix = '';
if (target.startsWith('bun-')) {
    outfileSuffix = '-' + target.slice(4);
}

const entry = mode === 'internal' ? 'src/internal-cli/proton-drive-internal.ts' : 'src/proton-drive.ts';
const outfile = mode === 'internal' ? 'release/proton-drive-internal' : 'release/proton-drive';

const args = [
    'build',
    '--compile',
    `--target=${target}`,
    // Slower compile, bigger bundle size, faster execution.
    '--bytecode',
    // Use modern ESM format to allow await syntax in the entry file.
    '--format=esm',
    // Reduce bundle size (not much, the biggest part is the embedded Bun itself).
    '--minify',
    // Include source maps for readable stack traces.
    '--sourcemap=inline',
    // Sharp requires a native module which we keep out of the bundle.
    // User must install sharp separately by installing the package
    // at the same directory as the CLI. The proton-drive CLI then must
    // load the user's package.json.
    '--external=sharp',
    '--compile-autoload-package-json',
    '--define',
    `APP_VERSION=${JSON.stringify(`${process.env.CLI_APP_VERSION_NAME || 'external-drive-sdkclijs'}@${getVersion('cli') || '0.0.0'}`)}`,
    '--define',
    `SDK_VERSION=${JSON.stringify(`js@${getVersion('js')}`)}`,
    entry,
    `--outfile=${outfile}${outfileSuffix}`,
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
