import glob from 'tiny-glob';

const DEV_BUILD_PATH = './dist/dev';
const PROD_BUILD_PATH = './dist';
const production = process.env.NODE_ENV === 'production';

const files = ['./src/*.ts', './src/components/*.ts', './src/pages/*.ts'];

const result = await Bun.build({
  entrypoints: (await Promise.all(files.map((pattern) => glob(pattern)))).flat(),
  outdir: !production ? DEV_BUILD_PATH : PROD_BUILD_PATH,
  sourcemap: !production ? 'external' : 'none',
  minify: !production ? false : true,
  bundle: true,
});

if (!result.success) {
  console.error('Build failed', result.logs);
}

if (!production) {
  const server = Bun.serve({
    port: 3000,
    development: true,
    fetch(req) {
      const filePath = BUILD_PATH + new URL(req.url).pathname;
      const file = Bun.file(filePath);
      return new Response(file);
    },
    error() {
      console.log('Error handler triggered');
      return new Response('File not found', { status: 404 });
    },
  });

  console.log(`Serving at http://localhost:${server.port}`);
}
