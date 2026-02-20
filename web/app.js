import { parse as parseYaml } from "./vendor/yaml/index.js";
import {
  convertToGraphJson,
  buildAdjacency,
  shortestPath
} from "./graph-utils.js";

const state = {
  graph: null,
  network: null,
  nodesData: null,
  edgesData: null,
  raw: null,
  conflictMode: false,
  savedNodeTypeSelection: null,
  focus: null,
  focusMode: "filter",
  nodeById: new Map(),
  edgeById: new Map(),
  showRawDetails: false,
  selectedNodeId: null,
  selectedNodeType: null,
  supplyMode: "off",
  supplyAdjacency: { upstream: new Map(), downstream: new Map() },
  supplyDim: true,
  rawText: null,
  fileName: null,
  analysis: {
    path: null,
    pathHighlight: false,
    filteredNodes: [],
    filteredEdges: [],
    pathMessage: null,
    nodeLookup: new Map(),
    labelLookup: new Map()
  },
  validation: {
    errors: [],
    warnings: [],
    warningNodeIds: new Set(),
    warningEdgeIds: new Set(),
    schema: null,
    validator: null
  },
  uiState: {
    pending: null,
    applying: false
  }
};

const UNKNOWN_VALUE = "ohne Angabe";

const colors = {
  entity: { background: "#16a34a", border: "#14532d" },
  supply_chain: { background: "#f59e0b", border: "#92400e" },
  event: { background: "#dc2626", border: "#7f1d1d" },
  cascade: { background: "#7c3aed", border: "#4c1d95" },
  timeline_entry: { background: "#0ea5e9", border: "#0c4a6e" }
};

const edgeColors = {
  contains: "#64748b",
  supply_flow: "#0f766e",
  dependency: "#f97316",
  triggers: "#ef4444",
  causes: "#9333ea",
  cascade_origin: "#4f46e5",
  sequence: "#0ea5e9",
  affects: "#22c55e"
};

const pathHighlightPalette = {
  background: "#e0e7ff",
  border: "#4338ca",
  edge: "#4338ca"
};

const warningPalette = {
  background: "#fef3c7",
  border: "#f59e0b",
  edge: "#f59e0b"
};

const elements = {
  fileInput: document.getElementById("fileInput"),
  exampleBtn: document.getElementById("exampleBtn"),
  status: document.getElementById("status"),
  fileLabel: document.getElementById("fileLabel"),
  tabGraph: document.getElementById("tabGraph"),
  tabYaml: document.getElementById("tabYaml"),
  tabAbout: document.getElementById("tabAbout"),
  graphView: document.getElementById("graphView"),
  yamlView: document.getElementById("yamlView"),
  aboutView: document.getElementById("aboutView"),
  yamlTree: document.getElementById("yamlTree"),
  yamlStatus: document.getElementById("yamlStatus"),
  yamlSearch: document.getElementById("yamlSearch"),
  yamlExpand: document.getElementById("yamlExpand"),
  yamlCollapse: document.getElementById("yamlCollapse"),
  validationStatus: document.getElementById("validationStatus"),
  validationList: document.getElementById("validationList"),
  nodeTypeFilters: document.getElementById("nodeTypeFilters"),
  edgeTypeFilters: document.getElementById("edgeTypeFilters"),
  sectorFilterBlock: document.getElementById("sectorFilterBlock"),
  sectorFilters: document.getElementById("sectorFilters"),
  locationFilterBlock: document.getElementById("locationFilterBlock"),
  locationFilters: document.getElementById("locationFilters"),
  criticalityFilterBlock: document.getElementById("criticalityFilterBlock"),
  criticalityFilters: document.getElementById("criticalityFilters"),
  entitySubtypeBlock: document.getElementById("entitySubtypeBlock"),
  entitySubtypeFilters: document.getElementById("entitySubtypeFilters"),
  eventSubtypeBlock: document.getElementById("eventSubtypeBlock"),
  eventSubtypeFilters: document.getElementById("eventSubtypeFilters"),
  conflictMode: document.getElementById("conflictMode"),
  focusLabel: document.getElementById("focusLabel"),
  focusHighlight: document.getElementById("focusHighlight"),
  focusReset: document.getElementById("focusReset"),
  searchInput: document.getElementById("searchInput"),
  stats: document.getElementById("stats"),
  detailsType: document.getElementById("detailsType"),
  detailsTitle: document.getElementById("detailsTitle"),
  detailsContent: document.getElementById("detailsContent"),
  detailsRaw: document.getElementById("detailsRaw"),
  detailsToggle: document.getElementById("detailsToggle"),
  supplyStatus: document.getElementById("supplyStatus"),
  supplyDim: document.getElementById("supplyDim"),
  legend: document.getElementById("legend"),
  graph: document.getElementById("graph"),
  graphScenarioTitle: document.getElementById("graphScenarioTitle"),
  fitBtn: document.getElementById("fitBtn"),
  stabilizeBtn: document.getElementById("stabilizeBtn"),
  exportJson: document.getElementById("exportJson"),
  exportPng: document.getElementById("exportPng"),
  exportStatus: document.getElementById("exportStatus"),
  analysisStart: document.getElementById("analysisStart"),
  analysisTarget: document.getElementById("analysisTarget"),
  analysisFind: document.getElementById("analysisFind"),
  analysisToggle: document.getElementById("analysisToggle"),
  analysisClear: document.getElementById("analysisClear"),
  analysisResult: document.getElementById("analysisResult"),
  analysisPresets: document.getElementById("analysisPresets"),
  nodeOptions: document.getElementById("nodeOptions"),
  analysisMenuToggle: document.getElementById("analysisMenuToggle"),
  analysisMenu: document.getElementById("analysisMenu"),
  tutorialBtn: document.getElementById("tutorialBtn"),
  tutorialOverlay: document.getElementById("tutorialOverlay"),
  tutorialClose: document.getElementById("tutorialClose"),
  tutorialPrev: document.getElementById("tutorialPrev"),
  tutorialNext: document.getElementById("tutorialNext"),
  tutorialTitle: document.getElementById("tutorialTitle"),
  tutorialBody: document.getElementById("tutorialBody"),
  tutorialStep: document.getElementById("tutorialStep")
};

const LOCATION_FLAG_BY_KEY = {
  germany: "DE",
  brazil: "BR",
  argentina: "AR",
  "united states": "US",
  netherlands: "NL",
  taiwan: "TW",
  "south korea": "KR",
  china: "CN",
  india: "IN",
  egypt: "EG",
  panama: "PA",
  singapore: "SG",
  "south africa": "ZA",
  myanmar: "MM",
  australia: "AU",
  malaysia: "MY",
  "united kingdom": "GB"
};

function countryCodeToFlag(code) {
  if (!code || code.length !== 2) return "";
  const upper = code.toUpperCase();
  return String.fromCodePoint(...Array.from(upper).map((char) => 127397 + char.charCodeAt(0)));
}

const EVENT_BADGE_BY_SUBTYPE = {
  infrastructure_failure: "🏭",
  market_shock: "📉",
  regulatory: "⚖️",
  natural_disaster: "🌪️",
  geopolitical: "🛡️",
  pandemic: "🦠"
};

function getEventBadge(subtype) {
  if (!subtype || typeof subtype !== "string") return "";
  return EVENT_BADGE_BY_SUBTYPE[subtype] || "⚠️";
}

function getLocationBadge(location) {
  if (!location || typeof location !== "string") return "";
  const key = location.trim().toLowerCase();
  if (key === "eu" || key === "europe") return "🇪🇺";
  if (key === "global" || key === "eurasia") return "🌍";
  if (key === "atlantic" || key === "indian ocean" || key === "baltic sea") return "🌊";
  const code = LOCATION_FLAG_BY_KEY[key];
  if (!code) return "📍";
  return countryCodeToFlag(code) || "📍";
}

function addVisualStyles(graph) {
  const entityIds = new Set(
    graph.nodes.filter((node) => node.type === "entity").map((node) => node.id)
  );
  const entityDegree = new Map();
  entityIds.forEach((id) => entityDegree.set(id, 0));

  graph.edges.forEach((edge) => {
    if (entityIds.has(edge.from)) {
      entityDegree.set(edge.from, (entityDegree.get(edge.from) || 0) + 1);
    }
    if (entityIds.has(edge.to)) {
      entityDegree.set(edge.to, (entityDegree.get(edge.to) || 0) + 1);
    }
  });

  const logDegrees = Array.from(entityDegree.values(), (degree) => Math.log1p(degree));
  const minLogDegree = logDegrees.length ? Math.min(...logDegrees) : 0;
  const maxLogDegree = logDegrees.length ? Math.max(...logDegrees) : 0;
  const entityMinSize = 16;
  const entityMaxSize = 28;

  function getEntitySize(nodeId) {
    const degree = entityDegree.get(nodeId) || 0;
    const logDegree = Math.log1p(degree);
    if (maxLogDegree === minLogDegree) {
      return (entityMinSize + entityMaxSize) / 2;
    }
    const normalized = (logDegree - minLogDegree) / (maxLogDegree - minLogDegree);
    return entityMinSize + normalized * (entityMaxSize - entityMinSize);
  }

  graph.nodes = graph.nodes.map((node) => {
    const palette = colors[node.type] || colors.entity;
    const isScenario = node.type === "scenario";
    const isTimeline = node.type === "timeline_entry";
    const nodeLabel = node.label || node.id;
    const locationBadge = getLocationBadge(node.data?.location);
    const eventBadge = node.type === "event" ? getEventBadge(node.subtype) : "";
    const badgePrefix = [eventBadge, locationBadge].filter(Boolean).join(" ");
    const styled = {
      ...node,
      label: badgePrefix ? badgePrefix + " " + nodeLabel : nodeLabel,
      shape: isScenario ? "box" : "dot",
      size: isScenario
        ? 26
        : isTimeline
          ? 10
          : node.type === "entity"
            ? getEntitySize(node.id)
            : node.type === "event"
              ? 9.8
              : 14,
      color: palette,
      font: {
        color: "#0b1220",
        face: "Space Grotesk",
        size: badgePrefix ? 17 : 15
      },
      borderWidth: isScenario ? 2 : 1,
      title: buildTooltip(node)
    };
    styled._style = {
      color: styled.color,
      font: styled.font,
      borderWidth: styled.borderWidth,
      size: styled.size
    };
    return styled;
  });

  graph.edges = graph.edges.map((edge) => {
    const color = edgeColors[edge.type] || "#334155";
    const styled = {
      ...edge,
      arrows: "to",
      color: { color, highlight: color },
      width: edge.type === "supply_flow" ? 2 : 1,
      dashes: edge.type === "dependency",
      font: {
        color: "#0b1220",
        face: "Space Grotesk",
        size: 13
      }
    };
    styled._style = {
      color: styled.color,
      width: styled.width,
      dashes: styled.dashes,
      font: styled.font
    };
    return styled;
  });
}

function buildTooltip(node) {
  const lines = [
    String(node.label || node.id),
    "Typ: " + node.type
  ];
  if (node.subtype) {
    lines.push("Subtyp: " + node.subtype);
  }
  if (node.data?.sector) {
    lines.push("Sektor: " + node.data.sector);
  }
  if (node.data?.location) {
    lines.push("Ort: " + node.data.location);
  }
  return lines.join("\n");
}

function getNodeSector(node) {
  return node.data?.sector ?? node.data?.impact?.sector ?? null;
}

function getNodeLocation(node) {
  return node.data?.location ?? null;
}

function getNodeCriticality(node) {
  return node.data?.criticality ?? null;
}

