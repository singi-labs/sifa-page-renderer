import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/render.ts', 'src/style.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  splitting: false,
  target: 'es2022',
  minify: false,
  external: ['marked', '@singi-labs/sifa-sdk'],
});
