# REFACTOR-016 Validation Checklist

## Scope
Ensure no runtime or build references remain to the removed `ServiceLocator` and `ServiceLocatorAdapter` modules after the migration to `DIContainer`.

## Validation Steps
1. **Search for residual imports**
   - Run `rg "import.*ServiceLocator" src docs tests` and confirm zero matches.
   - Run `rg "import.*ServiceLocatorAdapter" src docs tests` and confirm zero matches.
   - Run `rg "from.*ServiceLocator" src docs tests` and confirm zero matches.

2. **Review `index.html`**
   - Confirm line 313 loads only `./core/EventBus.js`.
   - Ensure there are no `<script>` tags pointing to `ServiceLocator.js` or `ServiceLocatorAdapter.js`.

3. **Review `app.js`**
   - Confirm line 175 instantiates the `DIContainer` directly.
   - Ensure there are no imports or references to `ServiceLocator` or `ServiceLocatorAdapter`.

4. **Audit system registrations**
   - Inspect all modules under `src/modules/` and verify they rely on `BaseSystem` (which registers through `DIContainer`).
   - Ensure no system attempts to import or resolve the legacy `ServiceLocator` APIs.

## Acceptance Criteria
- ✅ Zero code or documentation references to `ServiceLocator.js`.
- ✅ Zero code or documentation references to `ServiceLocatorAdapter.js`.
- ✅ `index.html` loads only `EventBus.js` before `app.js`.
- ✅ `app.js` uses `DIContainer` directly for service registration.
- ✅ All systems depend on `BaseSystem`/`DIContainer` patterns rather than the removed ServiceLocator.

## References
- `src/index.html`
- `src/app.js`
- `src/core/BaseSystem.js`
- `docs/architecture/CURRENT_STRUCTURE.md` §12.13
