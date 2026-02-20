import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse as parseYaml } from 'yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load the actual scenario file
const scenarioPath = resolve(__dirname, '../scenarios/s1-soja.pdl.yaml');
const scenarioContent = readFileSync(scenarioPath, 'utf-8');
const scenario = parseYaml(scenarioContent);

describe('PDL Validator - Scenario Structure', () => {

  describe('PDL Version', () => {
    it('should have a valid PDL version', () => {
      assert.ok(scenario.pdl_version, 'pdl_version is required');
      assert.match(scenario.pdl_version, /^[0-9]+\.[0-9]+$/, 'pdl_version must match pattern X.Y');
    });
  });

  describe('Scenario Metadata', () => {
    it('should have required scenario fields', () => {
      assert.ok(scenario.scenario, 'scenario is required');
      assert.ok(scenario.scenario.id, 'scenario.id is required');
      assert.ok(scenario.scenario.name, 'scenario.name is required');
      assert.ok(scenario.scenario.sector, 'scenario.sector is required');
      assert.ok(scenario.scenario.criticality, 'scenario.criticality is required');
    });

    it('should have valid scenario ID format', () => {
      assert.match(scenario.scenario.id, /^[a-z][a-z0-9_]*$/, 'scenario.id must be lowercase with underscores');
    });

    it('should have valid criticality level', () => {
      assert.ok(['high', 'medium', 'low'].includes(scenario.scenario.criticality),
        'criticality must be high, medium, or low');
    });
  });

  describe('Entities', () => {
    it('should have entities array', () => {
      assert.ok(Array.isArray(scenario.entities), 'entities must be an array');
      assert.ok(scenario.entities.length > 0, 'entities array should not be empty');
    });

    it('should have required entity fields', () => {
      for (const entity of scenario.entities) {
        assert.ok(entity.id, `entity must have id: ${JSON.stringify(entity)}`);
        assert.ok(entity.type, `entity must have type: ${entity.id}`);
        assert.ok(entity.name, `entity must have name: ${entity.id}`);
        assert.ok(entity.sector, `entity must have sector: ${entity.id}`);
      }
    });

    it('should have valid entity ID formats', () => {
      for (const entity of scenario.entities) {
        assert.match(entity.id, /^[a-z][a-z0-9_]*$/,
          `entity.id must be lowercase with underscores: ${entity.id}`);
      }
    });

    it('should have valid entity types', () => {
      const validTypes = ['manufacturer', 'commodity', 'infrastructure', 'service', 'region'];
      for (const entity of scenario.entities) {
        assert.ok(validTypes.includes(entity.type),
          `entity type must be one of ${validTypes.join(', ')}: ${entity.id} has ${entity.type}`);
      }
    });

    it('should have vulnerability scores in valid range', () => {
      for (const entity of scenario.entities) {
        if (entity.vulnerability !== undefined) {
          assert.ok(entity.vulnerability >= 0 && entity.vulnerability <= 1,
            `vulnerability must be 0-1: ${entity.id} has ${entity.vulnerability}`);
        }
      }
    });

    it('should have unique entity IDs', () => {
      const ids = scenario.entities.map(e => e.id);
      const uniqueIds = new Set(ids);
      assert.strictEqual(ids.length, uniqueIds.size, 'entity IDs must be unique');
    });
  });

  describe('Supply Chains', () => {
    it('should have supply_chains array', () => {
      assert.ok(Array.isArray(scenario.supply_chains), 'supply_chains must be an array');
    });

    it('should have required supply chain fields', () => {
      for (const chain of scenario.supply_chains) {
        assert.ok(chain.id, `supply chain must have id`);
      }
    });

    it('should have valid stage references', () => {
      const entityIds = new Set(scenario.entities.map(e => e.id));

      for (const chain of scenario.supply_chains) {
        if (chain.stages) {
          for (const stage of chain.stages) {
            assert.ok(Array.isArray(stage) && stage.length === 2,
              `stage must be [from, to] pair: ${chain.id}`);
            const [from, to] = stage;
            assert.ok(entityIds.has(from),
              `stage 'from' must reference existing entity: ${from} in ${chain.id}`);
            assert.ok(entityIds.has(to),
              `stage 'to' must reference existing entity: ${to} in ${chain.id}`);
          }
        }
      }
    });

    it('should have valid dependency references', () => {
      const entityIds = new Set(scenario.entities.map(e => e.id));

      for (const chain of scenario.supply_chains) {
        if (chain.dependencies) {
          for (const dep of chain.dependencies) {
            assert.ok(dep.from, `dependency must have 'from': ${chain.id}`);
            assert.ok(dep.to, `dependency must have 'to': ${chain.id}`);
            assert.ok(dep.type, `dependency must have 'type': ${chain.id}`);
            assert.ok(entityIds.has(dep.from),
              `dependency 'from' must reference existing entity: ${dep.from} in ${chain.id}`);
            assert.ok(entityIds.has(dep.to),
              `dependency 'to' must reference existing entity: ${dep.to} in ${chain.id}`);
          }
        }
      }
    });
  });

  describe('Events', () => {
    it('should have events array', () => {
      assert.ok(Array.isArray(scenario.events), 'events must be an array');
    });

    it('should have required event fields', () => {
      for (const event of scenario.events) {
        assert.ok(event.id, `event must have id`);
        assert.ok(event.name, `event must have name: ${event.id}`);
        assert.ok(event.type, `event must have type: ${event.id}`);
        assert.ok(event.trigger, `event must have trigger: ${event.id}`);
      }
    });

    it('should have valid event types', () => {
      const validTypes = ['natural_disaster', 'market_shock', 'infrastructure_failure',
                          'regulatory', 'geopolitical', 'pandemic', 'cyber_attack'];
      for (const event of scenario.events) {
        assert.ok(validTypes.includes(event.type),
          `event type must be valid: ${event.id} has ${event.type}`);
      }
    });

    it('should have valid trigger target references', () => {
      const entityIds = new Set(scenario.entities.map(e => e.id));

      for (const event of scenario.events) {
        assert.ok(event.trigger.target, `event trigger must have target: ${event.id}`);
        assert.ok(entityIds.has(event.trigger.target),
          `trigger target must reference existing entity: ${event.trigger.target} in ${event.id}`);
      }
    });

    it('should have valid trigger probability range', () => {
      for (const event of scenario.events) {
        if (event.trigger.probability !== undefined) {
          assert.ok(event.trigger.probability >= 0 && event.trigger.probability <= 1,
            `trigger probability must be 0-1: ${event.id} has ${event.trigger.probability}`);
        }
      }
    });

    it('should have valid impact duration format', () => {
      for (const event of scenario.events) {
        if (event.impact && event.impact.duration) {
          assert.match(event.impact.duration, /^[0-9]+[dhwmy]$/,
            `impact duration must match format: ${event.id} has ${event.impact.duration}`);
        }
      }
    });

    it('should have valid impact percentage format', () => {
      for (const event of scenario.events) {
        if (event.impact) {
          for (const field of ['supply', 'demand', 'price']) {
            if (event.impact[field]) {
              assert.match(event.impact[field], /^[+-]?[0-9]+%$/,
                `impact.${field} must be percentage: ${event.id} has ${event.impact[field]}`);
            }
          }
        }
      }
    });

    it('should have valid causes references', () => {
      const eventIds = new Set(scenario.events.map(e => e.id));

      for (const event of scenario.events) {
        if (event.causes) {
          for (const causedId of event.causes) {
            assert.ok(eventIds.has(causedId),
              `causes must reference existing events: ${causedId} in ${event.id}`);
          }
        }
      }
    });
  });

  describe('Cascades', () => {
    it('should have cascades array', () => {
      assert.ok(Array.isArray(scenario.cascades), 'cascades must be an array');
    });

    it('should have required cascade fields', () => {
      for (const cascade of scenario.cascades) {
        assert.ok(cascade.id, `cascade must have id`);
        assert.ok(cascade.origin, `cascade must have origin: ${cascade.id}`);
        assert.ok(cascade.timeline, `cascade must have timeline: ${cascade.id}`);
      }
    });

    it('should have valid origin references', () => {
      const eventIds = new Set(scenario.events.map(e => e.id));

      for (const cascade of scenario.cascades) {
        assert.ok(eventIds.has(cascade.origin),
          `cascade origin must reference existing event: ${cascade.origin} in ${cascade.id}`);
      }
    });

    it('should have valid cascade probability range', () => {
      for (const cascade of scenario.cascades) {
        if (cascade.probability !== undefined) {
          assert.ok(cascade.probability >= 0 && cascade.probability <= 1,
            `cascade probability must be 0-1: ${cascade.id} has ${cascade.probability}`);
        }
      }
    });

    it('should have valid timeline entries', () => {
      for (const cascade of scenario.cascades) {
        for (const entry of cascade.timeline) {
          assert.ok(entry.at, `timeline entry must have 'at': ${cascade.id}`);
          assert.ok(entry.event, `timeline entry must have 'event': ${cascade.id}`);
          assert.match(entry.at, /^[0-9]+[dhwmy]$/,
            `timeline 'at' must be duration format: ${entry.at} in ${cascade.id}`);
        }
      }
    });

    it('should have valid timeline severity levels', () => {
      const validSeverities = ['critical', 'high', 'medium', 'low'];

      for (const cascade of scenario.cascades) {
        for (const entry of cascade.timeline) {
          if (entry.impact && entry.impact.severity) {
            assert.ok(validSeverities.includes(entry.impact.severity),
              `severity must be valid: ${entry.impact.severity} in ${cascade.id}`);
          }
        }
      }
    });

    it('should have valid affects references', () => {
      const entityIds = new Set(scenario.entities.map(e => e.id));

      for (const cascade of scenario.cascades) {
        for (const entry of cascade.timeline) {
          if (entry.affects) {
            for (const affectedId of entry.affects) {
              assert.ok(entityIds.has(affectedId),
                `affects must reference existing entity: ${affectedId} in ${cascade.id}`);
            }
          }
        }
      }
    });
  });
});

describe('PDL Validator - Sample Scenario Statistics', () => {
  it('should have expected number of entities', () => {
    assert.strictEqual(scenario.entities.length, 14, 'should have 14 entities');
  });

  it('should have expected number of supply chains', () => {
    assert.strictEqual(scenario.supply_chains.length, 3, 'should have 3 supply chains');
  });

  it('should have expected number of events', () => {
    assert.strictEqual(scenario.events.length, 9, 'should have 9 events');
  });

  it('should have expected number of cascades', () => {
    assert.strictEqual(scenario.cascades.length, 3, 'should have 3 cascades');
  });
});
