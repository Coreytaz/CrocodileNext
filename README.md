# CrocodileNext

Next.js Pages Router frontend for Crocodile. Requires Node.js 24.18.0 or newer and npm.

## Development

Run npm ci, then npm run dev. Open http://localhost:3000.
The backend is a separate project in ../crocodile-backend and listens on port 9999.
The current UI does not connect its room/chat buttons to the backend yet.

## Checks and production

- npm run lint: Oxlint; warnings fail the check.
- npm run typecheck: standalone TypeScript 7 CLI.
- npm run build: typecheck followed by the Next.js production build.
- npm start: serve the production build on port 3000.
- npm audit: dependency security report.

Always use npm run build for production. Built-in Next.js type validation is disabled because TypeScript 7 has a different programmatic API; standalone type checking runs first and must pass.

## Dependency upgrade

All direct dependency versions are pinned; package-lock.json pins the dependency tree. Use npm ci to reproduce it. Prettier, Tailwind CSS 4 and its PostCSS integration are development dependencies required for authoring/building.

Styles use Tailwind utility classes with Preflight enabled. The global CSS entry point is styles/globals.css, imported by pages/_app.tsx; postcss.config.mjs configures @tailwindcss/postcss. Shared button classes live in styles/button.ts. The game uses a two-column layout from 1024px; smaller screens show the canvas above the chat. Canvas drawing currently supports the mouse only.

ESLint and eslint-config-next were replaced with Oxlint to avoid the old plugin ecosystem's restrictions on current TypeScript and ESLint versions. Native React (including Hooks), Next.js, TypeScript, import and accessibility plugins are enabled. Correctness rules are errors, with explicit checks for all native Next.js rules, Hooks dependencies, image alternative text and ARIA usage. Next.js page links and synchronous scripts are errors, matching the core-web-vitals severity upgrades. Warnings also fail lint.

This is not an identical implementation of next/core-web-vitals: only native Oxlint rules run; unsupported ESLint rules and full React Compiler analysis are not implicitly enabled. Type checking remains a separate required check.

Canvas sizing is measured after mount with ResizeObserver; changing its dimensions clears the drawing, as with the native canvas element. Observer and mouse listeners are cleaned up on unmount.
