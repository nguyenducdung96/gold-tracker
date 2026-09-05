# V7.1 changes

- Pages + separate Worker merged into one Cloudflare Worker project.
- Worker serves `apps/web/dist` through Workers Static Assets.
- API remains under `/api/*` on the same origin.
- D1 remains bound as `DB`.
- CORS configuration removed.
- Frontend uses same-origin API in production.
- Root `wrangler.jsonc` is the single Cloudflare deployment config.
- GitHub/Cloudflare Workers Builds is the recommended production workflow.
- Local npm/wrangler is optional and only needed for local debugging.
