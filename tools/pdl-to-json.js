#!/usr/bin/env node

/**
 * PDL to JSON Converter
 * Converts PDL YAML files to JSON format optimized for simulation engines
 *
 * Usage: node pdl-to-json.js <pdl-file.yaml> [--output <file.json>] [--format <graph|flat>]
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, basename, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse as parseYaml } from 'yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Load and parse a YAML file
 */
function loadYamlFile(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const content = readFileSync(filePath, 'utf-8');
  return parseYaml(content);
}

/**
 * Parse duration string to days
 */
function parseDurationToDays(duration) {
  if (!duration) return null;

  const match = duration.match(/^(\d+)([dhwmy])$/);
  if (!match) return null;

  const value = parseInt(match[1], 10);
  const unit = match[2];

  const multipliers = {
    'h': 1/24,
    'd': 1,
    'w': 7,
    'm': 30,
    'y': 365
  };

  return value * (multipliers[unit] || 1);
}

/**
 * Parse percentage string to decimal
 */
function parsePercentage(pct) {
  if (!pct) return null;

  const match = pct.match(/^([+-]?\d+)%$/);
  if (!match) return null;

  return parseInt(match[1], 10) / 100;
}

/**
 * Convert PDL to flat JSON format
 * Simple object structure for easy processing
 */
function convertToFlatJson(pdl) {
  const result = {
    metadata: {
      pdl_version: pdl.pdl_version,
      scenario: { ...pdl.scenario },
      exported_at: new Date().toISOString()
    },
    entities: {},
    supply_chains: {},
    events: {},
    cascades: {}
  };

  // Index entities by ID
  if (pdl.entities) {
    for (const entity of pdl.entities) {
      result.entities[entity.id] = { ...entity };
    }
  }

  // Index supply chains by ID
  if (pdl.supply_chains) {
    for (const chain of pdl.supply_chains) {
      result.supply_chains[chain.id] = { ...chain };
    }
  }

  // Index events by ID with parsed values
  if (pdl.events) {
    for (const event of pdl.events) {
      const processed = { ...event };

      // Parse impact values
      if (event.impact) {
        processed.impact = {
          ...event.impact,
          supply_decimal: parsePercentage(event.impact.supply),
          demand_decimal: parsePercentage(event.impact.demand),
          price_decimal: parsePercentage(event.impact.price),
          duration_days: parseDurationToDays(event.impact.duration)
        };
      }

      result.events[event.id] = processed;
    }
  }

  // Index cascades by ID with parsed timeline
  if (pdl.cascades) {
    for (const cascade of pdl.cascades) {
      const processed = { ...cascade };

      // Parse timeline entries
      if (cascade.timeline) {
        processed.timeline = cascade.timeline.map(entry => ({
          ...entry,
          at_days: parseDurationToDays(entry.at)
        }));
      }

      result.cascades[cascade.id] = processed;
    }
  }

  return result;
}

/**
 * Convert PDL to graph JSON format
 * Optimized for network visualization and graph algorithms
 */
