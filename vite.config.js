import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Adapts a Vercel-style handler (req.body is parsed, res has .status/.json)
// to a Connect/Vite middleware (raw Node req/res).
function vercelStyleMiddleware(loadHandler) {
  return async (req, res, next) => {
    try {
      const chunks = []
      for await (const chunk of req) chunks.push(chunk)
      const raw = Buffer.concat(chunks).toString('utf8')
      try {
        req.body = raw ? JSON.parse(raw) : {}
      } catch {
        req.body = {}
      }

      const send = (status, payload) => {
        res.statusCode = status
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(payload))
      }
      res.status = (s) => ({
        json: (p) => send(s, p),
        end: (p) => { res.statusCode = s; res.end(p) },
      })
      res.json = (p) => send(200, p)

      const handler = await loadHandler()
      await handler(req, res)
    } catch (err) {
      console.error('[vite middleware] error:', err)
      if (!res.headersSent) {
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: err.message }))
      }
      next?.(err)
    }
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load all env vars (not just VITE_-prefixed) so the LD server SDK and
  // service-role keys are available to /api/agent during dev.
  const env = loadEnv(mode, process.cwd(), '')
  for (const k of Object.keys(env)) {
    if (process.env[k] === undefined) process.env[k] = env[k]
  }

  return {
    plugins: [
      react(),
      {
        name: 'api-routes',
        configureServer(server) {
          // Mount the same Vercel functions that run in production so dev and
          // prod share one code path for auth, origin checks, and model clamps.
          // Previously /api/claude was a raw Vite proxy to Anthropic, which
          // skipped api/claude.js entirely in dev.
          server.middlewares.use(
            '/api/agent',
            vercelStyleMiddleware(async () => {
              const mod = await server.ssrLoadModule('/api/agent.js')
              return mod.default
            })
          )
          server.middlewares.use(
            '/api/claude',
            vercelStyleMiddleware(async () => {
              const mod = await server.ssrLoadModule('/api/claude.js')
              return mod.default
            })
          )
        },
      },
    ],
    build: {
      rollupOptions: {
        // pg is a Node.js-only package used only in /scripts — keep it out of the browser bundle
        external: ['pg'],
      },
    },
  }
})
