#!/usr/bin/env node

/**
 * PDL Validator
 * Validates PDL YAML files against the PDL JSON Schema
 *
 * Usage: node pdl-validator.js <pdl-file.yaml> [--verbose]
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse as parseYaml } from 'yaml';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Color codes for terminal output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logError(message) {
  log(`ERROR: ${message}`, 'red');
}

function logSuccess(message) {
  log(`SUCCESS: ${message}`, 'green');
}

function logWarning(message) {
  log(`WARNING: ${message}`, 'yellow');
}

function logInfo(message) {
  log(`INFO: ${message}`, 'blue');
}

/**
 * Load and parse a YAML file
 */
function loadYamlFile(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const content = readFileSync(filePath, 'utf-8');
  try {
    return parseYaml(content);
  } catch (e) {
    throw new Error(`YAML parsing error: ${e.message}`);
  }
}

/**
 * Load the PDL schema
 */
function loadSchema() {
  const schemaPath = resolve(__dirname, '../schemas/pdl-schema.json');
  if (!existsSync(schemaPath)) {
    throw new Error(`Schema not found: ${schemaPath}`);
  }

  const content = readFileSync(schemaPath, 'utf-8');
  return JSON.parse(content);
}

/**
 * Validate entity references
 * Checks that all referenced entity IDs exist
 */
function validateEntityReferences(pdl, verbose) {
  const errors = [];
  const warnings = [];

  // Collect all entity IDs
  const entityIds = new Set();
  if (pdl.entities) {
    pdl.entities.forEach(e => entityIds.add(e.id));
  }

  // Check supply chain references
  if (pdl.supply_chains) {
    pdl.supply_chains.forEach(chain => {
      if (chain.stages) {
        chain.stages.forEach((stage, idx) => {
          stage.forEach(entityId => {
            if (!entityIds.has(entityId)) {
              warnings.push(`Supply chain "${chain.id}" stage ${idx + 1} references unknown entity: "${entityId}"`);
            }
          });
        });
      }

      if (chain.dependencies) {
        chain.dependencies.forEach(dep => {
          if (!entityIds.has(dep.from)) {
            warnings.push(`Supply chain "${chain.id}" dependency references unknown "from" entity: "${dep.from}"`);
          }
          if (!entityIds.has(dep.to)) {
            warnings.push(`Supply chain "${chain.id}" dependency references unknown "to" entity: "${dep.to}"`);
          }
        });
      }
    });
  }

  // Check event references
  const eventIds = new Set();
  if (pdl.events) {
    pdl.events.forEach(e => eventIds.add(e.id));

    pdl.events.forEach(event => {
      if (event.trigger && event.trigger.target) {
        if (!entityIds.has(event.trigger.target)) {
          warnings.push(`Event "${event.id}" trigger references unknown entity: "${event.trigger.target}"`);
        }
      }

      if (event.causes) {
        event.causes.forEach(causeId => {
          if (!eventIds.has(causeId)) {
            warnings.push(`Event "${event.id}" causes unknown event: "${causeId}"`);
          }
        });
      }
    });
  }

  // Check cascade references
  if (pdl.cascades) {
    pdl.cascades.forEach(cascade => {
      if (cascade.origin && !eventIds.has(cascade.origin)) {
        warnings.push(`Cascade "${cascade.id}" references unknown origin event: "${cascade.origin}"`);
      }

      if (cascade.timeline) {
        cascade.timeline.forEach((entry, idx) => {
          if (entry.affects) {
            entry.affects.forEach(entityId => {
              if (!entityIds.has(entityId)) {
                warnings.push(`Cascade "${cascade.id}" timeline entry ${idx + 1} affects unknown entity: "${entityId}"`);
              }
            });
          }
        });
      }
    });
  }

  return { errors, warnings };
}

/**
 * Validate timeline consistency
 * Checks that timeline entries are in chronological order
 */
