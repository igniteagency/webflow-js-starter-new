import browserslistToEsbuild from 'browserslist-to-esbuild';
import { spawn } from 'child_process';
import esbuild from 'esbuild';
import fs from 'fs';

import { DEV_PORT, DEV_SERVER } from '$dev/config';

const DEV_BUILD_PATH = './dist/dev';
const PROD_BUILD_PATH = './dist/prod';
const production = process.env.NODE_ENV === 'production';
const productionTarget = browserslistToEsbuild('defaults');

const BUILD_DIRECTORY = !production ? DEV_BUILD_PATH : PROD_BUILD_PATH;

const files = [
  './src/entry.ts',
  './src/global.ts',
  './src/components/**/*.ts',
  './src/pages/**/*.ts',
];

const buildSettings = {
  entryPoints: files,
  bundle: true,
  outdir: BUILD_DIRECTORY,
  minify: !production ? false : true,
  sourcemap: !production,
  treeShaking: true,
  platform: 'browser',
  target: production ? productionTarget : 'esnext',
};

const deleteDirectoryContents = (dirPath) => {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true });
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

try {
  // Clean the build directory before starting the build
  deleteDirectoryContents(BUILD_DIRECTORY);

  if (!production) {
    let ctx = await esbuild.context(buildSettings);
    await ctx.watch();

    const httpServer = spawn(
      './node_modules/.bin/http-server',
      [BUILD_DIRECTORY, '-p', DEV_PORT.toString(), '-a', '::1', '--cors', '-s'],
      {
        stdio: 'pipe',
      }
    );

    console.log(`Serving at ${DEV_SERVER}`);

    process.on('SIGINT', () => {
      httpServer.kill();
      ctx.dispose();
      process.exit();
    });
  } else {
    console.log(productionTarget);
    esbuild.build(buildSettings);
  }
} catch (error) {
  console.error(error);
  process.exit(1);
}