function renderLegend() {
  elements.legend.innerHTML = "";
  Object.entries(colors).forEach(([type, palette]) => {
    const li = document.createElement("li");
    li.innerHTML = `<span><span class="swatch" style="background:${palette.background};border:1px solid ${palette.border}"></span>${type}</span>`;
    elements.legend.appendChild(li);
  });
}

function createCheckboxList(container, values, labelMap = {}) {
  container.innerHTML = "";
  values.forEach((value) => {
    const label = document.createElement("label");
    label.className = "filter-item";
    label.innerHTML = `<input type="checkbox" value="${value}" checked /> ${labelMap[value] || value}`;
    container.appendChild(label);
  });
}

function gatherFilters(container) {
  return new Set(
    Array.from(container.querySelectorAll("input[type=checkbox]")
    ).filter((input) => input.checked).map((input) => input.value)
  );
}

function setNodeTypeSelection(values) {
  elements.nodeTypeFilters.querySelectorAll("input[type=checkbox]").forEach((input) => {
    input.checked = values.has(input.value);
    input.disabled = false;
  });
}

function setConflictMode(enabled) {
  const conflictTypes = new Set(["event", "cascade", "timeline_entry"]);
  state.conflictMode = enabled;

  if (enabled) {
    state.savedNodeTypeSelection = gatherFilters(elements.nodeTypeFilters);
    elements.nodeTypeFilters.querySelectorAll("input[type=checkbox]").forEach((input) => {
      const shouldShow = conflictTypes.has(input.value);
      input.checked = shouldShow;
      input.disabled = !shouldShow;
    });
  } else {
    if (state.savedNodeTypeSelection) {
      setNodeTypeSelection(state.savedNodeTypeSelection);
    }
    elements.nodeTypeFilters.querySelectorAll("input[type=checkbox]").forEach((input) => {
      input.disabled = false;
    });
  }
}

function setFocusEvent(eventNode) {
  if (!state.raw) return;
  const eventId = eventNode.id.replace("event:", "");
  const cascades = (state.raw.cascades || []).filter((cascade) => {
    if (cascade.origin === eventId) return true;
    return (cascade.timeline || []).some((entry) => entry.event === eventId);
  });
  const cascadeIds = new Set(cascades.map((cascade) => cascade.id));
  const originIds = new Set(cascades.map((cascade) => cascade.origin).filter(Boolean));
  const eventIds = new Set([eventId, ...originIds]);
  cascades.forEach((cascade) => {
    (cascade.timeline || []).forEach((entry) => {
      if (entry.event) eventIds.add(entry.event);
    });
  });
  state.focus = {
    eventId,
    cascadeIds,
    originIds,
    eventIds,
    label: eventNode.label || eventId
  };
}

function clearFocus() {
  state.focus = null;
  updateFocusUI();
}

function updateFocusUI() {
  if (!elements.focusLabel || !elements.focusReset) return;
  if (!state.focus) {
    elements.focusLabel.textContent = "Pfad-Fokus: aus";
    elements.focusReset.disabled = true;
    return;
  }
  const cascadeCount = state.focus.cascadeIds.size;
  elements.focusLabel.textContent = `Pfad-Fokus: ${state.focus.label} (${cascadeCount} Kaskade${cascadeCount === 1 ? "" : "n"})`;
  elements.focusReset.disabled = false;
}

function isNodeInFocus(node, focus) {
  if (!focus) return false;
  if (node.type === "cascade") {
    return focus.cascadeIds.has(node.data?.id || node.id.replace("cascade:", ""));
  }
  if (node.type === "timeline_entry") {
    return focus.cascadeIds.has(node.data?.cascade_id);
  }
  if (node.type === "event") {
    const id = node.id.replace("event:", "");
    return focus.eventIds.has(id);
  }
  return false;
}

function dimNode(node) {
  return {
    ...node,
    color: {
      background: "rgba(15, 23, 42, 0.08)",
      border: "rgba(15, 23, 42, 0.22)"
    },
    font: {
      ...node.font,
      color: "rgba(15, 23, 42, 0.35)"
    },
    borderWidth: 1,
    size: Math.max(8, (node.size || 12) - 2)
  };
}

function dimEdge(edge) {
  return {
    ...edge,
    color: { color: "rgba(15, 23, 42, 0.18)", highlight: "rgba(15, 23, 42, 0.25)" },
    width: 1,
    dashes: true,
    font: {
      ...edge.font,
      color: "rgba(15, 23, 42, 0.35)"
    }
  };
}

function highlightNode(node) {
  return {
    ...node,
    borderWidth: (node.borderWidth || 1) + 3,
    size: (node.size || 12) + 4,
    color: {
      background: "#fff7ed",
      border: "#f97316",
      highlight: { background: "#ffedd5", border: "#fb923c" },
      hover: { background: "#ffedd5", border: "#fb923c" }
    },
    shadow: {
      enabled: true,
      color: "rgba(249, 115, 22, 0.75)",
      size: 26,
      x: 0,
      y: 0
    }
  };
}

function highlightEdge(edge) {
  return {
    ...edge,
    width: (edge.width || 1) + 3,
    color: { color: "#f97316", highlight: "#fb923c" },
    shadow: {
      enabled: true,
      color: "rgba(249, 115, 22, 0.7)",
      size: 20,
      x: 0,
      y: 0
    }
  };
}

function highlightPathNode(node) {
  return {
    ...node,
    borderWidth: (node.borderWidth || 1) + 2,
    color: {
      ...node.color,
      border: pathHighlightPalette.border
    },
    shadow: {
      enabled: true,
      color: "rgba(67, 56, 202, 0.45)",
      size: 22,
      x: 0,
      y: 0
    }
  };
}

function highlightPathEdge(edge) {
  return {
    ...edge,
    width: (edge.width || 1) + 2,
    color: { color: pathHighlightPalette.edge, highlight: pathHighlightPalette.edge }
  };
}

function applyWarningNode(node) {
  return {
    ...node,
    borderWidth: (node.borderWidth || 1) + 1,
    color: {
      ...node.color,
      border: warningPalette.border
    }
  };
}

function applyWarningEdge(edge) {
  return {
    ...edge,
    width: (edge.width || 1) + 1,
    color: { color: warningPalette.edge, highlight: warningPalette.edge },
    dashes: true
  };
}

function applyFilters() {
  if (!state.graph) return;
  const nodeTypes = gatherFilters(elements.nodeTypeFilters);
  const edgeTypes = gatherFilters(elements.edgeTypeFilters);
  const sectorFilters = gatherFilters(elements.sectorFilters);
  const locationFilters = gatherFilters(elements.locationFilters);
  const criticalityFilters = gatherFilters(elements.criticalityFilters);
  const entitySubtypes = gatherFilters(elements.entitySubtypeFilters);
  const eventSubtypes = gatherFilters(elements.eventSubtypeFilters);
  const sectorInputs = elements.sectorFilters.querySelectorAll("input");
  const locationInputs = elements.locationFilters.querySelectorAll("input");
  const criticalityInputs = elements.criticalityFilters.querySelectorAll("input");
  const entitySubtypeInputs = elements.entitySubtypeFilters.querySelectorAll("input");
  const eventSubtypeInputs = elements.eventSubtypeFilters.querySelectorAll("input");
  const searchTerm = (elements.searchInput?.value || "").trim().toLowerCase();

  const filteredNodes = state.graph.nodes.filter((node) => {
    if (!nodeTypes.has(node.type)) return false;
    if (node.type === "entity" && entitySubtypeInputs.length && node.subtype) {
      if (!entitySubtypes.has(node.subtype)) return false;
    }
    if (node.type === "event" && eventSubtypeInputs.length && node.subtype) {
      if (!eventSubtypes.has(node.subtype)) return false;
    }
    if (sectorInputs.length) {
      const sector = getNodeSector(node) ?? UNKNOWN_VALUE;
      if (!sectorFilters.has(sector)) return false;
    }
    if (locationInputs.length) {
      const location = getNodeLocation(node) ?? UNKNOWN_VALUE;
      if (!locationFilters.has(location)) return false;
    }
    if (criticalityInputs.length) {
      const criticality = getNodeCriticality(node) ?? UNKNOWN_VALUE;
      if (!criticalityFilters.has(criticality)) return false;
    }
    if (searchTerm) {
      const hay = `${node.label ?? ""} ${node.id ?? ""}`.toLowerCase();
      if (!hay.includes(searchTerm)) return false;
    }
    return true;
  });
  const nodeIds = new Set(filteredNodes.map((node) => node.id));
  const filteredEdges = state.graph.edges.filter((edge) => {
    if (!edgeTypes.has(edge.type)) return false;
    return nodeIds.has(edge.from) && nodeIds.has(edge.to);
  });
  state.analysis.filteredNodes = filteredNodes;
  state.analysis.filteredEdges = filteredEdges;

  const nodesToRender = filteredNodes.map((node) => ({ ...node }));
  const edgesToRender = filteredEdges.map((edge) => ({ ...edge }));

  const supplyHighlight = getSupplyHighlight();
  const applySupplyDim = supplyHighlight && state.supplyDim;
  let finalNodes = supplyHighlight
    ? nodesToRender.map((node) => {
        if (supplyHighlight.nodeIds.has(node.id)) return highlightSupplyNode(node);
        return applySupplyDim ? dimNode(node) : node;
      })
    : nodesToRender;
  let finalEdges = supplyHighlight
    ? edgesToRender.map((edge) => {
        if (supplyHighlight.edgeIds.has(edge.id)) return highlightSupplyEdge(edge);
        return applySupplyDim ? dimEdge(edge) : edge;
      })
    : edgesToRender;

  if (state.validation.warningNodeIds.size) {
    finalNodes = finalNodes.map((node) =>
      state.validation.warningNodeIds.has(node.id) ? applyWarningNode(node) : node
    );
  }
  if (state.validation.warningEdgeIds.size) {
    finalEdges = finalEdges.map((edge) =>
      state.validation.warningEdgeIds.has(edge.id) ? applyWarningEdge(edge) : edge
    );
  }

  if (state.analysis.pathHighlight && state.analysis.path) {
    finalNodes = finalNodes.map((node) =>
      state.analysis.path.nodeIds.has(node.id) ? highlightPathNode(node) : node
    );
    finalEdges = finalEdges.map((edge) =>
      state.analysis.path.edgeIds.has(edge.id) ? highlightPathEdge(edge) : edge
    );
  }

  state.nodesData.clear();
  state.edgesData.clear();
  state.nodesData.add(finalNodes);
  state.edgesData.add(finalEdges);

  updatePathVisibility(nodeIds, new Set(filteredEdges.map((edge) => edge.id)));
  updateStats(state.analysis.filteredNodes, state.analysis.filteredEdges);
  updateUrlState();
}

function buildImpactSummary(nodes) {
  const impacts = {
    supply: [],
    demand: [],
    price: [],
    duration: []
  };
  nodes.forEach((node) => {
    if (node.type !== "event") return;
    const impact = node.data?.impact_parsed;
    if (!impact) return;
    if (impact.supply_decimal !== null && impact.supply_decimal !== undefined) impacts.supply.push(impact.supply_decimal);
    if (impact.demand_decimal !== null && impact.demand_decimal !== undefined) impacts.demand.push(impact.demand_decimal);
    if (impact.price_decimal !== null && impact.price_decimal !== undefined) impacts.price.push(impact.price_decimal);
    if (impact.duration_days !== null && impact.duration_days !== undefined) impacts.duration.push(impact.duration_days);
  });

  const avg = (values) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null);
  const formatPct = (value) => {
    if (value === null || value === undefined) return null;
    const pct = value * 100;
    const rounded = Math.round(pct * 10) / 10;
    const sign = rounded > 0 ? "+" : "";
    return `${sign}${rounded}%`;
  };
  const formatDays = (value) => {
    if (value === null || value === undefined) return null;
    const rounded = Math.round(value * 10) / 10;
    return `${rounded}d`;
  };

  const supply = formatPct(avg(impacts.supply));
  const demand = formatPct(avg(impacts.demand));
  const price = formatPct(avg(impacts.price));
  const duration = formatDays(avg(impacts.duration));

  const parts = [];
  if (supply) parts.push(`Supply ${supply}`);
  if (demand) parts.push(`Demand ${demand}`);
  if (price) parts.push(`Preis ${price}`);
  if (duration) parts.push(`Dauer ${duration}`);
  return parts.length ? parts.join(" · ") : null;
}