function convertToGraphJson(pdl) {
  const nodes = [];
  const edges = [];
  const nodeIndex = {};

  // Add scenario as root node
  if (pdl.scenario) {
    const scenarioNode = {
      id: `scenario:${pdl.scenario.id}`,
      type: 'scenario',
      label: pdl.scenario.name,
      data: { ...pdl.scenario }
    };
    nodes.push(scenarioNode);
    nodeIndex[scenarioNode.id] = scenarioNode;
  }

  // Add entity nodes
  if (pdl.entities) {
    for (const entity of pdl.entities) {
      const node = {
        id: `entity:${entity.id}`,
        type: 'entity',
        subtype: entity.type,
        label: entity.name,
        data: { ...entity }
      };
      nodes.push(node);
      nodeIndex[node.id] = node;

      // Edge to scenario
      if (pdl.scenario) {
        edges.push({
          id: `edge:scenario-${entity.id}`,
          source: `scenario:${pdl.scenario.id}`,
          target: node.id,
          type: 'contains'
        });
      }
    }
  }

  // Add supply chain edges
  if (pdl.supply_chains) {
    for (const chain of pdl.supply_chains) {
      // Chain node
      const chainNode = {
        id: `chain:${chain.id}`,
        type: 'supply_chain',
        label: chain.name || chain.id,
        data: { id: chain.id, name: chain.name }
      };
      nodes.push(chainNode);
      nodeIndex[chainNode.id] = chainNode;

      // Stage edges
      if (chain.stages) {
        chain.stages.forEach((stage, idx) => {
          const [from, to] = stage;
          edges.push({
            id: `edge:${chain.id}-stage-${idx}`,
            source: `entity:${from}`,
            target: `entity:${to}`,
            type: 'supply_flow',
            data: {
              chain_id: chain.id,
              sequence: idx + 1
            }
          });
        });
      }

      // Dependency edges
      if (chain.dependencies) {
        chain.dependencies.forEach((dep, idx) => {
          edges.push({
            id: `edge:${chain.id}-dep-${idx}`,
            source: `entity:${dep.from}`,
            target: `entity:${dep.to}`,
            type: 'dependency',
            data: {
              dependency_type: dep.type,
              criticality: dep.criticality
            }
          });
        });
      }
    }
  }

  // Add event nodes
  if (pdl.events) {
    for (const event of pdl.events) {
      const node = {
        id: `event:${event.id}`,
        type: 'event',
        subtype: event.type,
        label: event.name,
        data: {
          ...event,
          impact_parsed: event.impact ? {
            supply_decimal: parsePercentage(event.impact.supply),
            demand_decimal: parsePercentage(event.impact.demand),
            price_decimal: parsePercentage(event.impact.price),
            duration_days: parseDurationToDays(event.impact.duration)
          } : null
        }
      };
      nodes.push(node);
      nodeIndex[node.id] = node;

      // Trigger target edge
      if (event.trigger && event.trigger.target) {
        edges.push({
          id: `edge:${event.id}-trigger`,
          source: node.id,
          target: `entity:${event.trigger.target}`,
          type: 'triggers',
          data: {
            probability: event.trigger.probability,
            condition: event.trigger.condition
          }
        });
      }

      // Causes edges
      if (event.causes) {
        event.causes.forEach((causeId, idx) => {
          edges.push({
            id: `edge:${event.id}-causes-${idx}`,
            source: node.id,
            target: `event:${causeId}`,
            type: 'causes'
          });
        });
      }
    }
  }

  // Add cascade nodes
  if (pdl.cascades) {
    for (const cascade of pdl.cascades) {
      const node = {
        id: `cascade:${cascade.id}`,
        type: 'cascade',
        label: cascade.name || cascade.id,
        data: {
          id: cascade.id,
          name: cascade.name,
          probability: cascade.probability,
          validation: cascade.validation
        }
      };
      nodes.push(node);
      nodeIndex[node.id] = node;

      // Origin edge
      if (cascade.origin) {
        edges.push({
          id: `edge:${cascade.id}-origin`,
          source: `event:${cascade.origin}`,
          target: node.id,
          type: 'cascade_origin'
        });
      }

      // Timeline entries as sequence
      if (cascade.timeline) {
        let prevId = node.id;
        cascade.timeline.forEach((entry, idx) => {
          const entryNode = {
            id: `timeline:${cascade.id}-${idx}`,
            type: 'timeline_entry',
            label: `${entry.at}: ${entry.event}`,
            data: {
              ...entry,
              at_days: parseDurationToDays(entry.at),
              sequence: idx + 1
            }
          };
          nodes.push(entryNode);

          // Sequence edge
          edges.push({
            id: `edge:${cascade.id}-seq-${idx}`,
            source: prevId,
            target: entryNode.id,
            type: 'sequence',
            data: { at: entry.at }
          });

          // Affects edges
          if (entry.affects) {
            entry.affects.forEach(entityId => {
              edges.push({
                id: `edge:${cascade.id}-${idx}-affects-${entityId}`,
                source: entryNode.id,
                target: `entity:${entityId}`,
                type: 'affects'
              });
            });
          }

          prevId = entryNode.id;
        });
      }
    }
  }

  return {
    metadata: {
      pdl_version: pdl.pdl_version,
      scenario: pdl.scenario,
      exported_at: new Date().toISOString(),
      format: 'graph'
    },
    nodes,
    edges,
    stats: {
      total_nodes: nodes.length,
      total_edges: edges.length,
      entities: pdl.entities?.length || 0,
      supply_chains: pdl.supply_chains?.length || 0,
      events: pdl.events?.length || 0,
      cascades: pdl.cascades?.length || 0
    }
  };
}

/**
 * Convert PDL to simulation-optimized JSON
 * Pre-computed structures for fast simulation execution
 */
