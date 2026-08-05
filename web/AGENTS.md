# Web Repository Guidance

- This repository contains the standalone iTu Vite React application.
- Follow `../agent_docs/frontend_design_guidelines.md` and `../agent_docs/web_client_guidelines.md` for shared product design, interaction, accessibility, responsive behavior, and web implementation workflow.
- Use TypeScript strict mode, Tailwind CSS v3, shadcn/ui conventions, and the existing feature/shared structure.
- Reuse semantic tokens from `src/styles/app.css` and primitives from `src/shared/ui` before adding feature-local visual treatments or shared components.
- Keep authorization and ownership enforcement in the API, not in React components.
- Use Yarn Classic and keep `yarn.lock`; do not add `package-lock.json`.
- Keep API configuration in repository-local Vite environment variables.
- Add focused Vitest coverage for new behavior.
- Run `yarn typecheck`, `yarn test`, and `yarn build` for relevant changes.