function updateStats(nodes = [], edges = []) {
  if (!state.graph) {
    elements.stats.textContent = "";
    return;
  }
  const nodeCount = nodes.length;
  const edgeCount = edges.length;
  const typeCounts = new Map();
  const subtypeCounts = new Map();
  const nodeIdSet = new Set(nodes.map((node) => node.id));

  nodes.forEach((node) => {
    typeCounts.set(node.type, (typeCounts.get(node.type) || 0) + 1);
    if (node.subtype) {
      const key = `${node.type}:${node.subtype}`;
      subtypeCounts.set(key, (subtypeCounts.get(key) || 0) + 1);
    }
  });

  const degree = new Map();
  edges.forEach((edge) => {
    degree.set(edge.from, (degree.get(edge.from) || 0) + 1);
    degree.set(edge.to, (degree.get(edge.to) || 0) + 1);
  });
  const topDegree = Array.from(degree.entries())
    .filter(([id]) => nodeIdSet.has(id))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, count]) => `${getNodeLabelById(id)} (${count})`);

  const impactSummary = buildImpactSummary(nodes);
  const subtypeList = Array.from(subtypeCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([key, count]) => {
      const [type, subtype] = key.split(":");
      return `${type}.${subtype} (${count})`;
    });

  elements.stats.innerHTML = `
    <div>Knoten: <strong>${nodeCount}</strong></div>
    <div>Kanten: <strong>${edgeCount}</strong></div>
    <div class="stat-title">Typen</div>
    <ul>${Array.from(typeCounts.entries())
      .map(([type, count]) => `<li>${type}: ${count}</li>`)
      .join("")}</ul>
    ${subtypeList.length ? `<div class="stat-title">Subtypen</div><ul>${subtypeList.map((item) => `<li>${item}</li>`).join("")}</ul>` : ""}
    <div class="stat-title">Top Grad</div>
    <ul>${topDegree.length ? topDegree.map((item) => `<li>${item}</li>`).join("") : "<li>—</li>"}</ul>
    <div class="stat-title">Impact</div>
    <div>${impactSummary || "—"}</div>
  `;
}

function countByType(type) {
  if (!state.graph) return 0;
  return state.graph.nodes.filter((node) => node.type === type).length;
}

function setStatus(message, isError = false) {
  elements.status.textContent = message;
  elements.status.style.color = isError ? "#b91c1c" : "#4b5563";
}

function setGraphScenarioTitle(scenario) {
  if (!elements.graphScenarioTitle) return;
  const title = scenario?.name || scenario?.title || scenario?.id || "";
  if (!title) {
    elements.graphScenarioTitle.textContent = "";
    elements.graphScenarioTitle.classList.add("hidden");
    return;
  }
  elements.graphScenarioTitle.textContent = title;
  elements.graphScenarioTitle.classList.remove("hidden");
}

function setDetails(payload) {
  elements.detailsRaw.textContent = payload;
}

function renderDetailsEmpty() {
  elements.detailsType.textContent = "—";
  elements.detailsTitle.textContent = "Klick auf einen Knoten oder eine Kante";
  elements.detailsContent.innerHTML = "<p class=\"details-empty\">Wähle ein Element im Graphen aus, um Details zu sehen.</p>";
  elements.detailsRaw.textContent = "";
  elements.detailsRaw.classList.add("hidden");
  state.showRawDetails = false;
  elements.detailsToggle.textContent = "JSON";
}

function formatValue(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function renderRows(rows) {
  if (!rows.length) return "";
  return `<div class="details-rows">${rows
    .map(([label, value]) => `<div class="detail-row"><span>${label}</span><span>${formatValue(value)}</span></div>`)
    .join("")}</div>`;
}

function renderSection(title, rows) {
  if (!rows.length) return "";
  return `<div class="details-section"><h4>${title}</h4>${renderRows(rows)}</div>`;
}

function renderExplanation(text) {
  if (!text) return "";
  return `<div class="details-explanation">${text}</div>`;
}

function normalizeKey(value) {
  return value ? value.trim().toLowerCase() : "";
}

function updateNodeOptions() {
  if (!elements.nodeOptions || !state.graph) return;
  elements.nodeOptions.innerHTML = "";
  state.analysis.nodeLookup = new Map();
  state.analysis.labelLookup = new Map();
  state.graph.nodes.forEach((node) => {
    state.analysis.nodeLookup.set(node.id, node);
    const labelKey = normalizeKey(node.label || "");
    if (labelKey && !state.analysis.labelLookup.has(labelKey)) {
      state.analysis.labelLookup.set(labelKey, node.id);
    }
    const idKey = normalizeKey(node.id);
    if (idKey && !state.analysis.labelLookup.has(idKey)) {
      state.analysis.labelLookup.set(idKey, node.id);
    }
    const option = document.createElement("option");
    option.value = node.id;
    option.label = node.label ? `${node.label} (${node.id})` : node.id;
    elements.nodeOptions.appendChild(option);
  });
}

function renderAnalysisPresets(presets) {
  if (!elements.analysisPresets) return;
  elements.analysisPresets.innerHTML = "";
  if (!presets.length) {
    const empty = document.createElement("span");
    empty.className = "status";
    empty.textContent = "Keine Presets verfügbar.";
    elements.analysisPresets.appendChild(empty);
    return;
  }
  presets.forEach((preset) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = preset.label;
    button.addEventListener("click", () => {
      if (elements.analysisStart) elements.analysisStart.value = preset.startId;
      if (elements.analysisTarget) elements.analysisTarget.value = preset.targetId;
      runPathAnalysis();
    });
    elements.analysisPresets.appendChild(button);
  });
}

function updateAnalysisPresets() {
  if (!state.graph) return;
  const presets = [];
  const nodes = state.graph.nodes;
  const edges = state.graph.edges;
  const degree = new Map();
  edges.forEach((edge) => {
    degree.set(edge.from, (degree.get(edge.from) || 0) + 1);
    degree.set(edge.to, (degree.get(edge.to) || 0) + 1);
  });

  const ranked = nodes
    .map((node) => ({ id: node.id, label: getNodeLabelById(node.id), score: degree.get(node.id) || 0, type: node.type }))
    .sort((a, b) => b.score - a.score);
  const topCandidates = ranked.slice(0, 8);
  let topPair = null;
  for (let i = 0; i < topCandidates.length && !topPair; i += 1) {
    for (let j = 0; j < topCandidates.length && !topPair; j += 1) {
      if (i === j) continue;
      const start = topCandidates[i].id;
      const target = topCandidates[j].id;
      if (shortestPath(start, target, edges, { directed: true })) {
        topPair = { start, target, label: `Top Grad: ${topCandidates[i].label} → ${topCandidates[j].label}` };
      }
    }
  }
  if (topPair) {
    presets.push({
      label: topPair.label,
      startId: topPair.start,
      targetId: topPair.target
    });
  }

  const firstTrigger = (state.raw?.events || []).find((event) => event.trigger?.target);
  if (firstTrigger) {
    const startId = `event:${firstTrigger.id}`;
    const targetId = `entity:${firstTrigger.trigger.target}`;
    if (shortestPath(startId, targetId, edges, { directed: true })) {
      presets.push({
        label: `Trigger: ${firstTrigger.id} → ${firstTrigger.trigger.target}`,
        startId,
        targetId
      });
    }
  }

  const cascade = (state.raw?.cascades || []).find((c) => c.origin && c.timeline?.length);
  if (cascade) {
    const lastIndex = cascade.timeline.length - 1;
    const startId = `event:${cascade.origin}`;
    const targetId = `timeline:${cascade.id}-${lastIndex}`;
    if (shortestPath(startId, targetId, edges, { directed: true })) {
      presets.push({
        label: `Cascade: ${cascade.origin} → Schritt ${lastIndex + 1}`,
        startId,
        targetId
      });
    }
  }

  renderAnalysisPresets(presets.slice(0, 3));
}

function resolveNodeInput(value) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (state.analysis.nodeLookup.has(trimmed)) return trimmed;
  const key = normalizeKey(trimmed);
  return state.analysis.labelLookup.get(key) || null;
}

function setAnalysisResult(message, isError = false) {
  if (!elements.analysisResult) return;
  elements.analysisResult.textContent = message;
  elements.analysisResult.style.color = isError ? "#b91c1c" : "#4b5563";
}

function updatePathControls() {
  if (!elements.analysisToggle || !elements.analysisClear) return;
  const hasPath = Boolean(state.analysis.path);
  elements.analysisToggle.disabled = !hasPath;
  elements.analysisClear.disabled = !hasPath;
  if (!hasPath) {
    elements.analysisToggle.textContent = "Pfad hervorheben";
    return;
  }
  elements.analysisToggle.textContent = state.analysis.pathHighlight ? "Hervorhebung aus" : "Pfad hervorheben";
}

function updatePathVisibility(visibleNodeIds, visibleEdgeIds) {
  if (!state.analysis.path) return;
  const totalNodes = state.analysis.path.nodeIds.size;
  const totalEdges = state.analysis.path.edgeIds.size;
  const visibleNodes = Array.from(state.analysis.path.nodeIds).filter((id) => visibleNodeIds.has(id)).length;
  const visibleEdges = Array.from(state.analysis.path.edgeIds).filter((id) => visibleEdgeIds.has(id)).length;
  const visibilityNote =
    visibleNodes !== totalNodes || visibleEdges !== totalEdges
      ? `Sichtbar: ${visibleNodes}/${totalNodes} Knoten, ${visibleEdges}/${totalEdges} Kanten`
      : "Pfad vollständig sichtbar";
  const highlightNote = state.analysis.pathHighlight ? "Hervorhebung aktiv" : "Hervorhebung aus";
  const base = state.analysis.pathMessage || "Pfad gefunden";
  setAnalysisResult(`${base} · ${visibilityNote} · ${highlightNote}`);
}

function runPathAnalysis() {
  if (!state.graph) return;
  const startValue = elements.analysisStart?.value || "";
  const targetValue = elements.analysisTarget?.value || "";
  const startId = resolveNodeInput(startValue);
  const targetId = resolveNodeInput(targetValue);

  if (!startId || !targetId) {
    setAnalysisResult("Bitte gültigen Start- und Zielknoten wählen.", true);
    return;
  }

  const result = shortestPath(startId, targetId, state.graph.edges, { directed: true });
  if (!result) {
    state.analysis.path = null;
    state.analysis.pathHighlight = false;
    updatePathControls();
    setAnalysisResult("Kein gerichteter Pfad gefunden.", true);
    applyFilters();
    return;
  }

  state.analysis.path = {
    nodeIds: new Set(result.nodePath),
    edgeIds: new Set(result.edgePath),
    nodePath: result.nodePath,
    edgePath: result.edgePath
  };
  state.analysis.pathHighlight = true;
  state.analysis.pathMessage = `Pfad gefunden (${result.edgePath.length} Kanten): ${result.nodePath
    .map((id) => getNodeLabelById(id))
    .join(" → ")}`;
  updatePathControls();
  applyFilters();
}

