#!/usr/bin/env bun

const mode = process.argv[2] === 'internal' ? 'internal' : 'main';

const entry = mode === 'internal' ? 'src/internal-cli/proton-drive-internal.ts' : 'src/proton-drive.ts';
const outfile = mode === 'internal' ? 'release/proton-drive-internal' : 'release/proton-drive';

const args = [
    'build',
    entry,
    `--outfile=${outfile}`,
    '--compile',
    '--target=bun',
    '--minify',
    '--sourcemap=inline',
    // Sharp requires a native module which we keep out of the bundle.
    // User must install sharp separately by installing the package
    // at the same directory as the CLI. The proton-drive CLI then must
    // load the user's package.json.
    '--external=sharp',
    '--compile-autoload-package-json',
];

const proc = Bun.spawn(['bun', ...args], {
    stdio: ['inherit', 'inherit', 'inherit'],
    env: { ...process.env, NODE_ENV: 'production' },
});
const code = await proc.exited;
if (code !== 0) {
    process.exit(code);
}
