# [Directory Name] - Agent Guide

_Last updated: [PLACEHOLDER: YYYY-MM-DD]_

This guide documents [PLACEHOLDER: directory purpose statement].

---

## 1. Scope

This directory contains [PLACEHOLDER: high-level description].

**Primary Responsibilities:**
- [PLACEHOLDER: responsibility 1]
- [PLACEHOLDER: responsibility 2]
- [PLACEHOLDER: responsibility 3]

**Out of Scope:**
- [PLACEHOLDER: what doesn't belong here]
- [PLACEHOLDER: refer to other directories for X]

> **Example (replace with directory-specific content):**
> ````markdown
> ## 1. Scope
>
> This directory contains the core infrastructure layer that provides foundational services to all game systems.
>
> **Primary Responsibilities:**
> - Event bus for decoupled communication (`EventBus.js`)
> - Dependency injection and service registry (`DIContainer.js`, `ServiceRegistry.js`)
> - Game-wide constants and configuration (`GameConstants.js`)
> - Deterministic randomness (`RandomService.js`)
> - Object pooling and memory management (`ObjectPool.js`, `GamePools.js`)
>
> **Out of Scope:**
> - Game logic (see `/src/modules`)
> - Enemy-specific code (see `/src/modules/enemies`)
> - UI rendering (see `/src/modules/UISystem.js`)
> ````

---

## 2. Key Files

| File | Purpose | Notes |
|------|---------|-------|
| `[PLACEHOLDER: filename]` | [PLACEHOLDER: one-line description] | [PLACEHOLDER: size/hub status] |
| `[PLACEHOLDER: filename]` | [PLACEHOLDER: one-line description] | [PLACEHOLDER: size/hub status] |
| `[PLACEHOLDER: filename]` | [PLACEHOLDER: one-line description] | [PLACEHOLDER: size/hub status] |

> **Guidance:** List 3-8 files that define the directory. Include hub status (from `docs/architecture/DEPENDENCY_GRAPH.md`) and file size if >500 lines.
>
> **Example:**
> ````markdown
> ## 2. Key Files
>
> | File | Purpose | Notes |
> |------|---------|-------|
> | `GameConstants.js` | All game parameters, presets, and configuration | 1,771 lines, **HUB** (27 dependents) |
> | `EventBus.js` | Singleton event system for decoupled communication | **HUB** (used by all systems) |
> | `RandomService.js` | Deterministic RNG for reproducible gameplay | **HUB** (23 dependents) |
> | `DIContainer.js` | Dependency injection container | Core infrastructure |
> | `ServiceRegistry.js` | Service registration and lifecycle management | Consumes manifest |
> | `ServiceLocatorAdapter.js` | Legacy bridge for backward compatibility | **Deprecation path** |
> | `ObjectPool.js` | Generic object pooling for memory efficiency | Used by GamePools |
> | `GamePools.js` | Pre-configured pools for entities | Registered in manifest |
> ````

---

## 3. Patterns

### 3.1 [PLACEHOLDER: Pattern Name]

**When to use:** [PLACEHOLDER: use case]

**Structure:**
```javascript
// [PLACEHOLDER: minimal structure example - NO full implementation]
class Example {
  constructor(dependencies) {
    // Pattern structure here
  }
}
```

**Example in codebase:** See `[PLACEHOLDER: filename]` lines [PLACEHOLDER: line range]

> **Guidance:** Document 2-5 patterns used in this directory. Keep examples minimal and link to real files.
>
> **Example Pattern:**
> ````markdown
> ### 3.1 Singleton Export Pattern
>
> **When to use:** For shared infrastructure that must have exactly one instance (EventBus, ServiceLocator)
>
> **Structure:**
> ```javascript
> // Create instance
> const instance = new MyService();
>
> // Export singleton
> export default instance;
>
> // CRITICAL: No side effects during import
> // Initialize in bootstrap phase only
> ```
>
> **Example in codebase:** See `EventBus.js` lines 1-50
>
> **Anti-pattern:** Executing initialization logic during module import (breaks determinism)
> ````
>
> **Additional Example:**
> ````markdown
> ### 3.2 Service Registration Pattern
>
> **When to use:** When adding a new system or service to the game
>
> **Structure:**
> ```javascript
> // In serviceManifest.js
> export function createServiceManifest() {
>   return {
>     myService: {
>       factory: (deps) => new MyService(deps.eventBus, deps.randomService),
>       dependencies: ['eventBus', 'randomService']
>     }
>   };
> }
> ```
>
> **Example in codebase:** See `src/bootstrap/serviceManifest.js` lines 20-150
> ````
>
> ````markdown
> ### 3.3 Constants Organization Pattern
>
> **When to use:** When adding new game parameters or configuration
>
> **Structure:**
> ```javascript
> // In GameConstants.js
> export const MY_FEATURE = {
>   PARAM_1: value,
>   PARAM_2: value,
>   // Group related constants in objects
> };
> ```
>
> **Example in codebase:** See `GameConstants.js` lines 100-200 (ENEMY_TYPES), lines 500-600 (AUDIO)
>
> **Anti-pattern:** Hardcoding values in system files (creates "magic numbers")
> ````
>

---

## 4. Rules

### ❌ Rule 1: [PLACEHOLDER: Rule statement]

**Why:** [PLACEHOLDER: Consequence of breaking this rule]

**Example violation:**
```javascript
// BAD: [PLACEHOLDER: code showing violation]
```

**Correct approach:**
```javascript
// GOOD: [PLACEHOLDER: code showing correct way]
```

**Reference:** [PLACEHOLDER: link to relevant doc section]

> **Guidance:** Capture 3-7 critical rules. Include rationale, violation, and correct approach. Cite audit findings when relevant.
>
> **Example Rule:**
> ````markdown
> ### ❌ Rule 1: Never duplicate constants from GameConstants.js in system files
>
> **Why:** Creates maintenance burden and drift between "source of truth" and usage sites. Breaks data-driven architecture principle.
>
> **Example violation:**
> ```javascript
> // BAD: Hardcoding values that exist in GameConstants
> const ENEMY_SPEED = 2.5; // Already defined in GameConstants.ENEMY_TYPES.drone.speed
> ```
>
> **Correct approach:**
> ```javascript
> // GOOD: Import and use from GameConstants
> import { ENEMY_TYPES } from '../core/GameConstants.js';
> const speed = ENEMY_TYPES.drone.speed;
> ```
>
> **Reference:** `agents.md` §1 (Princípios Fundamentais - Dados Centralizados)
> ````
>
> ````markdown
> ### ❌ Rule 2: Never execute side effects during module import in EventBus.js or ServiceLocator.js
>
> **Why:** Breaks deterministic initialization order. Bootstrap phase must control when services activate.
>
> **Example violation:**
> ```javascript
> // BAD: Registering handlers during import
> import gameEvents from './EventBus.js';
> gameEvents.on('game-start', handler); // Executes immediately on import
> ```
>
> **Correct approach:**
> ```javascript
> // GOOD: Register in initialize() method
> class MySystem {
>   initialize() {
>     this.eventBus.on('game-start', this.handleGameStart.bind(this));
>   }
> }
> ```
>
> **Reference:** `agents.md` §9.2 (Arquivos Críticos - EventBus.js checklist)
> ````
>
> ````markdown
> ### ❌ Rule 3: Never import test files (tests/__helpers__, tests/__fixtures__) in src/ code
>
> **Why:** Test utilities are not part of production bundle. Creates circular dependencies and bloats build.
>
> **Example violation:**
> ```javascript
> // BAD: Importing test helper in production code
> import { createTestEnemy } from '../../tests/__helpers__/fixtures.js';
> ```
>
> **Correct approach:**
> ```javascript
> // GOOD: Use factory pattern from production code
> import { EnemyFactory } from './enemies/base/EnemyFactory.js';
> const enemy = factory.create('drone', config);
> ```
>
> **Reference:** `agents.md` §9.8 (Anti-padrões a Evitar)
> ````
>
> ````markdown
> ### ❌ Rule 4: Never modify ServiceLocator.js - use ServiceLocatorAdapter.js for legacy compatibility
>
> **Why:** ServiceLocator.js is frozen legacy code. ServiceLocatorAdapter.js is the bridge for migration to DI.
>
> **Correct approach:**
> - New systems: Use constructor injection via manifest
> - Legacy systems: Use `gameServices.get()` via adapter (temporary)
> - Migration: Replace `gameServices.get()` with constructor params over time
>
> **Reference:** `docs/audit-report.md` §4.1 (ServiceLocatorAdapter Usage Patterns)
> ````
>

---

## 5. Adding New [PLACEHOLDER: File/System/Component]

### Step-by-Step Guide

**Prerequisites:**
- [ ] [PLACEHOLDER: prerequisite 1]
- [ ] [PLACEHOLDER: prerequisite 2]
- [ ] [PLACEHOLDER: prerequisite 3]

**Steps:**

1. **[PLACEHOLDER: Step 1 title]**
   - [PLACEHOLDER: detailed instruction]
   - Example: See `[PLACEHOLDER: filename]` lines [PLACEHOLDER: range]

2. **[PLACEHOLDER: Step 2 title]**
   - [PLACEHOLDER: detailed instruction]
   - Example: See `[PLACEHOLDER: filename]` lines [PLACEHOLDER: range]

3. **[PLACEHOLDER: Step 3 title]**
   - [PLACEHOLDER: detailed instruction]
   - Example: See `[PLACEHOLDER: filename]` lines [PLACEHOLDER: range]

4. **[PLACEHOLDER: Step 4 title]**
   - [PLACEHOLDER: detailed instruction]

**Validation:**
- [ ] [PLACEHOLDER: validation check 1]
- [ ] [PLACEHOLDER: validation check 2]
- [ ] Run `npm run analyze:deps` to verify no cycles introduced
- [ ] Run `npm test` to verify no regressions

**Common Pitfalls:**
- ❌ [PLACEHOLDER: common mistake 1]
- ❌ [PLACEHOLDER: common mistake 2]

> **Example:**
> ````markdown
> ## 5. Adding New Core Service
>
> ### Step-by-Step Guide
>
> **Prerequisites:**
> - [ ] Service has clear single responsibility
> - [ ] Service dependencies are identified
> - [ ] Service does not duplicate existing functionality
>
> **Steps:**
>
> 1. **Create service file in `/src/core/`**
>    - File name: `MyService.js` (PascalCase)
>    - Export class or singleton depending on pattern
>    - Example: See `RandomService.js` (singleton), `DIContainer.js` (class)
>
> 2. **Register service in manifest**
>    - Edit `src/bootstrap/serviceManifest.js`
>    - Add entry to `createServiceManifest()` return object
>    - Declare dependencies explicitly
>    ```javascript
>    myService: {
>      factory: (deps) => new MyService(deps.eventBus),
>      dependencies: ['eventBus']
>    }
>    ```
>    - Example: See `serviceManifest.js` lines 50-80 (RandomService registration)
>
> 3. **Update ServiceRegistry if needed**
>    - Only if service requires special initialization order
>    - Edit `src/core/ServiceRegistry.js`
>    - Example: See `ServiceRegistry.js` lines 20-50
>
> 4. **Add constants to GameConstants.js if applicable**
>    - Group related constants in object
>    - Document purpose with comments
>    - Example: See `GameConstants.js` lines 100-150 (PHYSICS constants)
>
> 5. **Create test file**
>    - Create `tests/core/MyService.test.js`
>    - Use helpers from `tests/__helpers__/`
>    - Example: See `tests/core/RandomService.test.js`
>
> **Validation:**
> - [ ] Service registered in manifest with correct dependencies
> - [ ] Service accessible via DI in other systems
> - [ ] No side effects during module import
> - [ ] Test file created and passing
> - [ ] Run `npm run analyze:deps` to verify no cycles introduced
> - [ ] Run `npm test:core` to verify integration
> - [ ] Update `docs/architecture/DEPENDENCY_GRAPH.md` if service becomes hub (>10 dependents)
>
> **Common Pitfalls:**
> - ❌ Forgetting to declare dependencies in manifest (causes runtime errors)
> - ❌ Executing initialization logic during import (breaks determinism)
> - ❌ Creating circular dependencies (service A depends on B, B depends on A)
> - ❌ Not adding test file (violates Definition of Done)
> ````

---

## 6. References

### Related Documentation
- [PLACEHOLDER: Link to related doc] - [PLACEHOLDER: what it covers]
- [PLACEHOLDER: Link to related doc] - [PLACEHOLDER: what it covers]

### Other Agent Guides
- [PLACEHOLDER: Link to other agents.md] - [PLACEHOLDER: when to consult it]
- [PLACEHOLDER: Link to other agents.md] - [PLACEHOLDER: when to consult it]

### Architecture Documentation
- `docs/architecture/CURRENT_STRUCTURE.md` - Current system overview
- `docs/architecture/DEPENDENCY_GRAPH.md` - Dependency analysis and hubs
- `docs/architecture/MIGRATION_PLAN.md` - Future evolution plans

### Root Agent Guide
- `agents.md` §[PLACEHOLDER: section number] - [PLACEHOLDER: relevant section]
- `agents.md` §[PLACEHOLDER: section number] - [PLACEHOLDER: relevant section]

### Test Documentation
- `tests/README.md` - Complete test guide and helpers
- `tests/[PLACEHOLDER: directory]` - [PLACEHOLDER: related test suite]

> **Example:**
> ````markdown
> ## 6. References
>
> ### Related Documentation
> - `docs/architecture/CURRENT_STRUCTURE.md` §3 - Hub files and critical dependencies
> - `docs/architecture/DEPENDENCY_GRAPH.md` - Visual dependency graph and metrics
> - `docs/audit-report.md` §4.1 - ServiceLocatorAdapter usage patterns
>
> ### Other Agent Guides
> - `/src/bootstrap/agents.md` - Service manifest and bootstrap flow
> - `/src/modules/agents.md` - System patterns and lifecycle
> - `/src/services/agents.md` - Session and command queue services
>
> ### Architecture Documentation
> - `docs/architecture/CURRENT_STRUCTURE.md` - Current system overview
> - `docs/architecture/DEPENDENCY_GRAPH.md` - Dependency analysis and hubs
> - `docs/architecture/MIGRATION_PLAN.md` - Future evolution plans (Phase 6+)
> - `docs/plans/architecture-master-plan.md` - Long-term architectural roadmap
>
> ### Root Agent Guide
> - `agents.md` §1 - Core principles (data-driven, event-based, manifest-based)
> - `agents.md` §3 - Architecture overview and service patterns
> - `agents.md` §8 - Debug logging system (GameDebugLogger)
> - `agents.md` §9 - Dependency analysis and critical files
>
> ### Test Documentation
> - `tests/README.md` - Complete test guide and helpers
> - `tests/core/` - Test files for core infrastructure
> ````

---

## 7. Update Methodology

### When to Update This File

This file MUST be updated when:

- [ ] **New file added to this directory**
  - Add to §2 (Key Files) if critical (>500 lines or >5 dependents)
  - Update §5 (Adding New) if new pattern introduced
  
- [ ] **File removed from this directory**
  - Remove from §2 (Key Files)
  - Update §6 (References) if cross-references broken
  
- [ ] **New pattern introduced**
  - Add to §3 (Patterns) with example
  - Update §5 (Adding New) if pattern affects workflow
  
- [ ] **New rule identified** (from bug, code review, or audit)
  - Add to §4 (Rules) with rationale and example
  
- [ ] **Dependency graph changes** (file becomes hub or orphan)
  - Update §2 (Key Files) with hub status
  - Reference `docs/architecture/DEPENDENCY_GRAPH.md`
  
- [ ] **Architecture documentation updated**
  - Update §6 (References) with new links
  - Verify cross-references still valid

### Update Triggers by Phase

| Trigger | Update Section | Validation |
|---------|---------------|------------|
| New file added | §2 Key Files | File appears in dependency graph |
| File removed | §2 Key Files, §6 References | No broken links |
| New pattern | §3 Patterns, §5 Adding New | Pattern used in ≥2 files |
| New rule | §4 Rules | Rule prevents known issue |
| Hub status change | §2 Key Files | Confirmed in DEPENDENCY_GRAPH.md |
| Architecture change | §6 References | Links resolve correctly |

### Responsibility

**AI Agents (Codex, Claude Code, Traycer):**
- MUST update this file when making changes to files in this directory
- MUST verify all sections remain accurate after changes
- MUST run validation checklist before committing

**Human Developers:**
- Review agent updates for accuracy
- Add rules based on code review findings
- Update when architecture decisions change

### Validation Checklist

Before committing changes to this file, verify:

- [ ] All files in §2 (Key Files) exist in this directory
- [ ] All cross-references in §6 (References) resolve correctly
- [ ] All code examples in §3 (Patterns) and §4 (Rules) are syntactically valid
- [ ] All line number references are accurate
- [ ] Hub status in §2 matches `docs/architecture/DEPENDENCY_GRAPH.md`
- [ ] No duplication with root `agents.md` (check audit report §5 Content Placement Rules)
- [ ] File follows standard template structure (sections 1-7)
- [ ] Update date added to file header (optional: `Last updated: YYYY-MM-DD`)

### Preventing Staleness

**Automated Checks (Future - DOCS-006):**
- `npm run validate:agents-md` will verify:
  - All referenced files exist
  - All line number references are valid
  - Hub status matches dependency graph
  - No duplication with other docs

**Manual Review Triggers:**
- After every 5 PRs touching this directory
- After major refactoring (Phase 6+ migrations)
- Quarterly documentation audit

---

## Meta-Instructions for Agents Using This Template

**How to use this template:**

1. **Copy entire template** to new `agents.md` file in target directory
2. **Replace all `[PLACEHOLDER: ...]` markers** with actual content
3. **Delete sections that don't apply** (e.g., if no patterns exist yet, remove §3)
4. **Add directory-specific sections** if needed (e.g., §5.2 for second type of addition)
5. **Verify against audit report** §5 (Content Placement Rules) to avoid duplication
6. **Run validation checklist** in §7 before committing

**Content sources for filling placeholders:**

- **§1 Scope:** Read directory structure, file names, and imports to understand boundaries
- **§2 Key Files:** Check `docs/architecture/DEPENDENCY_GRAPH.md` for hub status and dependent counts
- **§3 Patterns:** Analyze existing files for repeated structures (constructors, exports, registration)
- **§4 Rules:** Reference `agents.md` §9.8 (Anti-padrões), audit report findings, and known bugs
- **§5 Adding New:** Follow existing file creation patterns, reference `docs/architecture/CURRENT_STRUCTURE.md`
- **§6 References:** Check audit report §5 for content placement, link to related `agents.md` files
- **§7 Update Methodology:** Use standard triggers from template, customize for directory specifics

**Quality checks:**

- ✅ No duplication with root `agents.md` (check audit report §2)
- ✅ No duplication with other `agents.md` files (check audit report §5)
- ✅ All cross-references resolve correctly
- ✅ All code examples are minimal (structure only, not full implementations)
- ✅ All rules have rationale and examples
- ✅ All patterns have codebase references
- ✅ File is <300 lines (if longer, content may belong in `/docs/architecture/`)

**Anti-patterns to avoid:**

- ❌ Copying content from root `agents.md` (use references instead)
- ❌ Documenting implementation details (focus on patterns and rules)
- ❌ Writing full code examples (show structure only)
- ❌ Duplicating test documentation (reference `tests/README.md`)
- ❌ Duplicating architecture docs (reference `/docs/architecture/`)
- ❌ Creating orphan sections (every section must have actionable content)

---

## Template Metadata

**Version:** 1.0  
**Created:** DOCS-002 (Documentation Restructure Initiative)  
**Purpose:** Standard template for distributed `agents.md` files  
**Usage:** DOCS-004 (core/bootstrap), DOCS-005 (modules/enemies/services)  
**Validation:** See `docs/audit-report.md` §5 (Content Placement Rules)  
**Maintenance:** Update this template if new sections or patterns emerge across multiple `agents.md` files