function clearPathAnalysis() {
  state.analysis.path = null;
  state.analysis.pathHighlight = false;
  state.analysis.pathMessage = null;
  updatePathControls();
  setAnalysisResult("Noch keine Analyse.");
  applyFilters();
}

function togglePathHighlight() {
  if (!state.analysis.path) return;
  state.analysis.pathHighlight = !state.analysis.pathHighlight;
  updatePathControls();
  applyFilters();
}

function setValidationStatus(message, isError = false) {
  if (!elements.validationStatus) return;
  elements.validationStatus.textContent = message;
  elements.validationStatus.style.color = isError ? "#b91c1c" : "#4b5563";
}

function renderValidation() {
  if (!elements.validationList) return;
  elements.validationList.innerHTML = "";
  const { errors, warnings } = state.validation;
  if (!errors.length && !warnings.length) {
    setValidationStatus("Validierung: ok");
    return;
  }
  setValidationStatus(`Validierung: ${errors.length} Fehler, ${warnings.length} Warnungen`, errors.length > 0);
  errors.forEach((message) => {
    const li = document.createElement("li");
    li.className = "error";
    li.textContent = message;
    elements.validationList.appendChild(li);
  });
  warnings.forEach((message) => {
    const li = document.createElement("li");
    li.className = "warn";
    li.textContent = message;
    elements.validationList.appendChild(li);
  });
}

async function loadSchema() {
  if (state.validation.schema) return state.validation.schema;
  const candidates = [
    new URL("../schemas/pdl-schema.json", window.location.href).toString(),
    new URL("./schemas/pdl-schema.json", window.location.href).toString(),
    new URL("../../schemas/pdl-schema.json", window.location.href).toString()
  ];
  for (const url of candidates) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        state.validation.schema = await response.json();
        return state.validation.schema;
      }
    } catch (error) {
      console.warn("Schema fetch failed", error);
    }
  }
  return null;
}

async function ensureValidator() {
  if (state.validation.validator) return state.validation.validator;
  if (!window.Ajv) return null;
  const schema = await loadSchema();
  if (!schema) return null;
  const ajv = new window.Ajv({ allErrors: true, strict: false, allowUnionTypes: true });
  if (window.ajvFormats) {
    window.ajvFormats(ajv);
  }
  state.validation.validator = ajv.compile(schema);
  return state.validation.validator;
}

function checkReferences(pdl) {
  const issues = [];
  const entityIds = new Set((pdl.entities || []).map((entity) => entity.id));
  const eventIds = new Set((pdl.events || []).map((event) => event.id));

  (pdl.supply_chains || []).forEach((chain) => {
    (chain.stages || []).forEach((stage, idx) => {
      const [from, to] = stage;
      if (!entityIds.has(from) || !entityIds.has(to)) {
        issues.push({
          message: `Supply-Chain ${chain.id}: Stage ${idx + 1} verweist auf unbekannte Entity.`,
          nodeId: `chain:${chain.id}`,
          edgeId: `edge:${chain.id}-stage-${idx}`
        });
      }
    });
    (chain.dependencies || []).forEach((dep, idx) => {
      if (!entityIds.has(dep.from) || !entityIds.has(dep.to)) {
        issues.push({
          message: `Supply-Chain ${chain.id}: Dependency ${idx + 1} verweist auf unbekannte Entity.`,
          nodeId: `chain:${chain.id}`,
          edgeId: `edge:${chain.id}-dep-${idx}`
        });
      }
    });
  });

  (pdl.events || []).forEach((event) => {
    if (event.trigger?.target && !entityIds.has(event.trigger.target)) {
      issues.push({
        message: `Event ${event.id}: Trigger-Target ${event.trigger.target} existiert nicht.`,
        nodeId: `event:${event.id}`,
        edgeId: `edge:${event.id}-trigger`
      });
    }
    (event.causes || []).forEach((causeId, idx) => {
      if (!eventIds.has(causeId)) {
        issues.push({
          message: `Event ${event.id}: Cause ${causeId} existiert nicht.`,
          nodeId: `event:${event.id}`,
          edgeId: `edge:${event.id}-causes-${idx}`
        });
      }
    });
  });

  (pdl.cascades || []).forEach((cascade) => {
    if (cascade.origin && !eventIds.has(cascade.origin)) {
      issues.push({
        message: `Cascade ${cascade.id}: Origin ${cascade.origin} existiert nicht.`,
        nodeId: `cascade:${cascade.id}`,
        edgeId: `edge:${cascade.id}-origin`
      });
    }
    (cascade.timeline || []).forEach((entry, idx) => {
      const timelineNodeId = `timeline:${cascade.id}-${idx}`;
      if (entry.event && !eventIds.has(entry.event)) {
        issues.push({
          message: `Cascade ${cascade.id}: Timeline-Event ${entry.event} existiert nicht.`,
          nodeId: timelineNodeId,
          edgeId: `edge:${cascade.id}-seq-${idx}`
        });
      }
      (entry.affects || []).forEach((entityId) => {
        if (!entityIds.has(entityId)) {
          issues.push({
            message: `Cascade ${cascade.id}: Affects ${entityId} existiert nicht.`,
            nodeId: timelineNodeId,
            edgeId: `edge:${cascade.id}-${idx}-affects-${entityId}`
          });
        }
      });
    });
  });

  return issues;
}

async function validatePdl(pdl) {
  const errors = [];
  const warnings = [];
  const warningNodeIds = new Set();
  const warningEdgeIds = new Set();
  const validator = await ensureValidator();

  if (validator) {
    const valid = validator(pdl);
    if (!valid && validator.errors) {
      validator.errors.forEach((error) => {
        const path = error.instancePath || "/";
        errors.push(`Schema ${path}: ${error.message || "ungültig"}`);
      });
    }
  } else {
    warnings.push("Schema-Validierung nicht verfügbar.");
  }

  const refIssues = checkReferences(pdl);
  refIssues.forEach((issue) => {
    warnings.push(issue.message);
    if (issue.nodeId) warningNodeIds.add(issue.nodeId);
    if (issue.edgeId) warningEdgeIds.add(issue.edgeId);
  });

  return { errors, warnings, warningNodeIds, warningEdgeIds };
}

function updateUrlState() {
  if (!state.graph || state.uiState.applying) return;
  const payload = {
    conflictMode: state.conflictMode,
    search: elements.searchInput?.value || "",
    filters: {
      nodeTypes: Array.from(gatherFilters(elements.nodeTypeFilters)),
      edgeTypes: Array.from(gatherFilters(elements.edgeTypeFilters)),
      sectors: Array.from(gatherFilters(elements.sectorFilters)),
      locations: Array.from(gatherFilters(elements.locationFilters)),
      criticalities: Array.from(gatherFilters(elements.criticalityFilters)),
      entitySubtypes: Array.from(gatherFilters(elements.entitySubtypeFilters)),
      eventSubtypes: Array.from(gatherFilters(elements.eventSubtypeFilters))
    }
  };
  const encoded = encodeURIComponent(JSON.stringify(payload));
  history.replaceState(null, "", `#state=${encoded}`);
}

function readUrlState() {
  const hash = window.location.hash || "";
  if (!hash.startsWith("#state=")) return null;
  const raw = hash.slice("#state=".length);
  try {
    return JSON.parse(decodeURIComponent(raw));
  } catch (error) {
    console.warn("Could not parse URL state", error);
    return null;
  }
}

function applySelection(container, values) {
  if (!container || values === undefined || values === null) return;
  const set = new Set(values);
  container.querySelectorAll("input[type=checkbox]").forEach((input) => {
    input.checked = set.has(input.value);
  });
}

function applyPendingUiState() {
  const pending = state.uiState.pending;
  if (!pending) return;
  state.uiState.applying = true;
  if (typeof pending.conflictMode === "boolean") {
    elements.conflictMode.checked = pending.conflictMode;
    setConflictMode(pending.conflictMode);
  }
  if (typeof pending.search === "string") {
    if (elements.searchInput) elements.searchInput.value = pending.search;
  }
  if (pending.filters) {
    applySelection(elements.nodeTypeFilters, pending.filters.nodeTypes);
    applySelection(elements.edgeTypeFilters, pending.filters.edgeTypes);
    applySelection(elements.sectorFilters, pending.filters.sectors);
    applySelection(elements.locationFilters, pending.filters.locations);
    applySelection(elements.criticalityFilters, pending.filters.criticalities);
    applySelection(elements.entitySubtypeFilters, pending.filters.entitySubtypes);
    applySelection(elements.eventSubtypeFilters, pending.filters.eventSubtypes);
  }
  state.uiState.pending = null;
  state.uiState.applying = false;
}

function setExportStatus(message, isError = false) {
  if (!elements.exportStatus) return;
  elements.exportStatus.textContent = message;
  elements.exportStatus.style.color = isError ? "#b91c1c" : "#4b5563";
}

function stripNodeForExport(node) {
  return {
    id: node.id,
    type: node.type,
    subtype: node.subtype,
    label: node.label,
    data: node.data
  };
}

function stripEdgeForExport(edge) {
  return {
    id: edge.id,
    from: edge.from,
    to: edge.to,
    type: edge.type,
    data: edge.data
  };
}

