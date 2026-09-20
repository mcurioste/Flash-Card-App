import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { defineConfig } from 'vite';

const legacyScripts = [
  'script.js',
  'study.js',
  'js/data/default-decks.js',
  'js/pages/contact-page.js',
  'js/pages/decks-page.js',
  'js/shared/deck-transfer.js',
  'js/shared/navigation.js',
  'js/storage/deck-storage.js'
];

function copyLegacyScripts() {
  return {
    name: 'copy-legacy-scripts',
    apply: 'build',
    async generateBundle() {
      await Promise.all(
        legacyScripts.map(async (fileName) => {
          this.emitFile({
            type: 'asset',
            fileName,
            source: await readFile(resolve(import.meta.dirname, fileName))
          });
        })
      );
    }
  };
}

export default defineConfig({
  base: './',
  plugins: [copyLegacyScripts()],
  build: {
    rollupOptions: {
      input: {
        home: resolve(import.meta.dirname, 'index.html'),
        decks: resolve(import.meta.dirname, 'decks.html'),
        study: resolve(import.meta.dirname, 'study.html'),
        contact: resolve(import.meta.dirname, 'contact.html')
      }
    }
  }
});
