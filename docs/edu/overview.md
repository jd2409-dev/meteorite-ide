# Education web shell

The education shell is a lightweight web entrypoint that hosts a React-based layout optimised for notebook-first and sidebar-driven course experiences. It lives alongside the standard VS Code web workbench and can be accessed under the `/edu` route when the development server is running.

## Getting started

1. Install dependencies if you have not already:

   ```bash
   npm install
   ```

2. Build the TypeScript sources and bundle the education shell assets:

   ```bash
   npm run compile-edu-web
   ```

   The build produces an `out-edu-web/` folder containing the optimised bundle (`edu.web.main.js`) and styles that back the React entrypoint.

3. In a separate terminal, start the web server (for example, using the standard helper script):

   ```bash
   ./scripts/code-web.sh
   ```

4. Open a browser at [`http://localhost:8080/edu`](http://localhost:8080/edu) to load the education shell. The default VS Code workbench remains available at the root path (`/`).

## Iterating during development

- Run `npm run watch-edu` to keep the TypeScript compiler and bundler running in watch mode. The task recompiles and rebundles whenever files under `src/vs/edu/**` change.
- If you prefer using `deemon`, the helper `npm run watch-edud` command mirrors the pattern used by the existing watch scripts.

The education shell reuses the same server infrastructure as the default workbench, which means any changes to shared services or platform APIs continue to behave exactly as they do in the OSS build.

## Relationship to the existing workbench

The `/edu` surface is intentionally minimal today—it mounts a React `AppShell` with header, notebook placeholder, and sidebar hosts so that teams can wire notebook, assessment, or collaboration experiences without the chrome of the full workbench. The traditional VS Code workbench (`/`) remains unaffected and continues to be produced by `npm run compile-web` as before.