function downloadBlob(filename, blob) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function exportFilteredJson() {
  if (!state.analysis.filteredNodes.length) {
    setExportStatus("Kein Graph geladen.", true);
    return;
  }
  const baseName = state.fileName ? state.fileName.replace(/\.[^/.]+$/, "") : "graph";
  const payload = {
    metadata: {
      ...state.graph?.metadata,
      exported_at: new Date().toISOString(),
      filtered: true
    },
    nodes: state.analysis.filteredNodes.map(stripNodeForExport),
    edges: state.analysis.filteredEdges.map(stripEdgeForExport)
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  downloadBlob(`${baseName}-filtered.json`, blob);
  setExportStatus("JSON-Export erstellt.");
}

function exportPng() {
  if (!state.network) {
    setExportStatus("Kein Graph geladen.", true);
    return;
  }
  const canvas = state.network?.canvas?.frame?.canvas;
  if (!canvas) {
    setExportStatus("PNG-Export nicht verfügbar.", true);
    return;
  }
  const dataUrl = canvas.toDataURL("image/png");
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = `${state.fileName ? state.fileName.replace(/\.[^/.]+$/, "") : "graph"}.png`;
  link.click();
  setExportStatus("PNG-Export erstellt.");
}

function setActiveTab(tab) {
  const isGraph = tab === "graph";
  const isYaml = tab === "yaml";
  const isAbout = tab === "about";

  elements.graphView.classList.toggle("active", isGraph);
  elements.yamlView.classList.toggle("active", isYaml);
  elements.aboutView.classList.toggle("active", isAbout);

  elements.tabGraph.classList.toggle("active", isGraph);
  elements.tabYaml.classList.toggle("active", isYaml);
  elements.tabAbout.classList.toggle("active", isAbout);
}

function updateFileLabel() {
  elements.fileLabel.textContent = state.fileName
    ? `Geladen: ${state.fileName}`
    : "Keine Datei geladen";
}

function formatYamlScalar(value) {
  if (value === null) return "null";
  if (value === undefined) return "—";
  if (typeof value === "string") return `"${value}"`;
  return String(value);
}

function describeYamlValue(value) {
  if (Array.isArray(value)) return "[" + value.length + "]";
  return null;
}

function resolveYamlNodeId(value, context) {
  if (!value || typeof value !== "object") return null;
  const id = value.id;
  if (id && context.rootKey === "entities") return `entity:${id}`;
  if (id && context.rootKey === "events") return `event:${id}`;
  if (id && context.rootKey === "cascades") return `cascade:${id}`;
  if (id && context.rootKey === "supply_chains") return `chain:${id}`;
  if (
    context.rootKey === "cascades" &&
    context.parentKey === "timeline" &&
    typeof context.index === "number" &&
    context.cascadeId
  ) {
    return `timeline:${context.cascadeId}-${context.index}`;
  }
  return null;
}

function buildYamlNode(key, value, depth = 0, context = {}) {
  const currentContext = {
    rootKey: context.rootKey,
    parentKey: context.parentKey ?? null,
    index: context.index ?? null,
    cascadeId: context.cascadeId ?? null
  };
  const searchText = `${key} ${typeof value === "object" ? "" : value}`.toLowerCase();

  if (value && typeof value === "object") {
    const details = document.createElement("details");
    details.open = depth < 1;
    details.dataset.searchText = searchText;

    const summary = document.createElement("summary");
    const meta = describeYamlValue(value);
    summary.innerHTML = `<span class="yaml-key">${key}</span>${meta ? `<span class="yaml-meta">${meta}</span>` : ""}`;
    details.appendChild(summary);

    const children = document.createElement("div");
    children.className = "yaml-children";

    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        const nextContext = {
          ...currentContext,
          parentKey: key,
          index,
          cascadeId: currentContext.cascadeId
        };
        children.appendChild(buildYamlNode(`[${index}]`, item, depth + 1, nextContext));
      });
    } else {
      Object.entries(value).forEach(([childKey, childValue]) => {
        const cascadeId =
          currentContext.rootKey === "cascades" && value.id ? value.id : currentContext.cascadeId;
        const nextContext = {
          ...currentContext,
          parentKey: key,
          index: null,
          cascadeId
        };
        children.appendChild(buildYamlNode(childKey, childValue, depth + 1, nextContext));
      });
    }

    details.appendChild(children);
    return details;
  }

  const leaf = document.createElement("div");
  leaf.className = "yaml-leaf";
  leaf.innerHTML = `<span class="yaml-key">${key}</span><span class="yaml-sep">:</span><span class="yaml-value">${formatYamlScalar(value)}</span>`;
  leaf.dataset.searchText = searchText;
  return leaf;
}

function renderYamlTree(data) {
  if (!elements.yamlTree) return;
  elements.yamlTree.innerHTML = "";
  if (!data) {
    elements.yamlTree.innerHTML = "<p class=\"details-empty\">Noch keine Datei geladen.</p>";
    if (elements.yamlSearch) elements.yamlSearch.value = "";
    return;
  }

  const container = document.createElement("div");
  Object.entries(data).forEach(([key, value]) => {
    container.appendChild(buildYamlNode(key, value, 0, { rootKey: key }));
  });
  elements.yamlTree.appendChild(container);
  if (elements.yamlSearch && elements.yamlSearch.value) {
    applyYamlSearch(elements.yamlSearch.value);
  }
}

function clearYamlHighlights() {
  if (!elements.yamlTree) return;
  elements.yamlTree.querySelectorAll(".yaml-highlight").forEach((el) => {
    el.classList.remove("yaml-highlight");
  });
  elements.yamlTree.querySelectorAll(".yaml-hidden").forEach((el) => {
    el.classList.remove("yaml-hidden");
  });
}

function applyYamlSearch(query) {
  if (!elements.yamlTree) return;
  const term = query.trim().toLowerCase();
  clearYamlHighlights();
  if (!term) return;

  const matches = [];
  const items = elements.yamlTree.querySelectorAll("[data-search-text]");
  items.forEach((item) => {
    const text = item.dataset.searchText || "";
    if (text.includes(term)) {
      matches.push(item);
    }
  });

  items.forEach((item) => {
    if (!matches.includes(item)) {
      item.classList.add("yaml-hidden");
    }
  });

  matches.forEach((item) => {
    item.classList.add("yaml-highlight");
    const parentDetails = item.closest("details");
    if (parentDetails) {
      parentDetails.open = true;
    }
  });
}

function setAllYamlDetails(open) {
  if (!elements.yamlTree) return;
  elements.yamlTree.querySelectorAll("details").forEach((details) => {
    details.open = open;
  });
}

function focusNodeFromYaml(nodeId) {
  if (!nodeId) return;
  const node = state.nodeById.get(nodeId);
  if (!node) {
    if (elements.yamlStatus) {
      elements.yamlStatus.textContent = "Passender Graph-Knoten nicht gefunden.";
    }
    return;
  }

  setActiveTab("graph");
  state.selectedNodeId = node.id;
  state.selectedNodeType = node.type;
  updateSupplyUI();
  renderDetailsSelection(node);
  applyFilters();

  const visible = state.nodesData.get(node.id);
  if (visible && state.network) {
    state.network.selectNodes([node.id]);
    state.network.focus(node.id, { scale: 1.1, animation: true });
  } else if (elements.yamlStatus) {
    elements.yamlStatus.textContent = "Knoten ist durch Filter ausgeblendet.";
  }
}

function getNodeLabelById(id) {
  const node = state.nodeById.get(id);
  return node ? node.label || node.id : id;
}

function getEventLabelById(id) {
  const node = state.nodeById.get(`event:${id}`);
  return node ? node.label || id : id;
}

function formatImpactPhrase(metric, value) {
  if (!value) return null;
  const sign = value.trim().startsWith("-") ? "reduziert" : value.trim().startsWith("+") ? "erhöht" : "verändert";
  const clean = value.replace("+", "").trim();
  const label = metric === "supply" ? "Supply" : metric === "demand" ? "Demand" : "Preis";
  return `${sign} ${label} um ${clean}`;
}

function formatDurationLabel(duration) {
  if (!duration) return null;
  const match = duration.match(/^(\d+)([dhwmy])$/);
  if (!match) return duration;
  const value = Number.parseInt(match[1], 10);
  const unit = match[2];
  const unitLabel = unit === "h"
    ? "Stunden"
    : unit === "d"
      ? "Tage"
      : unit === "w"
        ? "Wochen"
        : unit === "m"
          ? "Monate"
          : "Jahre";
  return `${value} ${unitLabel}`;
}

function buildEventExplanation(node) {
  const eventId = node.id.replace("event:", "");
  const impact = node.data?.impact;
  const causes = node.data?.causes || [];

  const phrases = [];
  if (impact) {
    const impactParts = [
      formatImpactPhrase("supply", impact.supply),
      formatImpactPhrase("demand", impact.demand),
      formatImpactPhrase("price", impact.price)
    ].filter(Boolean);
    if (impactParts.length) {
      phrases.push(impactParts.join(" und "));
    }
    const duration = formatDurationLabel(impact.duration);
    if (duration) {
      const lastIndex = phrases.length - 1;
      if (lastIndex >= 0) {
        phrases[lastIndex] = `${phrases[lastIndex]} für ${duration}`;
      } else {
        phrases.push(`wirkt für ${duration}`);
      }
    }
  }

  if (causes.length) {
    const labels = causes.map((id) => getEventLabelById(id));
    const list = labels.length === 1 ? labels[0] : `${labels.slice(0, -1).join(", ")} und ${labels[labels.length - 1]}`;
    phrases.push(`triggert ${list}`);
  }

  if (!phrases.length) return null;
  return `${eventId} ${phrases.join(" und ")}.`;
}

function buildCascadeExplanation(node) {
  const cascadeId = node.id.replace("cascade:", "");
  const raw = state.raw?.cascades?.find((c) => c.id === cascadeId);
  if (!raw) return null;
  const steps = raw.timeline || [];
  const stepCount = steps.length;
  const first = steps[0]?.event ? getEventLabelById(steps[0].event) : null;
  const last = steps[stepCount - 1]?.event ? getEventLabelById(steps[stepCount - 1].event) : null;
  const origin = raw.origin ? getEventLabelById(raw.origin) : null;
  const duration = steps.length
    ? formatDurationLabel(steps[stepCount - 1]?.at)
    : null;

  const parts = [];
  if (origin) parts.push(`startet mit ${origin}`);
  if (stepCount) parts.push(`umfasst ${stepCount} Schritte`);
  if (first && last && first !== last) {
    parts.push(`verläuft von ${first} bis ${last}`);
  }
  if (duration) parts.push(`Dauer bis zum letzten Schritt: ${duration}`);
  if (raw.probability !== undefined && raw.probability !== null) {
    parts.push(`Wahrscheinlichkeit ${raw.probability}`);
  }

  if (!parts.length) return null;
  return `${node.label || cascadeId} ${parts.join(", ")}.`;
}

function updateSupplyUI() {
  const buttons = document.querySelectorAll("[data-supply]");
  const isEntity = state.selectedNodeType === "entity";
  const label = state.selectedNodeId ? getNodeLabelById(state.selectedNodeId) : null;

  if (!isEntity || !state.selectedNodeId) {
    state.supplyMode = "off";
    elements.supplyStatus.textContent = isEntity
      ? "Kein Entity ausgewählt."
      : "Supply-Fokus nur für Entities verfügbar.";
  } else {
    elements.supplyStatus.textContent = `Entity: ${label}`;
  }

  buttons.forEach((button) => {
    const mode = button.dataset.supply;
    const shouldDisable = !isEntity || !state.selectedNodeId;
    button.disabled = shouldDisable && mode !== "off";
    button.classList.toggle("active", state.supplyMode === mode);
  });

  if (elements.supplyDim) {
    elements.supplyDim.disabled = !isEntity || !state.selectedNodeId;
  }
}

function collectSupply(startId, direction) {
  const adjacency = state.supplyAdjacency[direction];
  const nodeIds = new Set([startId]);
  const edgeIds = new Set();
  const queue = [startId];

  while (queue.length) {
    const current = queue.shift();
    const nextItems = adjacency.get(current) || [];
    nextItems.forEach(({ node, edgeId }) => {
      edgeIds.add(edgeId);
      if (!nodeIds.has(node)) {
        nodeIds.add(node);
        queue.push(node);
      }
    });
  }

  return { nodeIds, edgeIds };
}

function getSupplyHighlight() {
  if (state.supplyMode === "off") return null;
  if (state.selectedNodeType !== "entity" || !state.selectedNodeId) return null;

  let combinedNodes = new Set([state.selectedNodeId]);
  let combinedEdges = new Set();

  const merge = (result) => {
    result.nodeIds.forEach((id) => combinedNodes.add(id));
    result.edgeIds.forEach((id) => combinedEdges.add(id));
  };

  if (state.supplyMode === "upstream" || state.supplyMode === "both") {
    merge(collectSupply(state.selectedNodeId, "upstream"));
  }
  if (state.supplyMode === "downstream" || state.supplyMode === "both") {
    merge(collectSupply(state.selectedNodeId, "downstream"));
  }

  return { nodeIds: combinedNodes, edgeIds: combinedEdges };
}

function highlightSupplyNode(node) {
  return {
    ...node,
    borderWidth: (node.borderWidth || 1) + 2,
    color: {
      background: "#e0f2f1",
      border: "#0f766e",
      highlight: { background: "#ccfbf1", border: "#14b8a6" },
      hover: { background: "#ccfbf1", border: "#14b8a6" }
    }
  };
}

function highlightSupplyEdge(edge) {
  return {
    ...edge,
    width: (edge.width || 1) + 2,
    color: { color: "#0f766e", highlight: "#14b8a6" }
  };
}

