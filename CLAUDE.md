# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PDL (PROVIDER Domain Language) is a YAML-based DSL for modeling supply chain disruption scenarios. It serves as "executable documentation" — human-readable for domain experts while machine-processable for knowledge graphs and simulation engines. The project has two independent runtimes: Node.js CLI tools for data processing and a browser-only frontend for interactive visualization.

- **Node.js >= 18.0.0** required (uses `node:test`, `node:assert`)
- **No linting/formatting/CI** configs — no eslint, prettier, or GitHub Actions
- ES modules throughout (`"type": "module"` in package.json)

## Commands

```bash
# Validate a PDL scenario
node tools/pdl-validator.js scenarios/s1-soja.pdl.yaml
# or: npm run validate -- scenarios/s1-soja.pdl.yaml

# Convert to RDF/Turtle (for knowledge graph)
node tools/pdl-to-rdf.js scenarios/s1-soja.pdl.yaml > output.ttl

# Convert to JSON (formats: flat, graph, simulation)
node tools/pdl-to-json.js scenarios/s1-soja.pdl.yaml -f simulation --pretty

# Load scenario for simulation
node src/index.js --scenario scenarios/s1-soja.pdl.yaml
node src/index.js -s scenarios/s1-soja.pdl.yaml --info   # metadata only
node src/index.js -s scenarios/s1-soja.pdl.yaml --json    # JSON output

# Run all tests (Node.js native test runner)
npm test

# Run a single test file
node --test test/graph-utils.test.js
node --test test/pdl-validator.test.js
node --test test/pdl-to-rdf.test.js

# Start web frontend (serve from repo root, not web/)
python3 -m http.server 8000
# Then open: http://localhost:8000/web/
```

## Architecture

### Dual-Mode System

The project has two separate runtimes that share no server communication:

```
PDL YAML Files (scenarios/*.pdl.yaml)
    │
    ├─→ Browser Frontend (web/)
    │   ├─ web/app.js          — Main UI logic, vis.js graph, filters, details panel
    │   ├─ web/graph-utils.js  — convertToGraphJson, shortestPath, parsers
    │   ├─ web/vendor/yaml/    — Bundled YAML parser (browser-compatible)
    │   └─ web/styles.css      — All styling (single file)
    │
    └─→ Node.js Tools (tools/ + src/)
        ├─ tools/pdl-validator.js    — Schema + semantic validation
        ├─ tools/pdl-to-rdf.js       — RDF/Turtle export (pdl: + coy: ontology)
        ├─ tools/pdl-to-json.js      — Three formats: flat, graph, simulation
        └─ src/adapters/scenarioLoader.js — Simulation-ready format with parsed values
```

### PDL Document Structure

```yaml
pdl_version: "1.0"
scenario:      # Metadata: id, name, sector, criticality
entities:      # Network nodes (manufacturer|commodity|infrastructure|service|region)
supply_chains: # Value chains with stages (flow edges) and dependencies
events:        # Disruption triggers with impact parameters and causes chains
cascades:      # Timeline-based cascade effect sequences with affects lists
```

### Web Frontend (web/)

`app.js` is a single-file application (~2350 lines) using ES modules. Key patterns:
- **Global `state` object** (line ~8) holds all application state: graph data, vis.js network, filter state, analysis results, validation results, UI state
- **Global `elements` object** (line ~84) holds all DOM references by ID — add new element refs here
- **`wireUI()`** (line ~1994) sets up all event listeners — add new wiring here
- **`applyFilters()`** (line ~445) is the central render loop: reads all filter states, computes visible nodes/edges, applies highlighting/dimming, updates vis.js DataSets
- **`buildNetwork(graph)`** (line ~1742) initializes vis.js with new data, creates filter checkboxes, sets up click handlers
- vis.js library loaded via CDN (`vis-network@9.1.2`)
- YAML parsing happens in-browser via vendored `yaml` package
- `graph-utils.js` is intentionally browser-compatible (ES6 modules, no Node.js APIs) so tests can import it directly

### Node.js Tools

- `schemas/pdl-schema.json` — JSON Schema (draft-07), single source of truth for PDL structure
- `src/adapters/scenarioLoader.js` — Core conversion logic: `parseDuration()`, `parsePercentage()`, `convertPdlToSimulation()`, builds adjacency lists
- `ontology/pdl-ontology.ttl` — Full OWL ontology (~700 lines) integrating with CoyPu (https://schema.coypu.org/global/2.3), defines 10+ classes (Scenario, Entity, Manufacturer, Commodity, etc.) with namespaces pdl:, pdlr:, coy:
- Duration/percentage parsing exists in both `scenarioLoader.js` and `web/graph-utils.js` (parallel implementations, must be kept in sync)

### Testing

Uses Node.js native `node:test` module with `node:assert/strict`. Tests live in `test/`. Tests import `web/graph-utils.js` directly (ES modules, no bundler needed). Three test files cover graph utils, PDL validation, and RDF conversion.

## PDL Conventions

- IDs: lowercase with underscores (`brazil_farms`, `soy_to_eu_main`)
- Durations: number + unit (`90d`, `14d`, `2w`, `6m`)
- Percentages: signed with % (`-40%`, `+60%`)
- Entity types: `manufacturer`, `commodity`, `infrastructure`, `service`, `region`
- Event types: `natural_disaster`, `market_shock`, `infrastructure_failure`, `regulatory`, `geopolitical`, `pandemic`, `cyber_attack`
- 9 scenarios in `scenarios/` covering supply chains from semiconductors to submarine cables
- Scenario documentation in `scenarios/PROVIDER-Szenarien-Dokumentation.md` (reference for domain context)
- All quantitative values include `reference:` fields citing sources (CONAB, Destatis, USGS, etc.)
