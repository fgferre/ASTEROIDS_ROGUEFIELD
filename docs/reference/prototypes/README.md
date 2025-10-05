# Prototype Reference Pages

These standalone HTML pages document experiments and performance studies that inform the main Asteroids Roguefield codebase. They are **not** bundled with the production build, but remain useful as reproducible investigations or regression checks during development.

## Available prototypes
- **test-audio-optimization.html** – Exercises the audio system modules in isolation to benchmark pooling, batching and cache behaviour.
- **test-batch-rendering.html** – Stress-tests the canvas batch renderer and gradient cache utilities without running the entire game loop.
- **test.html** – Minimal smoke test used to verify that vanilla browser APIs and simple scripts load correctly.

## Requirements
- A modern desktop browser with ES module support.
- A static file server to avoid cross-origin issues when loading ES modules directly from the repository.

## How to run
1. From the repository root, install dependencies if you have not already: `npm install`.
2. Start a lightweight static server from the repository root, for example: `npx http-server -c-1 .` (any equivalent static server works).
3. Visit `http://localhost:8080/docs/reference/prototypes/<file-name>.html` in your browser.

Because the prototypes import modules straight from `src/`, they expect the same folder layout as the main project. Changes to those modules may require manual refreshes of the prototype pages to observe the impact.