function renderNodeDetails(node) {
  const rows = [
    ["ID", node.id],
    ["Typ", node.type],
    ["Subtyp", node.subtype],
    ["Sector", getNodeSector(node)],
    ["Location", getNodeLocation(node)],
    ["Criticality", getNodeCriticality(node)],
    ["Vulnerability", node.data?.vulnerability]
  ];

  const impactRaw = node.data?.impact ?? null;
  const impactParsed = node.data?.impact_parsed ?? null;
  const trigger = node.data?.trigger;
  const timeline = node.type === "timeline_entry" ? node.data : null;
  const cascadeRaw =
    node.type === "cascade"
      ? state.raw?.cascades?.find((cascade) => cascade.id === node.id.replace("cascade:", ""))
      : null;
  const explanation =
    node.type === "event"
      ? buildEventExplanation(node)
      : node.type === "cascade"
        ? buildCascadeExplanation(node)
        : null;
  const warningChip = state.validation.warningNodeIds.has(node.id)
    ? "<div class=\"detail-chip warn\">Referenzwarnung</div>"
    : "";

  const impactRows = [];
  if (impactRaw) {
    impactRows.push(
      ["Supply", impactRaw.supply],
      ["Demand", impactRaw.demand],
      ["Price", impactRaw.price],
      ["Duration", impactRaw.duration]
    );
  }
  if (impactParsed && impactParsed.duration_days !== undefined) {
    impactRows.push(["Duration Days", impactParsed.duration_days]);
  }

  const sections = [
    warningChip,
    renderExplanation(explanation),
    renderSection("Basisdaten", rows),
    renderSection("Trigger", trigger ? [
      ["Target", trigger.target ? getNodeLabelById(`entity:${trigger.target}`) : null],
      ["Probability", trigger.probability],
      ["Condition", trigger.condition]
    ] : []),
    renderSection("Impact", impactRows),
    renderSection(
      "Timeline",
      cascadeRaw
        ? (cascadeRaw.timeline || []).map((entry) => [
            entry.at,
            `${getEventLabelById(entry.event)}${entry.affects?.length ? ` (affects: ${entry.affects.join(", ")})` : ""}`
          ])
        : timeline
          ? [
              ["Cascade", timeline.cascade_id],
              ["Event", timeline.event],
              ["At", timeline.at],
              ["Affects", timeline.affects]
            ]
          : []
    ),
  ].filter(Boolean).join("");

  elements.detailsType.textContent = node.type;
  elements.detailsTitle.textContent = node.label || node.id;
  elements.detailsContent.innerHTML = sections || "<p class=\"details-empty\">Keine Detaildaten vorhanden.</p>";
  setDetails(JSON.stringify(node.data ?? node, null, 2));
}

function renderEdgeDetails(edge) {
  const rows = [
    ["ID", edge.id],
    ["Typ", edge.type],
    ["Von", getNodeLabelById(edge.from)],
    ["Zu", getNodeLabelById(edge.to)]
  ];
  const dataRows = edge.data ? Object.entries(edge.data) : [];
  const warningChip = state.validation.warningEdgeIds.has(edge.id)
    ? "<div class=\"detail-chip warn\">Referenzwarnung</div>"
    : "";
  const content = [
    warningChip,
    renderSection("Verbindung", rows),
    renderSection("Metadaten", dataRows)
  ].filter(Boolean).join("");

  elements.detailsType.textContent = "edge";
  elements.detailsTitle.textContent = edge.type || edge.id;
  elements.detailsContent.innerHTML = content || "<p class=\"details-empty\">Keine Detaildaten vorhanden.</p>";
  setDetails(JSON.stringify(edge.data ?? edge, null, 2));
}

function renderDetailsSelection(item) {
  if (!item) {
    renderDetailsEmpty();
    return;
  }
  if (item.from && item.to) {
    renderEdgeDetails(item);
  } else {
    renderNodeDetails(item);
  }
  if (state.showRawDetails) {
    elements.detailsRaw.classList.remove("hidden");
  } else {
    elements.detailsRaw.classList.add("hidden");
  }
}

function buildNetwork(graph) {
  addVisualStyles(graph);
  state.graph = graph;
  state.focus = null;
  state.selectedNodeId = null;
  state.selectedNodeType = null;
  state.supplyMode = "off";
  state.supplyAdjacency = { upstream: new Map(), downstream: new Map() };
  state.analysis.path = null;
  state.analysis.pathHighlight = false;
  state.analysis.pathMessage = null;
  updatePathControls();
  setAnalysisResult("Noch keine Analyse.");
  setExportStatus("");
  state.nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  state.edgeById = new Map(graph.edges.map((edge) => [edge.id, edge]));

  const supplyEdges = graph.edges.filter((edge) => edge.type === "supply_flow");
  state.supplyAdjacency.downstream = buildAdjacency(supplyEdges, { directed: true });
  const reversedSupply = supplyEdges.map((edge) => ({ ...edge, from: edge.to, to: edge.from }));
  state.supplyAdjacency.upstream = buildAdjacency(reversedSupply, { directed: true });

  updateSupplyUI();

  const nodeTypes = Array.from(new Set(graph.nodes.map((node) => node.type))).sort();
  const edgeTypes = Array.from(new Set(graph.edges.map((edge) => edge.type))).sort();
  const entitySubtypes = Array.from(
    new Set(graph.nodes.filter((n) => n.type === "entity" && n.subtype).map((n) => n.subtype))
  ).sort();
  const eventSubtypes = Array.from(
    new Set(graph.nodes.filter((n) => n.type === "event" && n.subtype).map((n) => n.subtype))
  ).sort();
  const rawSectors = graph.nodes.map((n) => getNodeSector(n));
  const rawLocations = graph.nodes.map((n) => getNodeLocation(n));
  const rawCriticalities = graph.nodes.map((n) => getNodeCriticality(n));

  const sectors = Array.from(new Set(rawSectors.filter(Boolean))).sort();
  const locations = Array.from(new Set(rawLocations.filter(Boolean))).sort();
  const criticalities = Array.from(new Set(rawCriticalities.filter(Boolean))).sort();

  const missingSector = rawSectors.some((value) => !value);
  const missingLocation = rawLocations.some((value) => !value);
  const missingCriticality = rawCriticalities.some((value) => !value);

  if (missingSector) sectors.push(UNKNOWN_VALUE);
  if (missingLocation) locations.push(UNKNOWN_VALUE);
  if (missingCriticality) criticalities.push(UNKNOWN_VALUE);

  createCheckboxList(elements.nodeTypeFilters, nodeTypes);
  createCheckboxList(elements.edgeTypeFilters, edgeTypes);

  // On each newly loaded file, default to entity + event node types.
  state.conflictMode = false;
  state.savedNodeTypeSelection = null;
  elements.conflictMode.checked = false;
  setConflictMode(false);

  const defaultNodeTypes = new Set(["entity", "event"]);
  const activeDefaultTypes = new Set(nodeTypes.filter((type) => defaultNodeTypes.has(type)));
  if (activeDefaultTypes.size) {
    setNodeTypeSelection(activeDefaultTypes);
  }

  if (sectors.length) {
    elements.sectorFilterBlock.classList.remove("hidden");
    createCheckboxList(elements.sectorFilters, sectors);
  } else {
    elements.sectorFilterBlock.classList.add("hidden");
  }

  if (locations.length) {
    elements.locationFilterBlock.classList.remove("hidden");
    createCheckboxList(elements.locationFilters, locations);
  } else {
    elements.locationFilterBlock.classList.add("hidden");
  }

  if (criticalities.length) {
    elements.criticalityFilterBlock.classList.remove("hidden");
    createCheckboxList(elements.criticalityFilters, criticalities);
  } else {
    elements.criticalityFilterBlock.classList.add("hidden");
  }

  if (entitySubtypes.length) {
    elements.entitySubtypeBlock.classList.remove("hidden");
    createCheckboxList(elements.entitySubtypeFilters, entitySubtypes);
  } else {
    elements.entitySubtypeBlock.classList.add("hidden");
  }

  if (eventSubtypes.length) {
    elements.eventSubtypeBlock.classList.remove("hidden");
    createCheckboxList(elements.eventSubtypeFilters, eventSubtypes);
  } else {
    elements.eventSubtypeBlock.classList.add("hidden");
  }

  updateNodeOptions();
  updateAnalysisPresets();

  state.nodesData = new vis.DataSet(graph.nodes);
  state.edgesData = new vis.DataSet(graph.edges);

  if (!state.network) {
    const options = {
      interaction: { hover: true, navigationButtons: true },
      physics: {
        enabled: true,
        stabilization: { iterations: 200 },
        barnesHut: { gravitationalConstant: -20000, springLength: 140 }
      },
      nodes: { shape: "dot" },
      edges: { smooth: { type: "dynamic" } }
    };
    state.network = new vis.Network(
      elements.graph,
      { nodes: state.nodesData, edges: state.edgesData },
      options
    );

    state.network.on("click", (params) => {
      if (params.nodes.length) {
        const node = state.nodesData.get(params.nodes[0]);
        state.selectedNodeId = node.id;
        state.selectedNodeType = node.type;
        updateSupplyUI();
        renderDetailsSelection(node);
        applyFilters();
        return;
      }
      if (params.edges.length) {
        const edge = state.edgesData.get(params.edges[0]);
        state.selectedNodeId = null;
        state.selectedNodeType = null;
        updateSupplyUI();
        renderDetailsSelection(edge);
        applyFilters();
        return;
      }
      const hadSupplyFocus = state.supplyMode !== "off";
      state.selectedNodeId = null;
      state.selectedNodeType = null;
      updateSupplyUI();
      renderDetailsEmpty();
      if (hadSupplyFocus) applyFilters();
    });
  } else {
    state.network.setData({ nodes: state.nodesData, edges: state.edgesData });
  }

  wireFilterEvents();
  applyPendingUiState();
  applyFilters();
  renderLegend();
  renderDetailsEmpty();
}

function wireFilterEvents() {
  const inputs = document.querySelectorAll(".filter-list input");
  inputs.forEach((input) => {
    input.addEventListener("change", applyFilters);
  });
}

function wireActionButtons() {
  document.querySelectorAll("button[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const targetId = button.dataset.target;
      const action = button.dataset.action;
      const container = document.getElementById(targetId);
      if (!container) return;
      const check = action === "select-all";
      container.querySelectorAll("input[type=checkbox]").forEach((input) => {
        input.checked = check;
      });
      applyFilters();
    });
  });
}

async function loadYamlText(name, text) {
  try {
    setValidationStatus("Validierung läuft...");
    const pdl = parseYaml(text);
    const graph = convertToGraphJson(pdl);
    const validation = await validatePdl(pdl);
    state.validation.errors = validation.errors;
    state.validation.warnings = validation.warnings;
    state.validation.warningNodeIds = validation.warningNodeIds;
    state.validation.warningEdgeIds = validation.warningEdgeIds;
    renderValidation();
    buildNetwork(graph);
    setStatus(`Geladen: ${name}`);
    state.raw = pdl;
    state.rawText = text;
    state.fileName = name;
    updateFileLabel();
    setGraphScenarioTitle(pdl?.scenario);
    renderYamlTree(pdl);
    if (elements.yamlStatus) {
      elements.yamlStatus.textContent = `Geladen: ${name}`;
    }
  } catch (error) {
    console.error(error);
    setStatus(`Fehler beim Parsen: ${error.message}`, true);
    state.raw = null;
    state.rawText = null;
    state.fileName = null;
    updateFileLabel();
    setGraphScenarioTitle(null);
    renderYamlTree(null);
    state.validation.errors = [];
    state.validation.warnings = [];
    state.validation.warningNodeIds = new Set();
    state.validation.warningEdgeIds = new Set();
    setValidationStatus("Validierung: fehlgeschlagen", true);
    if (elements.validationList) {
      elements.validationList.innerHTML = "";
    }
    if (elements.yamlStatus) {
      elements.yamlStatus.textContent = `Fehler beim Parsen: ${error.message}`;
    }
  }
}

