# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PDL (PROVIDER Domain Language) is a YAML-based DSL for modeling supply chain disruption scenarios. It serves as "executable documentation" - human-readable for domain experts while machine-processable for knowledge graphs and simulation engines.

## Commands

```bash
# Validate a PDL scenario
node tools/pdl-validator.js scenarios/s1-soja.pdl.yaml

# Convert to RDF/Turtle (for knowledge graph)
node tools/pdl-to-rdf.js scenarios/s1-soja.pdl.yaml > output.ttl

# Convert to JSON (formats: flat, graph, simulation)
node tools/pdl-to-json.js scenarios/s1-soja.pdl.yaml -f simulation --pretty

# Load scenario for simulation
node src/index.js --scenario scenarios/s1-soja.pdl.yaml

# Run tests
npm test
```

## Architecture

### PDL Document Structure

```yaml
pdl_version: "1.0"
scenario:     # Metadata: id, name, sector, criticality
entities:     # Network nodes (manufacturer|commodity|infrastructure|service|region)
supply_chains: # Value chains with stages and dependencies
events:       # Disruption triggers with impact parameters
cascades:     # Timeline-based cascade effect sequences
```

### Data Flow

1. **PDL YAML** → `pdl-validator.js` validates against `schemas/pdl-schema.json`
2. **PDL YAML** → `pdl-to-rdf.js` → RDF/Turtle for SPARQL queries
3. **PDL YAML** → `pdl-to-json.js` → JSON for simulation engine
4. **PDL YAML** → `scenarioLoader.js` → Internal simulation format with pre-computed adjacency lists

### Key Modules

- `schemas/pdl-schema.json` - JSON Schema (draft-07) defining PDL structure
- `tools/pdl-validator.js` - Schema + semantic validation (entity refs, timeline consistency)
- `tools/pdl-to-rdf.js` - Exports entities/events/cascades as RDF triples with `pdl:` ontology
- `tools/pdl-to-json.js` - Three formats: `flat` (indexed), `graph` (nodes/edges), `simulation` (pre-computed)
- `src/adapters/scenarioLoader.js` - Converts PDL to simulation-ready format with parsed durations/percentages

### PDL Conventions

- IDs: lowercase with underscores (`brazil_farms`, `soy_to_eu_main`)
- Durations: number + unit (`90d`, `14d`, `2w`, `6m`)
- Percentages: signed with % (`-40%`, `+60%`)
- Entity types: `manufacturer`, `commodity`, `infrastructure`, `service`, `region`
- Event types: `natural_disaster`, `market_shock`, `infrastructure_failure`, `regulatory`, `geopolitical`, `pandemic`, `cyber_attack`
