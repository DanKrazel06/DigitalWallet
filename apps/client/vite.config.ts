import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],
    server: {
      host: env.VITE_DEV_HOST,
      port: Number(env.VITE_DEV_PORT),
      proxy: {
        '/api': {
          target: env.VITE_API_TARGET,
          changeOrigin: true,
        },
      },
    },
  }
})