function handleFileUpload(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => loadYamlText(file.name, reader.result);
  reader.onerror = () => setStatus("Fehler beim Lesen der Datei.", true);
  reader.readAsText(file);
}

async function loadExample() {
  const candidates = [
    new URL("./examples/s1-soja.pdl.yaml", window.location.href).toString(),
    new URL("../scenarios/s1-soja.pdl.yaml", window.location.href).toString(),
    new URL("./scenarios/s1-soja.pdl.yaml", window.location.href).toString()
  ];
  try {
    let lastError = null;
    for (const url of candidates) {
      const response = await fetch(url);
      if (response.ok) {
        const text = await response.text();
        await loadYamlText("s1-soja.pdl.yaml", text);
        return;
      }
      lastError = new Error(`HTTP ${response.status}`);
    }
    throw lastError || new Error("Unbekannter Fehler");
  } catch (error) {
    setStatus(
      "Beispieldatei konnte nicht geladen werden. Starte den Webserver im Repo-Root (z. B. `python3 -m http.server 8000`) oder lade die Datei über den Upload.",
      true
    );
  }
}

function wireUI() {
  state.uiState.pending = readUrlState();
  setGraphScenarioTitle(null);
  elements.supplyDim.checked = state.supplyDim;
  updateFileLabel();
  setActiveTab("graph");
  if (elements.analysisMenuToggle && elements.analysisMenu) {
    elements.analysisMenuToggle.addEventListener("click", (event) => {
      event.stopPropagation();
      elements.analysisMenu.classList.toggle("hidden");
    });
    document.addEventListener("click", (event) => {
      if (elements.analysisMenu.classList.contains("hidden")) return;
      const isInside = elements.analysisMenu.contains(event.target) || elements.analysisMenuToggle.contains(event.target);
      if (!isInside) {
        elements.analysisMenu.classList.add("hidden");
      }
    });
  }
  elements.fileInput.addEventListener("change", (event) => {
    handleFileUpload(event.target.files[0]);
  });
  elements.exampleBtn.addEventListener("click", loadExample);
  if (elements.searchInput) elements.searchInput.addEventListener("input", applyFilters);
  elements.conflictMode.addEventListener("change", (event) => {
    setConflictMode(event.target.checked);
    applyFilters();
  });
  elements.fitBtn.addEventListener("click", () => {
    if (state.network) state.network.fit({ animation: true });
  });
  elements.stabilizeBtn.addEventListener("click", () => {
    if (state.network) state.network.stabilize(200);
  });
  if (elements.exportJson) {
    elements.exportJson.addEventListener("click", exportFilteredJson);
  }
  if (elements.exportPng) {
    elements.exportPng.addEventListener("click", exportPng);
  }

  elements.detailsToggle.addEventListener("click", () => {
    state.showRawDetails = !state.showRawDetails;
    elements.detailsRaw.classList.toggle("hidden", !state.showRawDetails);
    elements.detailsToggle.textContent = state.showRawDetails ? "Übersicht" : "JSON";
  });

  elements.supplyDim.addEventListener("change", (event) => {
    state.supplyDim = event.target.checked;
    applyFilters();
  });

  elements.tabGraph.addEventListener("click", () => setActiveTab("graph"));
  elements.tabYaml.addEventListener("click", () => setActiveTab("yaml"));
  elements.tabAbout.addEventListener("click", () => setActiveTab("about"));
  elements.yamlExpand.addEventListener("click", () => setAllYamlDetails(true));
  elements.yamlCollapse.addEventListener("click", () => setAllYamlDetails(false));
  if (elements.yamlSearch) {
    elements.yamlSearch.addEventListener("input", (event) => {
      applyYamlSearch(event.target.value);
    });
  }

  document.querySelectorAll("[data-supply]").forEach((button) => {
    button.addEventListener("click", () => {
      const mode = button.dataset.supply;
      if (mode === state.supplyMode) {
        state.supplyMode = "off";
      } else {
        state.supplyMode = mode;
      }
      updateSupplyUI();
      applyFilters();
    });
  });

  if (elements.analysisFind) {
    elements.analysisFind.addEventListener("click", runPathAnalysis);
  }
  if (elements.analysisToggle) {
    elements.analysisToggle.addEventListener("click", togglePathHighlight);
  }
  if (elements.analysisClear) {
    elements.analysisClear.addEventListener("click", clearPathAnalysis);
  }
  if (elements.analysisStart) {
    elements.analysisStart.addEventListener("keydown", (event) => {
      if (event.key === "Enter") runPathAnalysis();
    });
  }
  if (elements.analysisTarget) {
    elements.analysisTarget.addEventListener("keydown", (event) => {
      if (event.key === "Enter") runPathAnalysis();
    });
  }

  wireActionButtons();
  renderLegend();
}