function convertToSimulationJson(pdl) {
  const flat = convertToFlatJson(pdl);

  // Build adjacency lists for fast traversal
  const entityAdjacency = {};
  const eventDependencies = {};
  const eventTriggers = {};

  // Initialize adjacency lists
  for (const entityId of Object.keys(flat.entities)) {
    entityAdjacency[entityId] = {
      upstream: [],
      downstream: [],
      dependencies: []
    };
  }

  // Build from supply chains
  for (const chain of Object.values(flat.supply_chains)) {
    if (chain.stages) {
      for (const [from, to] of chain.stages) {
        if (entityAdjacency[from]) {
          entityAdjacency[from].downstream.push({ target: to, chain: chain.id });
        }
        if (entityAdjacency[to]) {
          entityAdjacency[to].upstream.push({ source: from, chain: chain.id });
        }
      }
    }

    if (chain.dependencies) {
      for (const dep of chain.dependencies) {
        if (entityAdjacency[dep.from]) {
          entityAdjacency[dep.from].dependencies.push({
            target: dep.to,
            type: dep.type,
            criticality: dep.criticality
          });
        }
      }
    }
  }

  // Build event dependency graph
  for (const event of Object.values(flat.events)) {
    eventDependencies[event.id] = event.causes || [];

    if (event.trigger && event.trigger.target) {
      if (!eventTriggers[event.trigger.target]) {
        eventTriggers[event.trigger.target] = [];
      }
      eventTriggers[event.trigger.target].push({
        event_id: event.id,
        probability: event.trigger.probability,
        condition: event.trigger.condition
      });
    }
  }

  // Pre-compute cascade timelines in simulation-friendly format
  const cascadeTimelines = {};
  for (const cascade of Object.values(flat.cascades)) {
    cascadeTimelines[cascade.id] = {
      origin: cascade.origin,
      probability: cascade.probability,
      steps: (cascade.timeline || []).map(entry => ({
        day: entry.at_days,
        event: entry.event,
        impact: entry.impact,
        affects: entry.affects || []
      })).sort((a, b) => a.day - b.day)
    };
  }

  return {
    metadata: {
      pdl_version: pdl.pdl_version,
      scenario: pdl.scenario,
      exported_at: new Date().toISOString(),
      format: 'simulation'
    },
    entities: flat.entities,
    events: flat.events,
    // Pre-computed structures
    network: {
      entity_adjacency: entityAdjacency,
      event_dependencies: eventDependencies,
      event_triggers: eventTriggers
    },
    cascades: cascadeTimelines,
    stats: {
      entities: Object.keys(flat.entities).length,
      events: Object.keys(flat.events).length,
      cascades: Object.keys(cascadeTimelines).length
    }
  };
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
PDL to JSON Converter

Usage: node pdl-to-json.js <pdl-file.yaml> [options]

Options:
  --output, -o <file>    Output file (default: stdout)
  --format, -f <type>    Output format: flat, graph, simulation (default: flat)
  --pretty               Pretty-print JSON output
  --help, -h             Show this help message

Formats:
  flat         Simple indexed structure, entities/events/cascades by ID
  graph        Network format with nodes and edges, for visualization
  simulation   Pre-computed adjacency lists and timelines for simulation engines

Examples:
  node pdl-to-json.js scenarios/s1-soja.pdl.yaml
  node pdl-to-json.js scenarios/s1-soja.pdl.yaml -f graph -o output.json
  node pdl-to-json.js scenarios/s1-soja.pdl.yaml -f simulation --pretty
`);
    process.exit(0);
  }

  const inputFile = resolve(args[0]);
  let outputFile = null;
  let format = 'flat';
  let pretty = args.includes('--pretty');

  const outputIdx = args.findIndex(a => a === '--output' || a === '-o');
  if (outputIdx !== -1 && args[outputIdx + 1]) {
    outputFile = resolve(args[outputIdx + 1]);
  }

  const formatIdx = args.findIndex(a => a === '--format' || a === '-f');
  if (formatIdx !== -1 && args[formatIdx + 1]) {
    format = args[formatIdx + 1];
    if (!['flat', 'graph', 'simulation'].includes(format)) {
      console.error(`Unknown format: ${format}. Use flat, graph, or simulation.`);
      process.exit(1);
    }
  }

  try {
    const pdl = loadYamlFile(inputFile);

    let result;
    switch (format) {
      case 'graph':
        result = convertToGraphJson(pdl);
        break;
      case 'simulation':
        result = convertToSimulationJson(pdl);
        break;
      default:
        result = convertToFlatJson(pdl);
    }

    const jsonStr = pretty
      ? JSON.stringify(result, null, 2)
      : JSON.stringify(result);

    if (outputFile) {
      writeFileSync(outputFile, jsonStr, 'utf-8');
      console.error(`JSON written to: ${outputFile}`);
    } else {
      console.log(jsonStr);
    }

  } catch (e) {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  }
}

// Export for module use
export {
  convertToFlatJson,
  convertToGraphJson,
  convertToSimulationJson,
  loadYamlFile,
  parseDurationToDays,
  parsePercentage
};

// Run if called directly
main();
