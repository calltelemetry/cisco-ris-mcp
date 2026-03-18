import { defineConfig } from 'vite';
import { resolve } from 'path';
import { builtinModules } from 'module';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: 'index',
    },
    rollupOptions: {
      external: [
        /^@modelcontextprotocol\//,
        'fast-xml-parser',
        'zod',
        ...builtinModules,
        ...builtinModules.map(m => `node:${m}`),
      ],
    },
    target: 'node18',
    sourcemap: true,
    outDir: 'build',
  },
});