const TUTORIAL_STEPS = [
  {
    title: "Entities — Bausteine des Netzwerks",
    content: `
      <div class="tutorial-illustration">
        <svg viewBox="0 0 400 120" xmlns="http://www.w3.org/2000/svg">
          <circle cx="50" cy="60" r="22" fill="#16a34a" opacity="0.85"/>
          <text x="50" y="65" text-anchor="middle" font-size="9" fill="#fff" font-weight="600">Mfr</text>
          <circle cx="130" cy="60" r="22" fill="#16a34a" opacity="0.85"/>
          <text x="130" y="65" text-anchor="middle" font-size="9" fill="#fff" font-weight="600">Commodity</text>
          <circle cx="210" cy="60" r="22" fill="#16a34a" opacity="0.85"/>
          <text x="210" y="65" text-anchor="middle" font-size="9" fill="#fff" font-weight="600">Infra</text>
          <circle cx="290" cy="60" r="22" fill="#16a34a" opacity="0.85"/>
          <text x="290" y="65" text-anchor="middle" font-size="9" fill="#fff" font-weight="600">Service</text>
          <circle cx="370" cy="60" r="22" fill="#16a34a" opacity="0.85"/>
          <text x="370" y="65" text-anchor="middle" font-size="9" fill="#fff" font-weight="600">Region</text>
          <text x="50" y="100" text-anchor="middle" font-size="8" fill="#4b5563">manufacturer</text>
          <text x="130" y="100" text-anchor="middle" font-size="8" fill="#4b5563">commodity</text>
          <text x="210" y="100" text-anchor="middle" font-size="8" fill="#4b5563">infrastructure</text>
          <text x="290" y="100" text-anchor="middle" font-size="8" fill="#4b5563">service</text>
          <text x="370" y="100" text-anchor="middle" font-size="8" fill="#4b5563">region</text>
        </svg>
      </div>
      <h3>Entities</h3>
      <p>Entities sind die Knoten im Lieferkettennetzwerk. Sie repräsentieren alle Akteure und Ressourcen: Hersteller, Rohstoffe, Infrastruktur, Dienstleistungen und Regionen.</p>
      <div class="tutorial-concept">Jedes Entity hat eine <strong>vulnerability</strong> (0–1), die angibt, wie anfällig es für Störungen ist. Höhere Werte bedeuten größere Verwundbarkeit.</div>
    `
  },
  {
    title: "Supply Chains — Wertschöpfungsketten",
    content: `
      <div class="tutorial-illustration">
        <svg viewBox="0 0 400 100" xmlns="http://www.w3.org/2000/svg">
          <defs><marker id="arrowAmber" viewBox="0 0 10 7" refX="10" refY="3.5" markerWidth="8" markerHeight="6" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="#f59e0b"/></marker></defs>
          <circle cx="60" cy="50" r="20" fill="#f59e0b" opacity="0.85"/>
          <text x="60" y="54" text-anchor="middle" font-size="11" fill="#fff" font-weight="600">A</text>
          <circle cx="200" cy="50" r="20" fill="#f59e0b" opacity="0.85"/>
          <text x="200" y="54" text-anchor="middle" font-size="11" fill="#fff" font-weight="600">B</text>
          <circle cx="340" cy="50" r="20" fill="#f59e0b" opacity="0.85"/>
          <text x="340" y="54" text-anchor="middle" font-size="11" fill="#fff" font-weight="600">C</text>
          <line x1="82" y1="50" x2="178" y2="50" stroke="#f59e0b" stroke-width="2.5" marker-end="url(#arrowAmber)"/>
          <line x1="222" y1="50" x2="318" y2="50" stroke="#f59e0b" stroke-width="2.5" marker-end="url(#arrowAmber)"/>
          <line x1="80" y1="72" x2="320" y2="72" stroke="#f97316" stroke-width="1.5" stroke-dasharray="6 4"/>
          <text x="200" y="90" text-anchor="middle" font-size="9" fill="#f97316">dependency</text>
        </svg>
      </div>
      <h3>Supply Chains</h3>
      <p>Supply Chains verbinden Entities zu Wertschöpfungsketten. Der Warenfluss verläuft entlang der <strong>stages</strong> von Stufe zu Stufe.</p>
      <div class="tutorial-concept"><strong>stages</strong> definieren den Warenfluss (A → B → C). <strong>dependencies</strong> (gestrichelt) markieren kritische Abhängigkeiten zwischen Entities.</div>
    `
  },
  {
    title: "Events — Störungsereignisse",
    content: `
      <div class="tutorial-illustration">
        <svg viewBox="0 0 400 120" xmlns="http://www.w3.org/2000/svg">
          <defs><marker id="arrowRed" viewBox="0 0 10 7" refX="10" refY="3.5" markerWidth="8" markerHeight="6" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="#dc2626"/></marker></defs>
          <polygon points="60,15 72,45 90,45 76,62 82,90 60,74 38,90 44,62 30,45 48,45" fill="#dc2626" opacity="0.9"/>
          <text x="60" y="58" text-anchor="middle" font-size="9" fill="#fff" font-weight="700">Event</text>
          <circle cx="180" cy="52" r="16" fill="#16a34a" opacity="0.7"/>
          <text x="180" y="56" text-anchor="middle" font-size="9" fill="#fff">target</text>
          <line x1="85" y1="52" x2="162" y2="52" stroke="#dc2626" stroke-width="2" marker-end="url(#arrowRed)"/>
          <text x="124" y="44" text-anchor="middle" font-size="8" fill="#dc2626">trigger</text>
          <circle cx="300" cy="28" r="12" fill="#dc2626" opacity="0.6"/>
          <text x="300" y="32" text-anchor="middle" font-size="7" fill="#fff">E1</text>
          <circle cx="300" cy="58" r="12" fill="#dc2626" opacity="0.6"/>
          <text x="300" y="62" text-anchor="middle" font-size="7" fill="#fff">E2</text>
          <circle cx="300" cy="88" r="12" fill="#dc2626" opacity="0.6"/>
          <text x="300" y="92" text-anchor="middle" font-size="7" fill="#fff">E3</text>
          <line x1="85" y1="40" x2="286" y2="28" stroke="#9333ea" stroke-width="1.5" marker-end="url(#arrowRed)"/>
          <line x1="85" y1="52" x2="286" y2="58" stroke="#9333ea" stroke-width="1.5" marker-end="url(#arrowRed)"/>
          <line x1="85" y1="64" x2="286" y2="88" stroke="#9333ea" stroke-width="1.5" marker-end="url(#arrowRed)"/>
          <text x="220" y="108" text-anchor="middle" font-size="8" fill="#9333ea">causes</text>
        </svg>
      </div>
      <h3>Events</h3>
      <p>Events modellieren Störungen: Naturkatastrophen, Marktschocks, Infrastrukturausfälle. Sie sind der Motor der Simulation.</p>
      <div class="tutorial-concept">Jedes Event hat einen <strong>trigger</strong> (Auslöser → Ziel-Entity), einen <strong>impact</strong> (Supply/Demand/Preis-Änderung) und <strong>causes</strong> (Folgeereignisse, die es auslöst).</div>
    `
  },
  {
    title: "Cascades — Zeitliche Kaskaden",
    content: `
      <div class="tutorial-illustration">
        <svg viewBox="0 0 400 130" xmlns="http://www.w3.org/2000/svg">
          <defs><marker id="arrowBlue" viewBox="0 0 10 7" refX="10" refY="3.5" markerWidth="8" markerHeight="6" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="#7c3aed"/></marker></defs>
          <line x1="60" y1="20" x2="60" y2="115" stroke="#7c3aed" stroke-width="2" opacity="0.3"/>
          <circle cx="60" cy="25" r="6" fill="#7c3aed"/>
          <text x="78" y="29" font-size="9" fill="#4b5563">0d</text>
          <circle cx="60" cy="65" r="6" fill="#7c3aed"/>
          <text x="78" y="69" font-size="9" fill="#4b5563">14d</text>
          <circle cx="60" cy="110" r="6" fill="#7c3aed"/>
          <text x="78" y="114" font-size="9" fill="#4b5563">45d</text>
          <rect x="120" y="12" width="80" height="26" rx="8" fill="#dc2626" opacity="0.8"/>
          <text x="160" y="29" text-anchor="middle" font-size="9" fill="#fff">Dürre</text>
          <rect x="120" y="52" width="80" height="26" rx="8" fill="#dc2626" opacity="0.8"/>
          <text x="160" y="69" text-anchor="middle" font-size="9" fill="#fff">Ernteausfall</text>
          <rect x="120" y="97" width="80" height="26" rx="8" fill="#dc2626" opacity="0.8"/>
          <text x="160" y="114" text-anchor="middle" font-size="9" fill="#fff">Preisschock</text>
          <line x1="202" y1="25" x2="260" y2="25" stroke="#22c55e" stroke-width="1.5" marker-end="url(#arrowBlue)"/>
          <circle cx="280" cy="25" r="12" fill="#16a34a" opacity="0.5"/>
          <text x="280" y="29" text-anchor="middle" font-size="7" fill="#fff">E1</text>
          <line x1="202" y1="65" x2="260" y2="65" stroke="#22c55e" stroke-width="1.5" marker-end="url(#arrowBlue)"/>
          <circle cx="280" cy="65" r="12" fill="#16a34a" opacity="0.5"/>
          <text x="280" y="69" text-anchor="middle" font-size="7" fill="#fff">E2</text>
          <line x1="202" y1="110" x2="260" y2="110" stroke="#22c55e" stroke-width="1.5" marker-end="url(#arrowBlue)"/>
          <circle cx="280" cy="110" r="12" fill="#16a34a" opacity="0.5"/>
          <text x="280" y="114" text-anchor="middle" font-size="7" fill="#fff">E3</text>
          <text x="320" y="30" font-size="8" fill="#22c55e">affects</text>
        </svg>
      </div>
      <h3>Cascades</h3>
      <p>Cascades ordnen Events in eine chronologische Abfolge. Die Timeline zeigt, wann welches Event eintritt und welche Entities betroffen sind.</p>
      <div class="tutorial-concept">Jeder Zeitpunkt in der <strong>timeline</strong> hat ein <strong>at</strong> (Zeitversatz, z.B. 14d), ein <strong>event</strong> und eine Liste von <strong>affects</strong> (betroffene Entities).</div>
    `
  },
  {
    title: "Feedback-Loops — Verstärkende Rückkopplung",
    content: `
      <div class="tutorial-illustration">
        <svg viewBox="0 0 400 130" xmlns="http://www.w3.org/2000/svg">
          <defs><marker id="arrowLoop" viewBox="0 0 10 7" refX="10" refY="3.5" markerWidth="8" markerHeight="6" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="#dc2626"/></marker></defs>
          <circle cx="100" cy="40" r="24" fill="#dc2626" opacity="0.8"/>
          <text x="100" y="38" text-anchor="middle" font-size="8" fill="#fff">Zahlungs-</text>
          <text x="100" y="48" text-anchor="middle" font-size="8" fill="#fff">ausfall</text>
          <circle cx="300" cy="40" r="24" fill="#dc2626" opacity="0.8"/>
          <text x="300" y="38" text-anchor="middle" font-size="8" fill="#fff">Diesel-</text>
          <text x="300" y="48" text-anchor="middle" font-size="8" fill="#fff">mangel</text>
          <circle cx="200" cy="110" r="24" fill="#dc2626" opacity="0.8"/>
          <text x="200" y="108" text-anchor="middle" font-size="8" fill="#fff">Rechen-</text>
          <text x="200" y="118" text-anchor="middle" font-size="8" fill="#fff">zentrum</text>
          <line x1="126" y1="40" x2="274" y2="40" stroke="#dc2626" stroke-width="2" marker-end="url(#arrowLoop)"/>
          <line x1="288" y1="62" x2="218" y2="92" stroke="#dc2626" stroke-width="2" marker-end="url(#arrowLoop)"/>
          <line x1="178" y1="100" x2="112" y2="62" stroke="#dc2626" stroke-width="2" marker-end="url(#arrowLoop)"/>
          <text x="200" y="18" text-anchor="middle" font-size="10" fill="#dc2626" font-weight="600">Feedback-Loop</text>
        </svg>
      </div>
      <h3>Feedback-Loops</h3>
      <p>Feedback-Loops entstehen, wenn nachgelagerte Störungen vorgelagerte Systeme verschlechtern — ein sich selbst verstärkender Kreislauf.</p>
      <div class="tutorial-concept"><strong>Beispiel:</strong> Zahlungsausfall → Diesel-Beschaffung blockiert → Rechenzentren fallen schneller aus → weitere Zahlungsausfälle. Die Schleife verstärkt sich mit jeder Runde.</div>
    `
  },
  {
    title: "Dashboard bedienen",
    content: `
      <div class="tutorial-illustration">
        <svg viewBox="0 0 400 120" xmlns="http://www.w3.org/2000/svg">
          <rect x="10" y="8" width="380" height="104" rx="12" fill="#f6f1e8" stroke="#e2e8f0" stroke-width="1.5"/>
          <rect x="18" y="16" width="100" height="88" rx="8" fill="#fff" stroke="#e2e8f0"/>
          <text x="68" y="36" text-anchor="middle" font-size="9" fill="#4b5563" font-weight="600">Filter</text>
          <rect x="30" y="44" width="60" height="6" rx="3" fill="#e2e8f0"/>
          <rect x="30" y="56" width="50" height="6" rx="3" fill="#e2e8f0"/>
          <rect x="30" y="68" width="55" height="6" rx="3" fill="#e2e8f0"/>
          <rect x="30" y="80" width="45" height="6" rx="3" fill="#2563eb" opacity="0.3"/>
          <rect x="126" y="16" width="148" height="88" rx="8" fill="#fff" stroke="#e2e8f0"/>
          <text x="200" y="36" text-anchor="middle" font-size="9" fill="#4b5563" font-weight="600">Graph</text>
          <circle cx="170" cy="62" r="8" fill="#16a34a" opacity="0.6"/><circle cx="200" cy="52" r="6" fill="#f59e0b" opacity="0.6"/><circle cx="220" cy="72" r="7" fill="#dc2626" opacity="0.6"/><circle cx="190" cy="82" r="5" fill="#7c3aed" opacity="0.6"/>
          <line x1="178" y1="62" x2="194" y2="54" stroke="#64748b" stroke-width="1"/><line x1="206" y1="54" x2="214" y2="68" stroke="#ef4444" stroke-width="1"/><line x1="195" y1="80" x2="214" y2="74" stroke="#0ea5e9" stroke-width="1"/>
          <rect x="282" y="16" width="100" height="88" rx="8" fill="#fff" stroke="#e2e8f0"/>
          <text x="332" y="36" text-anchor="middle" font-size="9" fill="#4b5563" font-weight="600">Details</text>
          <rect x="294" y="44" width="76" height="6" rx="3" fill="#e2e8f0"/>
          <rect x="294" y="56" width="60" height="6" rx="3" fill="#e2e8f0"/>
          <rect x="294" y="68" width="70" height="6" rx="3" fill="#f97316" opacity="0.3"/>
          <rect x="294" y="80" width="50" height="6" rx="3" fill="#e2e8f0"/>
        </svg>
      </div>
      <h3>Dashboard bedienen</h3>
      <p>So nutzt du den PDL-Viewer effektiv:</p>
      <div class="tutorial-concept">
        <strong>1.</strong> Lade ein Szenario (YAML) über den Upload oder das Beispiel.<br>
        <strong>2.</strong> Filtere nach Knoten-/Kantentyp, Sektor oder Location.<br>
        <strong>3.</strong> Klicke auf einen Knoten für Details und Erklärungen.<br>
        <strong>4.</strong> Nutze <strong>Supply-Chain-Fokus</strong> für Upstream/Downstream-Analyse.<br>
        <strong>5.</strong> Öffne das <strong>Analyse</strong>-Menü für Pfadanalyse zwischen Knoten.
      </div>
    `
  }
];

const tutorialState = { step: 0, open: false };
const TUTORIAL_SEEN_KEY = "pdl-tutorial-seen";

function openTutorial() {
  tutorialState.step = 0;
  tutorialState.open = true;
  elements.tutorialOverlay.classList.remove("hidden");
  setTutorialStep(0);
}

function closeTutorial() {
  tutorialState.open = false;
  elements.tutorialOverlay.classList.add("hidden");
  localStorage.setItem(TUTORIAL_SEEN_KEY, "1");
}

function setTutorialStep(n) {
  tutorialState.step = n;
  const step = TUTORIAL_STEPS[n];
  elements.tutorialTitle.textContent = step.title;
  // Tutorial content is static/hardcoded, not user-provided
  elements.tutorialBody.innerHTML = step.content;
  elements.tutorialStep.textContent = `${n + 1} / ${TUTORIAL_STEPS.length}`;
  elements.tutorialPrev.style.visibility = n === 0 ? "hidden" : "visible";
  elements.tutorialNext.textContent = n === TUTORIAL_STEPS.length - 1 ? "Fertig" : "Weiter";

  const dots = elements.tutorialOverlay.querySelectorAll(".tutorial-dot");
  dots.forEach((dot, i) => {
    dot.classList.toggle("active", i === n);
    dot.classList.toggle("completed", i < n);
  });
}

function nextStep() {
  if (tutorialState.step < TUTORIAL_STEPS.length - 1) {
    setTutorialStep(tutorialState.step + 1);
  } else {
    closeTutorial();
  }
}

function prevStep() {
  if (tutorialState.step > 0) {
    setTutorialStep(tutorialState.step - 1);
  }
}

wireUI();

elements.tutorialBtn.addEventListener("click", openTutorial);
elements.tutorialClose.addEventListener("click", closeTutorial);
elements.tutorialPrev.addEventListener("click", prevStep);
elements.tutorialNext.addEventListener("click", nextStep);
elements.tutorialOverlay.addEventListener("click", (e) => {
  if (e.target === elements.tutorialOverlay) closeTutorial();
});

if (!localStorage.getItem(TUTORIAL_SEEN_KEY)) {
  openTutorial();
}
