import { defineConfig } from 'vite';
import { resolve } from 'path';
import { builtinModules } from 'module';

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        sse: resolve(__dirname, 'src/sse.ts'),
        fetch: resolve(__dirname, 'src/fetch.ts'),
        server: resolve(__dirname, 'src/server.ts'),
        tools: resolve(__dirname, 'src/tools/index.ts'),
      },
      formats: ['es'],
    },
    rollupOptions: {
      external: [
        /^@modelcontextprotocol\//,
        'fast-xml-parser',
        'zod',
        ...builtinModules,
        ...builtinModules.map(m => `node:${m}`),
      ],
      output: {
        entryFileNames: '[name].js',
      },
    },
    target: 'node18',
    sourcemap: true,
    outDir: 'build',
  },
});
