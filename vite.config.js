import { defineConfig } from 'vite';
export default defineConfig({server:{proxy:{'/api/cfd':{target:'http://127.0.0.1:8008',changeOrigin:true}}}});
