import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Adapts a Vercel-style handler (req.body is parsed, res has .status/.json)
// to a Connect/Vite middleware (raw Node req/res).
//
// loadHandler() is called on every request so HMR-ed handlers are always fresh.
// We use the Vite Environment Runner (Vite 6+ API) instead of the deprecated
// server.ssrLoadModule() which had a bug where errors were silently dropped and
// Vite's own 404 fallback would fire instead of our 500.
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
        if (res.headersSent) return
        res.statusCode = status
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(payload))
      }
      res.status = (s) => ({
        json: (p) => send(s, p),
        end: (p) => { if (!res.headersSent) { res.statusCode = s; res.end(p) } },
      })
      res.json = (p) => send(200, p)

      const handler = await loadHandler()
      if (typeof handler !== 'function') {
        throw new Error(`API handler resolved to ${typeof handler} instead of function`)
      }
      await handler(req, res)
      // Do NOT call next() — we own this route entirely.
    } catch (err) {
      console.error('[api middleware] error:', err)
      if (!res.headersSent) {
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: err.message }))
      }
      // Do NOT call next(err) — that causes Vite's 404 handler to fire.
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
          // Use Vite's Environment Runner (Vite 6+ non-deprecated API) to load
          // the Vercel-style API handlers in the SSR environment.
          const loadModule = async (relPath) => {
            const runner = server.environments?.ssr?.runner
            if (runner) {
              const mod = await runner.import(relPath)
              return mod.default
            }
            const mod = await server.ssrLoadModule(relPath)
            return mod.default
          }

          // Return a function so our routes are registered BEFORE Vite's own
          // middleware (static file server, transform, etc.). Without this,
          // Vite's stack can set res.headersSent=true before our handler runs.
          return () => {
            const routes = ['/api/claude', '/api/agent', '/api/invite', '/api/team']
            for (const route of routes) {
              server.middlewares.use(
                route,
                vercelStyleMiddleware(() => loadModule(`${route}.js`))
              )
            }
          }
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
