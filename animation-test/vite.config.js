import { defineConfig } from 'vite';
import { resolve } from 'node:path';
export default defineConfig({ build:{ rolldownOptions:{ input:{ animation:resolve(import.meta.dirname,'index.html'),resources:resolve(import.meta.dirname,'resources.html') } } } });
