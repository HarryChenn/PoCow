import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // GitHub Pages 项目站点路径：https://<user>.github.io/PoCow/
  base: '/PoCow/',
  plugins: [react()],
});
