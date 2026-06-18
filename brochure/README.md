# HedgeFund AI - Brochure Site

A static, public-facing landing page for HedgeFund AI. Built with React, TypeScript, and Vite. The palette is ported from the desktop app's design tokens (GitHub-dark surfaces, warm amber accent), so the site reads as part of the product.

It is a single page with these sections: hero, trust strip, features, the multi-agent debate, the Scorecard, providers, privacy, and get started. The product screenshots in `public/shots/` are real captures of the app.

## Local development

```bash
cd brochure
npm install
npm run dev
```

Dev server runs at `http://localhost:5175`.

## Build

```bash
npm run build      # outputs static files to dist/
npm run preview    # serves dist/ on http://localhost:8080
```

The `dist/` folder is a plain static site. It can be deployed to any static host.

## Deploy A: Cloudflare Pages (recommended, like the other brochures)

### Via the dashboard (Git integration, auto-deploys on push)

1. Cloudflare Dashboard, then Workers and Pages, then Create, then Pages, then Connect to Git.
2. Select the `rjsx197047/HedgeFund_AI` repository.
3. Build settings:
   - Framework preset: `None`
   - Root directory: `brochure`
   - Build command: `npm install && npm run build`
   - Build output directory: `dist`
4. Save and deploy. Cloudflare rebuilds on every push to `main` that touches `brochure/`.

### Via the CLI

```bash
cd brochure
npm install && npm run build
npx wrangler pages deploy dist --project-name=hedgefund-ai
```

### Custom domain

In the Pages project, go to Custom domains, add your domain, and point its DNS at Cloudflare. The site is then live at your domain over HTTPS.

## Deploy B: Railway (Docker)

The included `Dockerfile` builds the site with Node and serves the static `dist/` with nginx. Railway injects `$PORT` at runtime and the nginx entrypoint substitutes it automatically.

1. Railway Dashboard, then New Project, then Deploy from GitHub repo.
2. Pick `rjsx197047/HedgeFund_AI`.
3. In the service settings, set the Root Directory to `brochure`. Railway detects the `Dockerfile` and `railway.json`.
4. Deploy. Railway gives the service a public `*.up.railway.app` URL. Add a custom domain in the service Networking settings if you want one.

Run the container locally to verify:

```bash
cd brochure
docker build -t hedgefund-ai-brochure .
docker run -p 8080:8080 hedgefund-ai-brochure
# open http://localhost:8080
```

## Editing content

- Copy and structure: `src/components/*.tsx` (Hero, Features, Agents, Scorecard, Providers, Privacy, GetStarted, Footer).
- Colors and design tokens: the `:root` block at the top of `src/index.css`.
- Repository and contact links: `src/site.ts`.
- Product screenshots: `public/shots/`.

## Copy rules (inherited from the product)

Public-facing text avoids em-dashes and en-dashes (use commas, periods, parentheses, or colons) and never makes performance or investment claims. The site frames HedgeFund AI as an educational research and learning tool, not investment advice. Keep that posture when editing.

## Tech stack

- React 18, TypeScript, Vite 5
- lucide-react for icons
- Plain CSS with custom properties (no CSS framework)
- Zero analytics, zero tracking, zero external fonts
