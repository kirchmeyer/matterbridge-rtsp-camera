import { rm } from 'node:fs/promises';
import { build } from 'esbuild';

const matterbridgeSdk = {
  '@matter/general': 'matterbridge/matter',
  '@matter/main': 'matterbridge/matter',
  '@matter/types': 'matterbridge/matter/types',
  '@matter/types/common': 'matterbridge/matter/types',
};

function matterbridgeSdkPath(path) {
  if (path.startsWith('@matter/main/behaviors/')) return 'matterbridge/matter/behaviors';
  if (path.startsWith('@matter/main/devices/')) return 'matterbridge/matter/devices';
  if (path.startsWith('@matter/types/clusters/')) return 'matterbridge/matter/clusters';
  return matterbridgeSdk[path];
}

await rm('dist', { recursive: true, force: true });
await build({
  entryPoints: ['src/module.ts'],
  outfile: 'dist/module.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  plugins: [{
    name: 'matterbridge-sdk',
    setup(build) {
      build.onResolve({ filter: /^@matter\// }, args => ({
        path: matterbridgeSdkPath(args.path),
        external: true,
      }));
    },
  }],
  external: [
    'matterbridge',
    'matterbridge/*',
    '@homebridge/hap-nodejs',
    'ffmpeg-for-homebridge',
  ],
});