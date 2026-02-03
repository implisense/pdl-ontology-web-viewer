#!/usr/bin/env node

/**
 * PDL to RDF/Turtle Converter
 * Converts PDL YAML files to RDF/Turtle format for Knowledge Graph integration
 *
 * Usage: node pdl-to-rdf.js <pdl-file.yaml> [--output <file.ttl>]
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, basename, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse as parseYaml } from 'yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// RDF Namespaces
const NAMESPACES = {
  pdl: 'https://provider-project.org/ontology/pdl#',
  pdlr: 'https://provider-project.org/resource/',
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
  xsd: 'http://www.w3.org/2001/XMLSchema#',
  owl: 'http://www.w3.org/2002/07/owl#',
  skos: 'http://www.w3.org/2004/02/skos/core#',
  dcterms: 'http://purl.org/dc/terms/',
  geo: 'http://www.w3.org/2003/01/geo/wgs84_pos#'
};

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
 * Escape string for Turtle literal
 */
function escapeTurtleString(str) {
  if (str === undefined || str === null) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

/**
 * Convert ID to valid IRI local name
 */
function toIriLocalName(id) {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * Convert PDL to RDF/Turtle
 */
function convertToTurtle(pdl) {
  const lines = [];

  // Prefixes
  lines.push('# PDL to RDF/Turtle Export');
  lines.push(`# Generated: ${new Date().toISOString()}`);
  lines.push('');

  for (const [prefix, uri] of Object.entries(NAMESPACES)) {
    lines.push(`@prefix ${prefix}: <${uri}> .`);
  }
  lines.push('');

  // Scenario
  if (pdl.scenario) {
    const scenarioUri = `pdlr:scenario_${toIriLocalName(pdl.scenario.id)}`;
    lines.push(`# Scenario: ${pdl.scenario.name}`);
    lines.push(`${scenarioUri} a pdl:Scenario ;`);
    lines.push(`    dcterms:identifier "${escapeTurtleString(pdl.scenario.id)}" ;`);
    lines.push(`    rdfs:label "${escapeTurtleString(pdl.scenario.name)}" ;`);
    lines.push(`    pdl:sector "${escapeTurtleString(pdl.scenario.sector)}" ;`);
    lines.push(`    pdl:criticality pdl:Criticality_${pdl.scenario.criticality} ;`);
    if (pdl.scenario.description) {
      lines.push(`    dcterms:description "${escapeTurtleString(pdl.scenario.description)}" ;`);
    }
    lines.push(`    pdl:pdlVersion "${pdl.pdl_version}" .`);
    lines.push('');
  }

  // Entities
  if (pdl.entities && pdl.entities.length > 0) {
    lines.push('# ========== Entities ==========');
    lines.push('');

    for (const entity of pdl.entities) {
      const entityUri = `pdlr:entity_${toIriLocalName(entity.id)}`;
      const typeClass = `pdl:${entity.type.charAt(0).toUpperCase() + entity.type.slice(1)}`;

      lines.push(`${entityUri} a ${typeClass} ;`);
      lines.push(`    dcterms:identifier "${escapeTurtleString(entity.id)}" ;`);
      lines.push(`    rdfs:label "${escapeTurtleString(entity.name)}" ;`);
      lines.push(`    pdl:sector "${escapeTurtleString(entity.sector)}" ;`);

      if (entity.location) {
        lines.push(`    pdl:location "${escapeTurtleString(entity.location)}" ;`);
      }

      if (entity.vulnerability !== undefined) {
        lines.push(`    pdl:vulnerability "${entity.vulnerability}"^^xsd:decimal ;`);
      }

      // Link to scenario
      if (pdl.scenario) {
        lines.push(`    pdl:partOfScenario pdlr:scenario_${toIriLocalName(pdl.scenario.id)} ;`);
      }

      // Remove trailing semicolon and add period
      const lastLine = lines.pop();
      lines.push(lastLine.replace(/ ;$/, ' .'));
      lines.push('');
    }
  }

  // Supply Chains
  if (pdl.supply_chains && pdl.supply_chains.length > 0) {
    lines.push('# ========== Supply Chains ==========');
    lines.push('');

    for (const chain of pdl.supply_chains) {
      const chainUri = `pdlr:chain_${toIriLocalName(chain.id)}`;

      lines.push(`${chainUri} a pdl:SupplyChain ;`);
      lines.push(`    dcterms:identifier "${escapeTurtleString(chain.id)}" ;`);

      if (chain.name) {
        lines.push(`    rdfs:label "${escapeTurtleString(chain.name)}" ;`);
      }

      // Link to scenario
      if (pdl.scenario) {
        lines.push(`    pdl:partOfScenario pdlr:scenario_${toIriLocalName(pdl.scenario.id)} ;`);
      }

      const lastLine = lines.pop();
      lines.push(lastLine.replace(/ ;$/, ' .'));
      lines.push('');

      // Stages as separate connections
      if (chain.stages) {
        chain.stages.forEach((stage, idx) => {
          const [from, to] = stage;
          const connectionUri = `pdlr:connection_${toIriLocalName(chain.id)}_${idx + 1}`;

          lines.push(`${connectionUri} a pdl:SupplyChainConnection ;`);
          lines.push(`    pdl:sequence ${idx + 1} ;`);
          lines.push(`    pdl:fromEntity pdlr:entity_${toIriLocalName(from)} ;`);
          lines.push(`    pdl:toEntity pdlr:entity_${toIriLocalName(to)} ;`);
          lines.push(`    pdl:belongsToChain ${chainUri} .`);
          lines.push('');
        });
      }

      // Dependencies
      if (chain.dependencies) {
        chain.dependencies.forEach((dep, idx) => {
          const depUri = `pdlr:dependency_${toIriLocalName(chain.id)}_${idx + 1}`;

          lines.push(`${depUri} a pdl:Dependency ;`);
          lines.push(`    pdl:fromEntity pdlr:entity_${toIriLocalName(dep.from)} ;`);
          lines.push(`    pdl:toEntity pdlr:entity_${toIriLocalName(dep.to)} ;`);
          lines.push(`    pdl:dependencyType "${escapeTurtleString(dep.type)}" ;`);

          if (dep.criticality) {
            lines.push(`    pdl:criticality pdl:Criticality_${dep.criticality} ;`);
          }

          lines.push(`    pdl:belongsToChain ${chainUri} .`);
          lines.push('');
        });
      }
    }
  }

  // Events
  if (pdl.events && pdl.events.length > 0) {
    lines.push('# ========== Events ==========');
    lines.push('');

    for (const event of pdl.events) {
      const eventUri = `pdlr:event_${toIriLocalName(event.id)}`;
      const typeClass = `pdl:Event_${event.type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')}`;

      lines.push(`${eventUri} a pdl:Event, ${typeClass} ;`);
      lines.push(`    dcterms:identifier "${escapeTurtleString(event.id)}" ;`);
      lines.push(`    rdfs:label "${escapeTurtleString(event.name)}" ;`);
      lines.push(`    pdl:eventType "${escapeTurtleString(event.type)}" ;`);

      // Trigger
      if (event.trigger) {
        lines.push(`    pdl:triggerTarget pdlr:entity_${toIriLocalName(event.trigger.target)} ;`);

        if (event.trigger.probability !== undefined) {
          lines.push(`    pdl:triggerProbability "${event.trigger.probability}"^^xsd:decimal ;`);
        }

        if (event.trigger.condition) {
          lines.push(`    pdl:triggerCondition "${escapeTurtleString(event.trigger.condition)}" ;`);
        }
      }

      // Impact
      if (event.impact) {
        if (event.impact.supply) {
          lines.push(`    pdl:impactSupply "${escapeTurtleString(event.impact.supply)}" ;`);
        }
        if (event.impact.demand) {
          lines.push(`    pdl:impactDemand "${escapeTurtleString(event.impact.demand)}" ;`);
        }
        if (event.impact.price) {
          lines.push(`    pdl:impactPrice "${escapeTurtleString(event.impact.price)}" ;`);
        }
        if (event.impact.duration) {
          lines.push(`    pdl:impactDuration "${escapeTurtleString(event.impact.duration)}" ;`);
        }
      }

      // Causes
      if (event.causes && event.causes.length > 0) {
        const causesUris = event.causes.map(c => `pdlr:event_${toIriLocalName(c)}`).join(', ');
        lines.push(`    pdl:causes ${causesUris} ;`);
      }

      // Reference
      if (event.reference) {
        lines.push(`    dcterms:source "${escapeTurtleString(event.reference)}" ;`);
      }

      // Link to scenario
      if (pdl.scenario) {
        lines.push(`    pdl:partOfScenario pdlr:scenario_${toIriLocalName(pdl.scenario.id)} ;`);
      }

      const lastLine = lines.pop();
      lines.push(lastLine.replace(/ ;$/, ' .'));
      lines.push('');
    }
  }

  // Cascades
  if (pdl.cascades && pdl.cascades.length > 0) {
    lines.push('# ========== Cascades ==========');
    lines.push('');

    for (const cascade of pdl.cascades) {
      const cascadeUri = `pdlr:cascade_${toIriLocalName(cascade.id)}`;

      lines.push(`${cascadeUri} a pdl:Cascade ;`);
      lines.push(`    dcterms:identifier "${escapeTurtleString(cascade.id)}" ;`);

      if (cascade.name) {
        lines.push(`    rdfs:label "${escapeTurtleString(cascade.name)}" ;`);
      }

      lines.push(`    pdl:originEvent pdlr:event_${toIriLocalName(cascade.origin)} ;`);

      if (cascade.probability !== undefined) {
        lines.push(`    pdl:probability "${cascade.probability}"^^xsd:decimal ;`);
      }

      // Validation reference
      if (cascade.validation) {
        if (cascade.validation.reference) {
          lines.push(`    dcterms:source "${escapeTurtleString(cascade.validation.reference)}" ;`);
        }
        if (cascade.validation.confidence !== undefined) {
          lines.push(`    pdl:validationConfidence "${cascade.validation.confidence}"^^xsd:decimal ;`);
        }
      }

      // Link to scenario
      if (pdl.scenario) {
        lines.push(`    pdl:partOfScenario pdlr:scenario_${toIriLocalName(pdl.scenario.id)} ;`);
      }

      const lastLine = lines.pop();
      lines.push(lastLine.replace(/ ;$/, ' .'));
      lines.push('');

      // Timeline entries
      if (cascade.timeline) {
        cascade.timeline.forEach((entry, idx) => {
          const entryUri = `pdlr:timeline_${toIriLocalName(cascade.id)}_${idx + 1}`;

          lines.push(`${entryUri} a pdl:TimelineEntry ;`);
          lines.push(`    pdl:sequence ${idx + 1} ;`);
          lines.push(`    pdl:atTime "${escapeTurtleString(entry.at)}" ;`);
          lines.push(`    pdl:timelineEvent "${escapeTurtleString(entry.event)}" ;`);
          lines.push(`    pdl:belongsToCascade ${cascadeUri} ;`);

          // Impact
          if (entry.impact) {
            if (entry.impact.sector) {
              lines.push(`    pdl:impactSector "${escapeTurtleString(entry.impact.sector)}" ;`);
            }
            if (entry.impact.severity) {
              lines.push(`    pdl:impactSeverity pdl:Severity_${entry.impact.severity} ;`);
            }
          }

          // Affects
          if (entry.affects && entry.affects.length > 0) {
            const affectsUris = entry.affects.map(a => `pdlr:entity_${toIriLocalName(a)}`).join(', ');
            lines.push(`    pdl:affects ${affectsUris} ;`);
          }

          const lastLine = lines.pop();
          lines.push(lastLine.replace(/ ;$/, ' .'));
          lines.push('');
        });
      }
    }
  }

  // Ontology classes (for completeness)
  lines.push('# ========== Ontology Definitions ==========');
  lines.push('');
  lines.push('pdl:Scenario a owl:Class ;');
  lines.push('    rdfs:label "Scenario" .');
  lines.push('');
  lines.push('pdl:Entity a owl:Class ;');
  lines.push('    rdfs:label "Entity" .');
  lines.push('');
  lines.push('pdl:Manufacturer rdfs:subClassOf pdl:Entity .');
  lines.push('pdl:Commodity rdfs:subClassOf pdl:Entity .');
  lines.push('pdl:Infrastructure rdfs:subClassOf pdl:Entity .');
  lines.push('pdl:Service rdfs:subClassOf pdl:Entity .');
  lines.push('pdl:Region rdfs:subClassOf pdl:Entity .');
  lines.push('');
  lines.push('pdl:SupplyChain a owl:Class ;');
  lines.push('    rdfs:label "Supply Chain" .');
  lines.push('');
  lines.push('pdl:Event a owl:Class ;');
  lines.push('    rdfs:label "Event" .');
  lines.push('');
  lines.push('pdl:Cascade a owl:Class ;');
  lines.push('    rdfs:label "Cascade" .');
  lines.push('');
  lines.push('pdl:Criticality_high a pdl:Criticality .');
  lines.push('pdl:Criticality_medium a pdl:Criticality .');
  lines.push('pdl:Criticality_low a pdl:Criticality .');
  lines.push('');
  lines.push('pdl:Severity_critical a pdl:Severity .');
  lines.push('pdl:Severity_high a pdl:Severity .');
  lines.push('pdl:Severity_medium a pdl:Severity .');
  lines.push('pdl:Severity_low a pdl:Severity .');

  return lines.join('\n');
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
PDL to RDF/Turtle Converter

Usage: node pdl-to-rdf.js <pdl-file.yaml> [options]

Options:
  --output, -o <file>    Output file (default: stdout)
  --help, -h             Show this help message

Examples:
  node pdl-to-rdf.js scenarios/s1-soja.pdl.yaml
  node pdl-to-rdf.js scenarios/s1-soja.pdl.yaml -o output.ttl
`);
    process.exit(0);
  }

  const inputFile = resolve(args[0]);
  let outputFile = null;

  const outputIdx = args.findIndex(a => a === '--output' || a === '-o');
  if (outputIdx !== -1 && args[outputIdx + 1]) {
    outputFile = resolve(args[outputIdx + 1]);
  }

  try {
    const pdl = loadYamlFile(inputFile);
    const turtle = convertToTurtle(pdl);

    if (outputFile) {
      writeFileSync(outputFile, turtle, 'utf-8');
      console.error(`RDF/Turtle written to: ${outputFile}`);
    } else {
      console.log(turtle);
    }

  } catch (e) {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  }
}

// Export for module use
export { convertToTurtle, loadYamlFile };

// Run if called directly
main();
