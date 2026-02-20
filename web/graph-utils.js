export function parseDurationToDays(duration) {
  if (!duration) return null;
  const match = duration.match(/^(\d+)([dhwmy])$/);
  if (!match) return null;
  const value = Number.parseInt(match[1], 10);
  const unit = match[2];
  const multipliers = { h: 1 / 24, d: 1, w: 7, m: 30, y: 365 };
  return value * (multipliers[unit] || 1);
}

export function parsePercentage(pct) {
  if (!pct) return null;
  const match = pct.match(/^([+-]?\d+)%$/);
  if (!match) return null;
  return Number.parseInt(match[1], 10) / 100;
}

export function convertToGraphJson(pdl) {
  const nodes = [];
  const edges = [];

  if (pdl.entities) {
    for (const entity of pdl.entities) {
      const node = {
        id: `entity:${entity.id}`,
        type: "entity",
        subtype: entity.type,
        label: entity.name,
        data: { ...entity }
      };
      nodes.push(node);
    }
  }

  if (pdl.supply_chains) {
    for (const chain of pdl.supply_chains) {
      const chainNode = {
        id: `chain:${chain.id}`,
        type: "supply_chain",
        label: chain.name || chain.id,
        data: { id: chain.id, name: chain.name }
      };
      nodes.push(chainNode);

      if (chain.stages) {
        chain.stages.forEach((stage, idx) => {
          const [from, to] = stage;
          edges.push({
            id: `edge:${chain.id}-stage-${idx}`,
            from: `entity:${from}`,
            to: `entity:${to}`,
            type: "supply_flow",
            data: { chain_id: chain.id, sequence: idx + 1 }
          });
        });
      }

      if (chain.dependencies) {
        chain.dependencies.forEach((dep, idx) => {
          edges.push({
            id: `edge:${chain.id}-dep-${idx}`,
            from: `entity:${dep.from}`,
            to: `entity:${dep.to}`,
            type: "dependency",
            data: {
              dependency_type: dep.type,
              criticality: dep.criticality
            }
          });
        });
      }
    }
  }

  if (pdl.events) {
    for (const event of pdl.events) {
      const node = {
        id: `event:${event.id}`,
        type: "event",
        subtype: event.type,
        label: event.name,
        data: {
          ...event,
          impact_parsed: event.impact
            ? {
                supply_decimal: parsePercentage(event.impact.supply),
                demand_decimal: parsePercentage(event.impact.demand),
                price_decimal: parsePercentage(event.impact.price),
                duration_days: parseDurationToDays(event.impact.duration)
              }
            : null
        }
      };
      nodes.push(node);

      if (event.trigger && event.trigger.target) {
        edges.push({
          id: `edge:${event.id}-trigger`,
          from: node.id,
          to: `entity:${event.trigger.target}`,
          type: "triggers",
          data: {
            probability: event.trigger.probability,
            condition: event.trigger.condition
          }
        });
      }

      if (event.causes) {
        event.causes.forEach((causeId, idx) => {
          edges.push({
            id: `edge:${event.id}-causes-${idx}`,
            from: node.id,
            to: `event:${causeId}`,
            type: "causes"
          });
        });
      }
    }
  }

  if (pdl.cascades) {
    for (const cascade of pdl.cascades) {
      const node = {
        id: `cascade:${cascade.id}`,
        type: "cascade",
        label: cascade.name || cascade.id,
        data: {
          id: cascade.id,
          name: cascade.name,
          probability: cascade.probability,
          validation: cascade.validation
        }
      };
      nodes.push(node);

      if (cascade.origin) {
        edges.push({
          id: `edge:${cascade.id}-origin`,
          from: `event:${cascade.origin}`,
          to: node.id,
          type: "cascade_origin"
        });
      }

      if (cascade.timeline) {
        let prevId = node.id;
        cascade.timeline.forEach((entry, idx) => {
          const entryNode = {
            id: `timeline:${cascade.id}-${idx}`,
            type: "timeline_entry",
            label: `${entry.at}: ${entry.event}`,
            data: {
              ...entry,
              cascade_id: cascade.id,
              event_id: entry.event,
              at_days: parseDurationToDays(entry.at),
              sequence: idx + 1
            }
          };
          nodes.push(entryNode);

          edges.push({
            id: `edge:${cascade.id}-seq-${idx}`,
            from: prevId,
            to: entryNode.id,
            type: "sequence",
            data: { at: entry.at }
          });

          if (entry.affects) {
            entry.affects.forEach((entityId) => {
              edges.push({
                id: `edge:${cascade.id}-${idx}-affects-${entityId}`,
                from: entryNode.id,
                to: `entity:${entityId}`,
                type: "affects"
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
      format: "graph"
    },
    nodes,
    edges
  };
}

export function buildAdjacency(edges, options = {}) {
  const { directed = true } = options;
  const adjacency = new Map();
  edges.forEach((edge) => {
    if (!adjacency.has(edge.from)) adjacency.set(edge.from, []);
    adjacency.get(edge.from).push({ node: edge.to, edgeId: edge.id });
    if (!directed) {
      if (!adjacency.has(edge.to)) adjacency.set(edge.to, []);
      adjacency.get(edge.to).push({ node: edge.from, edgeId: edge.id });
    }
  });
  return adjacency;
}

export function shortestPath(startId, targetId, edges, options = {}) {
  if (!startId || !targetId) return null;
  if (startId === targetId) {
    return { nodePath: [startId], edgePath: [] };
  }
  const adjacency = buildAdjacency(edges, options);
  const queue = [startId];
  const visited = new Set([startId]);
  const parent = new Map();

  while (queue.length) {
    const current = queue.shift();
    const nextItems = adjacency.get(current) || [];
    for (const { node, edgeId } of nextItems) {
      if (visited.has(node)) continue;
      visited.add(node);
      parent.set(node, { prev: current, edgeId });
      if (node === targetId) {
        const nodePath = [targetId];
        const edgePath = [];
        let cursor = targetId;
        while (cursor !== startId) {
          const info = parent.get(cursor);
          if (!info) break;
          edgePath.unshift(info.edgeId);
          cursor = info.prev;
          nodePath.unshift(cursor);
        }
        return { nodePath, edgePath };
      }
      queue.push(node);
    }
  }

  return null;
}
