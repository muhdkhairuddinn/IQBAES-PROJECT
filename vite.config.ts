import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');

  return {
    plugins: [react()],
    server: {
      proxy: {
        // Proxy API requests to the backend server
        '/api': {
          target: 'http://localhost:5000', // Updated to match backend dev port
          changeOrigin: true,
          secure: false,
          configure: (proxy, options) => {
            // Forward real client IP addresses to backend
            proxy.on('proxyReq', (proxyReq, req, res) => {
              // Get the real client IP from the original request
              const clientIp = req.socket?.remoteAddress || 
                               req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
                               req.connection?.remoteAddress;
              
              // Forward the client IP in X-Forwarded-For header
              if (clientIp) {
                const existingForwardedFor = req.headers['x-forwarded-for'];
                if (existingForwardedFor) {
                  // Append to existing X-Forwarded-For chain
                  proxyReq.setHeader('X-Forwarded-For', `${existingForwardedFor}, ${clientIp}`);
                } else {
                  // Set new X-Forwarded-For header
                  proxyReq.setHeader('X-Forwarded-For', clientIp);
                }
              }
              
              // Also set X-Real-IP as backup (some proxies prefer this)
              if (clientIp && !req.headers['x-real-ip']) {
                proxyReq.setHeader('X-Real-IP', clientIp);
              }
            });
            
            // Suppress connection errors when backend is not running
            // This reduces noise in the terminal when the backend server is offline
            proxy.on('error', (err, req, res) => {
              // Only suppress ECONNREFUSED errors (backend not running)
              // Log other errors as they might be important
              if (err.code === 'ECONNREFUSED' || err.message?.includes('ECONNREFUSED')) {
                // Silently ignore connection refused errors
                // The frontend will handle these gracefully
                return;
              }
              
              // Log other proxy errors
              console.error('Proxy error:', err);
            });
          },
        },
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom'],
          },
        },
      },
    },
    // PWA Configuration
    define: {
      __PWA_VERSION__: JSON.stringify(process.env.npm_package_version || '1.0.0'),
    },
  };
});