function validateTimelineConsistency(pdl, verbose) {
  const warnings = [];

  function parseDuration(duration) {
    const match = duration.match(/^(\d+)([dhwmy])$/);
    if (!match) return 0;

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

  if (pdl.cascades) {
    pdl.cascades.forEach(cascade => {
      if (cascade.timeline && cascade.timeline.length > 1) {
        let lastTime = -1;
        cascade.timeline.forEach((entry, idx) => {
          const currentTime = parseDuration(entry.at);
          if (currentTime < lastTime) {
            warnings.push(`Cascade "${cascade.id}" timeline entry ${idx + 1} (${entry.at}) comes before entry ${idx} (previous was ${lastTime}d)`);
          }
          lastTime = currentTime;
        });
      }
    });
  }

  return { warnings };
}

/**
 * Validate duplicate IDs
 */
function validateUniqueIds(pdl, verbose) {
  const errors = [];

  function checkDuplicates(items, type) {
    if (!items) return;
    const seen = new Set();
    items.forEach(item => {
      if (seen.has(item.id)) {
        errors.push(`Duplicate ${type} ID: "${item.id}"`);
      }
      seen.add(item.id);
    });
  }

  checkDuplicates(pdl.entities, 'entity');
  checkDuplicates(pdl.supply_chains, 'supply_chain');
  checkDuplicates(pdl.events, 'event');
  checkDuplicates(pdl.cascades, 'cascade');

  return { errors };
}

/**
 * Main validation function
 */
async function validate(filePath, verbose = false) {
  const results = {
    valid: true,
    schemaErrors: [],
    semanticErrors: [],
    warnings: [],
    stats: {}
  };

  try {
    // Load PDL file
    if (verbose) logInfo(`Loading PDL file: ${filePath}`);
    const pdl = loadYamlFile(filePath);

    // Load schema
    if (verbose) logInfo('Loading PDL schema...');
    const schema = loadSchema();

    // Schema validation
    if (verbose) logInfo('Validating against JSON schema...');
    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);

    const validateSchema = ajv.compile(schema);
    const schemaValid = validateSchema(pdl);

    if (!schemaValid) {
      results.valid = false;
      results.schemaErrors = validateSchema.errors.map(err => {
        return `${err.instancePath || '/'}: ${err.message}`;
      });
    }

    // Semantic validations
    if (verbose) logInfo('Running semantic validations...');

    // Check unique IDs
    const uniqueCheck = validateUniqueIds(pdl, verbose);
    if (uniqueCheck.errors.length > 0) {
      results.valid = false;
      results.semanticErrors.push(...uniqueCheck.errors);
    }

    // Check entity references
    const refCheck = validateEntityReferences(pdl, verbose);
    if (refCheck.errors.length > 0) {
      results.valid = false;
      results.semanticErrors.push(...refCheck.errors);
    }
    results.warnings.push(...refCheck.warnings);

    // Check timeline consistency
    const timelineCheck = validateTimelineConsistency(pdl, verbose);
    results.warnings.push(...timelineCheck.warnings);

    // Collect statistics
    results.stats = {
      pdl_version: pdl.pdl_version,
      scenario: pdl.scenario?.name || pdl.scenario?.id,
      entities: pdl.entities?.length || 0,
      supply_chains: pdl.supply_chains?.length || 0,
      events: pdl.events?.length || 0,
      cascades: pdl.cascades?.length || 0
    };

  } catch (e) {
    results.valid = false;
    results.semanticErrors.push(e.message);
  }

  return results;
}

/**
 * Format validation results for output
 */
function formatResults(results, verbose) {
  console.log('\n' + colors.bold + '=== PDL Validation Results ===' + colors.reset + '\n');

  // Statistics
  if (results.stats.scenario) {
    console.log(`Scenario: ${results.stats.scenario}`);
    console.log(`PDL Version: ${results.stats.pdl_version}`);
    console.log(`Entities: ${results.stats.entities}`);
    console.log(`Supply Chains: ${results.stats.supply_chains}`);
    console.log(`Events: ${results.stats.events}`);
    console.log(`Cascades: ${results.stats.cascades}`);
    console.log('');
  }

  // Schema errors
  if (results.schemaErrors.length > 0) {
    log('Schema Validation Errors:', 'red');
    results.schemaErrors.forEach(err => {
      console.log(`  - ${err}`);
    });
    console.log('');
  }

  // Semantic errors
  if (results.semanticErrors.length > 0) {
    log('Semantic Errors:', 'red');
    results.semanticErrors.forEach(err => {
      console.log(`  - ${err}`);
    });
    console.log('');
  }

  // Warnings
  if (results.warnings.length > 0) {
    log('Warnings:', 'yellow');
    results.warnings.forEach(warn => {
      console.log(`  - ${warn}`);
    });
    console.log('');
  }

  // Final status
  if (results.valid) {
    if (results.warnings.length > 0) {
      logSuccess(`Validation passed with ${results.warnings.length} warning(s)`);
    } else {
      logSuccess('Validation passed - PDL file is valid!');
    }
  } else {
    const totalErrors = results.schemaErrors.length + results.semanticErrors.length;
    logError(`Validation failed with ${totalErrors} error(s)`);
  }

  return results.valid;
}

// CLI entry point
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
PDL Validator - Validates PDL YAML files against the PDL schema

Usage: node pdl-validator.js <pdl-file.yaml> [options]

Options:
  --verbose, -v    Show detailed validation progress
  --json           Output results as JSON
  --help, -h       Show this help message

Examples:
  node pdl-validator.js scenarios/s1-soja.pdl.yaml
  node pdl-validator.js scenarios/s1-soja.pdl.yaml --verbose
  node pdl-validator.js scenarios/s1-soja.pdl.yaml --json
`);
    process.exit(0);
  }

  const filePath = resolve(args[0]);
  const verbose = args.includes('--verbose') || args.includes('-v');
  const jsonOutput = args.includes('--json');

  try {
    const results = await validate(filePath, verbose);

    if (jsonOutput) {
      console.log(JSON.stringify(results, null, 2));
    } else {
      formatResults(results, verbose);
    }

    process.exit(results.valid ? 0 : 1);
  } catch (e) {
    logError(e.message);
    process.exit(1);
  }
}

// Export for use as module
export { validate, loadYamlFile, loadSchema };

// Run if called directly
main();
