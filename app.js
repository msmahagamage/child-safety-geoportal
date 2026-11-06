/* Geographic layers and measures exposed by the atlas. */
const layerSettings = {
  hotspots: {
    title: "Child crash density",
    description: "Hexagonal map cells summarize crash concentration; this is a density view, not a statistical hotspot test.",
    label: "crash map cells",
  },
  tracts: {
    title: "Child-involved fatal crashes by census tract",
    description: "Counties provide national context; zoom in to see filled census tract boundaries.",
    label: "census tracts",
  },
  roads: {
    title: "High-crash road corridors",
    description: "Roads are colored by their matched child-involved fatal-crash burden (all road classes where available).",
    label: "road corridors",
  },
  schools: {
    title: "Built environment around schools",
    description: "School clusters summarize the selected indicator; select a school to display its fixed two-mile study buffer.",
    label: "schools",
  },
};

const measureSettings = {
  child_crashes: { label: "Child-involved fatal crashes", legend: "Child-involved fatal crashes", scale: "count" },
  child_deaths: { label: "Child fatalities", legend: "Child fatalities", scale: "count" },
  ped_cyclist_deaths: { label: "Child pedestrian / cyclist deaths", legend: "Child pedestrian / cyclist deaths", scale: "count" },
  crashes_per_mile: { label: "Child-involved fatal crashes per road mile", legend: "Child-involved crashes per road mile", scale: "rate" },
  child_crash_rate: { label: "Child-involved fatal crashes per 10,000 children", legend: "Child-involved crashes per 10,000 children", scale: "rate" },
  child_death_rate: { label: "Child fatalities per 10,000 children", legend: "Child fatalities per 10,000 children", scale: "rate" },
  ped_cyclist_death_rate: { label: "Child pedestrian / cyclist deaths per 10,000 children", legend: "Child ped. / cyclist deaths per 10,000 children", scale: "rate" },
  sidewalk_tertile: { label: "Sidewalk prevalence tertile", legend: "Sidewalk tertile", scale: "tertile" },
  single_lane_tertile: { label: "Single-lane road tertile", legend: "Single-lane tertile", scale: "tertile" },
  greenness_tertile: { label: "Street greenness tertile", legend: "Greenness tertile", scale: "tertile" },
  streetlight_tertile: { label: "Streetlight prevalence tertile", legend: "Streetlight tertile", scale: "tertile" },
  stopsign_tertile: { label: "Stop-sign prevalence tertile", legend: "Stop-sign tertile", scale: "tertile" },
  prop_sidewalk: { label: "Sidewalk image share", legend: "Sidewalk image share", scale: "proportion" },
  prop_single_lane: { label: "Single-lane road image share", legend: "Single-lane image share", scale: "proportion" },
  avg_stopsign: { label: "Average stop-sign presence", legend: "Stop-sign presence", scale: "proportion" },
  prop_green: { label: "Street greenness image share", legend: "Street greenness", scale: "proportion" },
  prop_streetlight: { label: "Streetlight image share", legend: "Streetlight image share", scale: "proportion" },
};

const layerMeasures = {
  hotspots: ["child_crashes", "child_deaths", "ped_cyclist_deaths"],
  tracts: [
    "child_crashes", "child_deaths", "ped_cyclist_deaths",
    "child_crash_rate", "child_death_rate", "ped_cyclist_death_rate",
    "sidewalk_tertile", "single_lane_tertile", "stopsign_tertile", "greenness_tertile", "streetlight_tertile",
  ],
  roads: ["child_crashes", "crashes_per_mile", "child_deaths", "ped_cyclist_deaths"],
  schools: ["prop_sidewalk", "prop_single_lane", "avg_stopsign", "prop_green", "prop_streetlight"],
};

// Highest versus lowest built-environment tertile from the national two-mile
// school-buffer negative-binomial models. These are study-wide associations,
// not predictions for an individual school.
const schoolRegressionResults = {
  prop_sidewalk: [[0.72, 0.67, 0.78], [0.79, 0.70, 0.88], [0.91, 0.72, 1.15]],
  prop_single_lane: [[0.96, 0.92, 1.01], [0.99, 0.93, 1.06], [1.01, 0.88, 1.17]],
  avg_stopsign: [[0.87, 0.83, 0.92], [0.90, 0.83, 0.98], [0.95, 0.81, 1.12]],
  prop_green: [[1.06, 1.00, 1.11], [0.96, 0.89, 1.04], [1.09, 0.92, 1.28]],
  prop_streetlight: [[1.09, 1.02, 1.17], [1.08, 0.97, 1.20], [1.62, 1.29, 2.04]],
};

const outcomeKeys = ["child_crashes", "child_deaths", "ped_cyclist_deaths"];
const fillPalette = ["#fff3e0", "#fdd49e", "#fdbb84", "#fc8d59", "#d7301f"];
const missingColor = "#d9dfdc";
const zeroColor = "#f7f8f4";
const tractZoomThreshold = 5;
const schoolBufferMiles = 2;
const schoolBufferMeters = schoolBufferMiles * 1609.344;
const stateNames = {
  "01": "Alabama", "02": "Alaska", "04": "Arizona", "05": "Arkansas", "06": "California",
  "08": "Colorado", "09": "Connecticut", "10": "Delaware", "11": "District of Columbia", "12": "Florida",
  "13": "Georgia", "15": "Hawaii", "16": "Idaho", "17": "Illinois", "18": "Indiana", "19": "Iowa",
  "20": "Kansas", "21": "Kentucky", "22": "Louisiana", "23": "Maine", "24": "Maryland", "25": "Massachusetts",
  "26": "Michigan", "27": "Minnesota", "28": "Mississippi", "29": "Missouri", "30": "Montana",
  "31": "Nebraska", "32": "Nevada", "33": "New Hampshire", "34": "New Jersey", "35": "New Mexico",
  "36": "New York", "37": "North Carolina", "38": "North Dakota", "39": "Ohio", "40": "Oklahoma",
  "41": "Oregon", "42": "Pennsylvania", "44": "Rhode Island", "45": "South Carolina", "46": "South Dakota",
  "47": "Tennessee", "48": "Texas", "49": "Utah", "50": "Vermont", "51": "Virginia",
  "53": "Washington", "54": "West Virginia", "55": "Wisconsin", "56": "Wyoming",
};

const mapLayers = {};
const tractDataById = new Map();
const tractStateLayers = new Map();
const tractStateRequests = new Map();
let stateIndex = {};
let countyFillLayer = null;
let countyOutlineLayer = null;
let roadLayer = null;
let selectedSchoolBuffer = null;
let selectedSchoolFeature = null;
let schoolCrashOverlay = null;
let schoolRoadOverlay = null;
let selectedLayer = "tracts";
const geographySelections = Object.fromEntries(
  Object.keys(layerSettings).map((layer) => [layer, { state: "all", county: "all", zip: "all" }]),
);
let geographySelection = geographySelections[selectedLayer];
let pointFeatures = [];
let pointHitGrid = Object.create(null);
let pointHitCellSize = 14;
let pointMeasureKey = "child_crashes";
let activeTractDomain = { maximum: 0, cap: 0 };
let activeCountyDomain = { maximum: 0, cap: 0 };
let activeRoadDomain = { maximum: 0, cap: 0 };
let overviewCountyValues = new Map();

const layerButtons = document.querySelectorAll(".layer-tab");
const measureSelect = document.getElementById("measure-select");
const mapStage = document.getElementById("map-stage");
const emptyState = document.getElementById("empty-state");
const hotspotFilters = document.getElementById("hotspot-filters");
const schoolFilters = document.getElementById("school-filters");
const yearSelect = document.getElementById("year-select");
const ageSelect = document.getElementById("age-select");
const stateFilter = document.getElementById("state-filter");
const countyFilter = document.getElementById("county-filter");
const zipFilter = document.getElementById("zip-filter");
const zipFilterGroup = document.getElementById("zip-filter-group");
const clearLocationButton = document.getElementById("clear-location");
const schoolCrashesToggle = document.getElementById("school-crashes-toggle");
const schoolRoadsToggle = document.getElementById("school-roads-toggle");
const schoolContextNote = document.getElementById("school-context-note") || (() => {
  // Create the note if an older cached index.html is loaded, so a missing
  // element can never stop the overlays from drawing.
  const note = document.createElement("p");
  note.className = "buffer-note";
  note.id = "school-context-note";
  schoolRoadsToggle.closest("label").after(note);
  return note;
})();
const nationalOverview = document.getElementById("national-overview");
const nationalOverviewSvg = document.getElementById("national-overview-svg");
const nationalOverviewTooltip = document.getElementById("national-overview-tooltip");
const nationalOverviewPrompt = document.getElementById("national-overview-prompt");
const mapSourceCaption = document.getElementById("map-source-caption");

/* Leaflet uses Web Mercator for the detailed street map. */
const nationalView = { center: [39.2, -98.6], zoom: 4 };
const map = L.map("map", { zoomControl: false, preferCanvas: true }).setView(nationalView.center, nationalView.zoom);
L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}", {
  maxZoom: 19,
  attribution: "Tiles &copy; Esri, TomTom, Garmin, FAO, NOAA, USGS, EPA, NPS, and the GIS User Community",
}).addTo(map);
L.control.zoom({ position: "topright" }).addTo(map);

// Move the existing Home action into Leaflet's control stack.
const homeControl = L.control({ position: "topright" });
homeControl.onAdd = () => {
  const container = L.DomUtil.create("div", "leaflet-bar map-home-control");
  container.appendChild(document.getElementById("reset-map"));
  L.DomEvent.disableClickPropagation(container);
  L.DomEvent.disableScrollPropagation(container);
  return container;
};
homeControl.addTo(map);

// Draw the dots in a map pane that sits below the popup pane, so popups and
// tooltips always open on top of the points.
const pointPane = map.createPane("pointPane");
pointPane.style.zIndex = 450;
pointPane.style.pointerEvents = "none";
const pointCanvas = document.createElement("canvas");
pointCanvas.className = "point-overlay-canvas";
pointPane.appendChild(pointCanvas);
// Crash and road overlays for a selected school draw above the school dots.
map.createPane("contextPane").style.zIndex = 460;
const pointContext = pointCanvas.getContext("2d");

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function numberOrZero(value) {
  return numberOrNull(value) ?? 0;
}

function getValue(feature, measureKey) {
  const value = numberOrNull(feature?.properties?.[measureKey]);
  return value !== null && value >= 0 ? value : null;
}

function formatValue(value, measureKey) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "No data";
  const number = Number(value);
  const scale = measureSettings[measureKey]?.scale;
  if (scale === "proportion") return `${(number * 100).toFixed(1)}%`;
  if (scale === "rate") return number.toFixed(1);
  if (scale === "tertile") return `Tertile ${Number.isInteger(number) ? number : number.toFixed(1)}`;
  return number.toLocaleString();
}

function measureDomain(features, measureKey) {
  const values = features
    .map((feature) => getValue(feature, measureKey))
    .filter((value) => value !== null && value > 0)
    .sort((a, b) => a - b);
  if (!values.length) return { maximum: 0, cap: 0 };
  const capIndex = Math.min(values.length - 1, Math.floor(values.length * 0.95));
  return { maximum: values[values.length - 1], cap: values[capIndex] || values[values.length - 1] };
}

function measureColor(value, domain, measureKey) {
  if (value === null || value === undefined) return missingColor;
  if (value <= 0) return zeroColor;
  const scale = measureSettings[measureKey]?.scale;
  let share;
  if (scale === "tertile") share = Math.min(1, value / 3);
  else if (scale === "count") share = Math.log1p(value) / Math.log1p(domain.cap || domain.maximum || 1);
  else share = value / (domain.cap || domain.maximum || 1);
  const index = Math.min(fillPalette.length - 1, Math.max(0, Math.ceil(Math.min(1, share) * fillPalette.length) - 1));
  return fillPalette[index];
}

function updateLegend(features, measureKey, titleSuffix = "") {
  const domain = measureDomain(features, measureKey);
  document.getElementById("legend-title").textContent = `${measureSettings[measureKey].legend}${titleSuffix}`;
  document.getElementById("legend-max").textContent = formatValue(domain.maximum, measureKey);
  return domain;
}

function projectCoordinate(longitude, latitude) {
  const clampedLatitude = Math.max(-85.0511, Math.min(85.0511, latitude));
  const sineLatitude = Math.sin((clampedLatitude * Math.PI) / 180);
  return [
    (longitude + 180) / 360,
    0.5 - Math.log((1 + sineLatitude) / (1 - sineLatitude)) / (4 * Math.PI),
  ];
}

function parseCsvRow(line) {
  const values = [];
  let value = "";
  let insideQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (insideQuotes && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else insideQuotes = !insideQuotes;
    } else if (character === "," && !insideQuotes) {
      values.push(value);
      value = "";
    } else value += character;
  }
  values.push(value);
  return values;
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/);
  const headers = parseCsvRow(lines[0]);
  const rows = [];
  // Most lines contain no quoted fields, so a plain split is much faster.
  for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    if (!line) continue;
    const values = line.includes('"') ? parseCsvRow(line) : line.split(",");
    const row = {};
    for (let index = 0; index < headers.length; index += 1) row[headers[index]] = values[index] ?? "";
    rows.push(row);
  }
  return rows;
}

function popupContent(titleText, rows) {
  const popup = document.createElement("div");
  popup.className = "map-popup";
  const title = document.createElement("strong");
  title.textContent = titleText;
  popup.append(title);
  rows.forEach(([label, value]) => {
    const row = document.createElement("p");
    row.textContent = `${label}: ${value}`;
    popup.append(row);
  });
  return popup;
}

function makeTractRecords(rows) {
  return rows.map((row) => {
    const geoid = String(row.GEOID || row.cetract || "").padStart(11, "0");
    const feature = {
      type: "Feature",
      properties: {
        geoid,
        child_crashes: numberOrZero(row.fatal_collisions_with_children),
        child_deaths: numberOrZero(row.children_fatalities),
        ped_cyclist_deaths: numberOrZero(row.ped_cycle_children_fatalities),
        child_crash_rate: numberOrNull(row.fatal_collisions_with_children_p10k),
        child_death_rate: numberOrNull(row.children_fatalities_p10k),
        ped_cyclist_death_rate: numberOrNull(row.ped_cycle_children_fatalities_p10k),
        sidewalk_tertile: numberOrNull(row.tertsidewalk),
        single_lane_tertile: numberOrNull(row.tertsinglelane),
        streetlight_tertile: numberOrNull(row.tertstreetlight),
        stopsign_tertile: numberOrNull(row.tertstopsign),
        greenness_tertile: numberOrNull(row.tertgreen),
        children: numberOrZero(row.child_total),
        in_sample: row.in_sample === "1",
      },
      geometry: null,
    };
    tractDataById.set(geoid, feature.properties);
    return feature;
  });
}

function makeSchoolFeatures(rows) {
  return rows.flatMap((row) => {
    const longitude = Number(row.longitude);
    const latitude = Number(row.latitude);
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return [];
    return [{
      projected: projectCoordinate(longitude, latitude),
      type: "Feature",
      properties: {
        ncesid_t: row.ncesid_t,
        school_name: row.school_name || "School",
        state_fips: row.state_fips,
        county_fips: row.county_fips,
        zip_code: row.zip_code,
        tract_id: row.tract_id,
        prop_sidewalk: numberOrNull(row.prop_sidewalk),
        prop_single_lane: numberOrNull(row.prop_single_lane),
        avg_stopsign: numberOrNull(row.avg_stopsign),
        prop_green: numberOrNull(row.prop_green),
        prop_streetlight: numberOrNull(row.prop_streetlight),
        study_crashes: numberOrZero(row.study_crashes),
        study_child_deaths: numberOrZero(row.study_child_deaths),
        study_ped_deaths: numberOrZero(row.study_ped_deaths),
      },
      geometry: { type: "Point", coordinates: [longitude, latitude] },
    }];
  });
}

function makeCrashFeatures(rows) {
  return rows.flatMap((row) => {
    const longitude = Number(row.longitude);
    const latitude = Number(row.latitude);
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return [];
    return [{
      projected: projectCoordinate(longitude, latitude),
      type: "Feature",
      properties: {
        crash_id: row.crash_id,
        school_id: row.school_id || "",
        year: numberOrNull(row.year),
        hour: numberOrNull(row.hour),
        state_name: row.state_name,
        county_name: row.county_name,
        county_fips: row.county_fips,
        child_crashes: 1,
        child_count: numberOrZero(row.child_count),
        child_deaths: numberOrZero(row.child_deaths),
        ped_cyclist_deaths: numberOrZero(row.ped_cyclist_deaths),
        age_0_9: numberOrZero(row.age_0_9),
        age_10_14: numberOrZero(row.age_10_14),
        age_15_17: numberOrZero(row.age_15_17),
      },
      geometry: { type: "Point", coordinates: [longitude, latitude] },
    }];
  });
}

function featureCountyFips(feature) {
  const properties = feature?.properties || {};
  if (properties.county_fips) return String(properties.county_fips).padStart(5, "0");
  if (properties.geoid) return String(properties.geoid).padStart(11, "0").slice(0, 5);
  return "";
}

function featureMatchesGeography(feature) {
  const countyFips = featureCountyFips(feature);
  if (geographySelection.state !== "all" && countyFips.slice(0, 2) !== geographySelection.state) return false;
  if (geographySelection.county !== "all" && countyFips !== geographySelection.county) return false;
  if (
    selectedLayer === "schools"
    && geographySelection.zip !== "all"
    && String(feature?.properties?.zip_code || "").padStart(5, "0") !== geographySelection.zip
  ) return false;
  return true;
}

function filteredTractFeatures() {
  return (mapLayers.tracts?.features || []).filter(featureMatchesGeography);
}

function filteredSchoolFeatures() {
  return (mapLayers.schools?.features || []).filter(featureMatchesGeography);
}

function filteredRoadFeatures() {
  return (mapLayers.roads?.features || []).filter(featureMatchesGeography);
}

function filteredHotspotFeatures() {
  const features = mapLayers.hotspots?.features || [];
  const year = yearSelect.value;
  const age = ageSelect.value;
  return features.filter((feature) => {
    const yearMatches = year === "all" || String(feature.properties.year) === year;
    const ageMatches = age === "all" || feature.properties[age] > 0;
    return yearMatches && ageMatches && featureMatchesGeography(feature);
  });
}

function drawHexagon(context, x, y, radius) {
  context.beginPath();
  for (let index = 0; index < 6; index += 1) {
    const angle = (Math.PI / 3) * index - Math.PI / 6;
    const pointX = x + Math.cos(angle) * radius;
    const pointY = y + Math.sin(angle) * radius;
    if (index === 0) context.moveTo(pointX, pointY);
    else context.lineTo(pointX, pointY);
  }
  context.closePath();
}

function drawPointCells() {
  const size = map.getSize();
  // Keep the canvas aligned with the visible window as the map pane moves.
  L.DomUtil.setPosition(pointCanvas, map.containerPointToLayerPoint([0, 0]));
  const pixelRatio = window.devicePixelRatio || 1;
  pointCanvas.style.width = `${size.x}px`;
  pointCanvas.style.height = `${size.y}px`;
  pointCanvas.width = Math.round(size.x * pixelRatio);
  pointCanvas.height = Math.round(size.y * pixelRatio);
  pointContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  pointContext.clearRect(0, 0, size.x, size.y);
  pointHitGrid = Object.create(null);

  if (!new Set(["schools", "hotspots"]).has(selectedLayer) || !pointFeatures.length) return;

  const showIndividualSchools = selectedLayer === "schools"
    && (geographySelection.state !== "all" || map.getZoom() >= 7);
  pointHitCellSize = selectedLayer === "hotspots" ? 24 : showIndividualSchools ? 8 : 14;
  const worldSize = 256 * (2 ** map.getZoom());
  // The canvas sits in the map container (not the panning map pane), so dots
  // must be positioned from the current top-left pixel of the view. Using the
  // zoom-time pixel origin shifts every dot after the map is panned.
  const pixelOrigin = map.getPixelBounds().min;
  const bins = Object.create(null);
  pointFeatures.forEach((feature) => {
    const pointX = feature.projected[0] * worldSize - pixelOrigin.x;
    const pointY = feature.projected[1] * worldSize - pixelOrigin.y;
    if (pointX < -20 || pointY < -20 || pointX > size.x + 20 || pointY > size.y + 20) return;
    const cellX = Math.floor(pointX / pointHitCellSize);
    const cellY = Math.floor(pointY / pointHitCellSize);
    const key = `${cellX}:${cellY}`;
    if (!bins[key]) bins[key] = { x: 0, y: 0, records: 0, values: {}, features: [] };
    const bin = bins[key];
    bin.x += pointX;
    bin.y += pointY;
    bin.records += 1;
    bin.features.push(feature);
    layerMeasures[selectedLayer].forEach((measureKey) => {
      bin.values[measureKey] = (bin.values[measureKey] || 0) + (getValue(feature, measureKey) ?? 0);
    });
  });

  const visibleBins = Object.entries(bins);
  const isSchoolLayer = selectedLayer === "schools";
  const maximum = visibleBins.reduce((largest, [, bin]) => {
    const value = bin.values[pointMeasureKey] / (isSchoolLayer ? bin.records : 1);
    return Math.max(largest, value);
  }, 0);
  document.getElementById("legend-title").textContent = `${measureSettings[pointMeasureKey].legend}${isSchoolLayer ? (showIndividualSchools ? " per school" : " per map cell") : " density"}`;
  document.getElementById("legend-max").textContent = formatValue(maximum, pointMeasureKey);
  const domain = { maximum, cap: maximum };

  visibleBins.forEach(([key, bin]) => {
    const pointX = bin.x / bin.records;
    const pointY = bin.y / bin.records;
    const value = bin.values[pointMeasureKey] / (isSchoolLayer ? bin.records : 1);
    pointContext.globalAlpha = selectedLayer === "hotspots" ? 0.72 : 0.86;
    pointContext.fillStyle = measureColor(value, domain, pointMeasureKey);
    if (selectedLayer === "hotspots") {
      drawHexagon(pointContext, pointX, pointY, 10.5);
    } else {
      pointContext.beginPath();
      pointContext.arc(pointX, pointY, 3.5 + Math.min(2.5, Math.sqrt(value / (maximum || 1)) * 2.5), 0, Math.PI * 2);
    }
    pointContext.fill();
    pointContext.globalAlpha = 1;
    pointHitGrid[key] = { x: pointX, y: pointY, bin };
  });
}

function nearestPointBin(containerPoint) {
  const cellX = Math.floor(containerPoint.x / pointHitCellSize);
  const cellY = Math.floor(containerPoint.y / pointHitCellSize);
  let nearest = null;
  let nearestDistance = selectedLayer === "hotspots" ? 18 : 14;
  for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
    for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
      const candidate = pointHitGrid[`${cellX + offsetX}:${cellY + offsetY}`];
      if (!candidate) continue;
      const distance = Math.hypot(candidate.x - containerPoint.x, candidate.y - containerPoint.y);
      if (distance < nearestDistance) {
        nearest = candidate;
        nearestDistance = distance;
      }
    }
  }
  return nearest;
}

function clearSchoolContextOverlays() {
  if (schoolCrashOverlay) map.removeLayer(schoolCrashOverlay);
  if (schoolRoadOverlay) map.removeLayer(schoolRoadOverlay);
  schoolCrashOverlay = null;
  schoolRoadOverlay = null;
}

function coordinatePairs(coordinates) {
  if (!Array.isArray(coordinates)) return [];
  if (coordinates.length >= 2 && Number.isFinite(Number(coordinates[0])) && Number.isFinite(Number(coordinates[1]))) {
    return [[Number(coordinates[0]), Number(coordinates[1])]];
  }
  return coordinates.flatMap(coordinatePairs);
}

function roadTouchesSchoolBuffer(feature, center) {
  const cosine = Math.cos((center.lat * Math.PI) / 180);
  const toMeters = ([longitude, latitude]) => [
    (longitude - center.lng) * 111320 * cosine,
    (latitude - center.lat) * 110540,
  ];
  const lines = feature.geometry.type === "MultiLineString" ? feature.geometry.coordinates : [feature.geometry.coordinates];
  // Test whole segments, not just vertices, so long straight segments that
  // cross the buffer without a vertex inside it are still found.
  return lines.some((line) => {
    for (let index = 1; index < line.length; index += 1) {
      const [x1, y1] = toMeters(line[index - 1]);
      const [x2, y2] = toMeters(line[index]);
      const dx = x2 - x1;
      const dy = y2 - y1;
      const lengthSquared = dx * dx + dy * dy;
      const share = lengthSquared ? Math.max(0, Math.min(1, -(x1 * dx + y1 * dy) / lengthSquared)) : 0;
      if (Math.hypot(x1 + share * dx, y1 + share * dy) <= schoolBufferMeters) return true;
    }
    return false;
  });
}

function updateSchoolContextNote(crashCount, roadCount) {
  const parts = [];
  if (crashCount !== null) parts.push(`${crashCount} fatal child-involved ${crashCount === 1 ? "crash" : "crashes"} assigned to this school in the study (each crash goes to its nearest school within 2 miles, so other crashes inside the circle may belong to a nearer school). Black-outlined dots: fill is pale orange for 0 child deaths, orange for 1, dark red for 2 or more`);
  if (roadCount !== null) {
    parts.push(roadCount
      ? `${roadCount} high-crash road ${roadCount === 1 ? "segment" : "segments"} inside the buffer`
      : "no high-crash road corridors inside the buffer");
  }
  schoolContextNote.textContent = parts.length ? `${parts.join("; ")}.` : "";
}

async function refreshSchoolContextOverlays() {
  clearSchoolContextOverlays();
  let crashCount = null;
  let roadCount = null;
  updateSchoolContextNote(null, null);
  if (!selectedSchoolFeature || selectedLayer !== "schools") return;
  const [longitude, latitude] = selectedSchoolFeature.geometry.coordinates;
  const center = L.latLng(latitude, longitude);

  if (schoolCrashesToggle.checked) {
    await loadHotspotData();
    if (!selectedSchoolFeature || selectedLayer !== "schools") return;
    // Study rule: each crash belongs to its single nearest school within 2 miles.
    const schoolId = String(selectedSchoolFeature.properties.ncesid_t).split(".")[0];
    const nearbyCrashes = mapLayers.hotspots.features.filter((feature) => feature.properties.school_id === schoolId);
    crashCount = nearbyCrashes.length;
    schoolCrashOverlay = L.layerGroup(nearbyCrashes.map((feature) => {
      const [crashLongitude, crashLatitude] = feature.geometry.coordinates;
      // Same orange-red scale as the rest of the atlas (by child deaths in the
      // crash), with a thick black outline so study crashes stand out from
      // schools, roads and the basemap.
      const deaths = numberOrZero(feature.properties.child_deaths);
      const fill = deaths >= 2 ? fillPalette[4] : deaths === 1 ? fillPalette[3] : fillPalette[1];
      return L.circleMarker([crashLatitude, crashLongitude], {
        pane: "contextPane",
        radius: 7,
        color: "#000000",
        weight: 2.5,
        fillColor: fill,
        fillOpacity: 0.95,
      }).bindPopup(() => popupContent(`Crash ${feature.properties.crash_id}`, [
        ["Year", feature.properties.year],
        ["Child fatalities", feature.properties.child_deaths],
        ["Child pedestrian / cyclist deaths", feature.properties.ped_cyclist_deaths],
      ]));
    })).addTo(map);
  }

  if (schoolRoadsToggle.checked) {
    await loadRoadData();
    if (!selectedSchoolFeature || selectedLayer !== "schools") return;
    const nearbyRoads = mapLayers.roads.features.filter((feature) => (
      numberOrZero(feature.properties.child_crashes) > 0 && roadTouchesSchoolBuffer(feature, center)
    ));
    roadCount = nearbyRoads.length;
    const roadDomain = measureDomain(nearbyRoads, "child_crashes");
    schoolRoadOverlay = L.geoJSON({ type: "FeatureCollection", features: nearbyRoads }, {
      pane: "contextPane",
      style: (feature) => ({
        color: measureColor(getValue(feature, "child_crashes"), roadDomain, "child_crashes"),
        weight: 3,
        opacity: 0.92,
      }),
      onEachFeature: (feature, layer) => layer.bindPopup(() => makeRoadPopup(feature)),
    }).addTo(map);
  }
  updateSchoolContextNote(crashCount, roadCount);
}

function geometryRings(geometry) {
  if (geometry.type === "Polygon") return geometry.coordinates;
  if (geometry.type === "MultiPolygon") return geometry.coordinates.flat();
  return [];
}

function outerBoundaryFromPolygons(features) {
  const segments = new Map();
  const coordinateKey = ([longitude, latitude]) => `${longitude.toFixed(6)},${latitude.toFixed(6)}`;
  features.forEach((feature) => geometryRings(feature.geometry).forEach((ring) => {
    for (let index = 1; index < ring.length; index += 1) {
      const start = ring[index - 1];
      const end = ring[index];
      const startKey = coordinateKey(start);
      const endKey = coordinateKey(end);
      const key = startKey < endKey ? `${startKey}|${endKey}` : `${endKey}|${startKey}`;
      const segment = segments.get(key);
      if (segment) segment.count += 1;
      else segments.set(key, { count: 1, coordinates: [start, end] });
    }
  }));
  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "MultiLineString",
      coordinates: [...segments.values()]
        .filter((segment) => segment.count === 1)
        .map((segment) => segment.coordinates),
    },
  };
}

function featureIntersectsSchoolBuffer(feature, longitude, latitude) {
  if (window.d3?.geoContains(feature, [longitude, latitude])) return true;
  const cosine = Math.cos((latitude * Math.PI) / 180);
  const toMeters = ([pointLongitude, pointLatitude]) => [
    (pointLongitude - longitude) * 111320 * cosine,
    (pointLatitude - latitude) * 110540,
  ];
  const segmentDistance = ([x1, y1], [x2, y2]) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSquared = dx * dx + dy * dy;
    const share = lengthSquared ? Math.max(0, Math.min(1, -(x1 * dx + y1 * dy) / lengthSquared)) : 0;
    return Math.hypot(x1 + share * dx, y1 + share * dy);
  };
  return geometryRings(feature.geometry).some((ring) => {
    for (let index = 1; index < ring.length; index += 1) {
      if (segmentDistance(toMeters(ring[index - 1]), toMeters(ring[index])) <= schoolBufferMeters) return true;
    }
    return false;
  });
}

const featureBoundsCache = new WeakMap();
function featureBounds(feature) {
  let bounds = featureBoundsCache.get(feature);
  if (!bounds) {
    bounds = { west: Infinity, east: -Infinity, south: Infinity, north: -Infinity };
    geometryRings(feature.geometry).forEach((ring) => ring.forEach(([longitude, latitude]) => {
      if (longitude < bounds.west) bounds.west = longitude;
      if (longitude > bounds.east) bounds.east = longitude;
      if (latitude < bounds.south) bounds.south = latitude;
      if (latitude > bounds.north) bounds.north = latitude;
    }));
    featureBoundsCache.set(feature, bounds);
  }
  return bounds;
}

async function updateSchoolOverlapRow(feature, row) {
  const [longitude, latitude] = feature.geometry.coordinates;
  const latRadius = schoolBufferMeters / 110540;
  const lonRadius = schoolBufferMeters / (111320 * Math.cos((latitude * Math.PI) / 180));
  const bufferBounds = L.latLngBounds(
    [latitude - latRadius, longitude - lonRadius],
    [latitude + latRadius, longitude + lonRadius],
  );
  const countyCount = mapLayers.counties.features.filter((county) => {
    const bounds = featureBounds(county);
    const overlaps = !(
      bounds.east < bufferBounds.getWest() || bounds.west > bufferBounds.getEast()
      || bounds.north < bufferBounds.getSouth() || bounds.south > bufferBounds.getNorth()
    );
    return overlaps && featureIntersectsSchoolBuffer(county, longitude, latitude);
  }).length;
  const stateFipsValues = Object.entries(stateIndex)
    .filter(([, bounds]) => !(
      bounds.east < bufferBounds.getWest() || bounds.west > bufferBounds.getEast()
      || bounds.north < bufferBounds.getSouth() || bounds.south > bufferBounds.getNorth()
    ))
    .map(([stateFips]) => stateFips);
  const stateLayers = await Promise.all(stateFipsValues.map(ensureTractState));
  if (selectedSchoolFeature !== feature) return;
  let tractCount = 0;
  stateLayers.forEach((stateLayer) => stateLayer.eachLayer((tractLayer) => {
    if (
      tractLayer.getBounds().intersects(bufferBounds)
      && featureIntersectsSchoolBuffer(tractLayer.feature, longitude, latitude)
    ) tractCount += 1;
  }));
  row.textContent = `Buffer overlap: ${countyCount} ${countyCount === 1 ? "county" : "counties"}, ${tractCount} census tracts. Address ZIP ${feature.properties.zip_code || "not available"}.`;
}

function showSchool(feature) {
  if (selectedSchoolBuffer) map.removeLayer(selectedSchoolBuffer);
  clearSchoolContextOverlays();
  selectedSchoolFeature = feature;
  schoolCrashesToggle.disabled = false;
  schoolRoadsToggle.disabled = false;
  const [longitude, latitude] = feature.geometry.coordinates;
  const bufferCircle = L.circle([latitude, longitude], {
    radius: schoolBufferMeters,
    color: "#d85e49",
    weight: 2,
    opacity: 0.95,
    fillColor: "#efb64e",
    fillOpacity: 0.14,
    interactive: false,
  });
  // A marker on the school itself shows exactly where the buffer is centred.
  const centerMarker = L.circleMarker([latitude, longitude], {
    radius: 7,
    color: "#ffffff",
    weight: 2.5,
    fillColor: "#174e43",
    fillOpacity: 1,
    interactive: false,
  });
  selectedSchoolBuffer = L.featureGroup([bufferCircle, centerMarker]).addTo(map);
  const properties = feature.properties;
  const selectedMeasure = measureSelect.value;
  const selectedValue = getValue(feature, selectedMeasure);
  const comparisonValues = filteredSchoolFeatures()
    .map((school) => getValue(school, selectedMeasure))
    .filter((value) => value !== null)
    .sort((a, b) => a - b);
  const comparisonMedian = comparisonValues.length
    ? comparisonValues[Math.floor((comparisonValues.length - 1) / 2)]
    : null;
  const percentile = selectedValue === null || !comparisonValues.length
    ? null
    : Math.round((comparisonValues.filter((value) => value <= selectedValue).length / comparisonValues.length) * 100);
  const popup = popupContent(properties.school_name, [
    ["NCES ID", properties.ncesid_t],
    ["Study buffer", `${schoolBufferMiles} miles`],
    ["Study child-involved fatal crashes (nearest school)", properties.study_crashes],
    ["Study child fatalities", properties.study_child_deaths],
    ["Study child pedestrian / cyclist deaths", properties.study_ped_deaths],
    ["County FIPS", properties.county_fips],
    ["Address ZIP", properties.zip_code || "Not available"],
    [measureSettings[selectedMeasure].label, formatValue(selectedValue, selectedMeasure)],
    ["Filtered-area median", formatValue(comparisonMedian, selectedMeasure)],
    ["Filtered-area percentile", percentile === null ? "No data" : `${percentile}th`],
    ["Sidewalk image share", formatValue(properties.prop_sidewalk, "prop_sidewalk")],
    ["Single-lane image share", formatValue(properties.prop_single_lane, "prop_single_lane")],
    ["Stop-sign presence", formatValue(properties.avg_stopsign, "avg_stopsign")],
    ["Street greenness", formatValue(properties.prop_green, "prop_green")],
    ["Streetlight image share", formatValue(properties.prop_streetlight, "prop_streetlight")],
  ]);
  const overlapRow = document.createElement("p");
  overlapRow.textContent = "Buffer overlap: calculating counties and census tracts…";
  popup.append(overlapRow);
  const regression = schoolRegressionResults[selectedMeasure];
  if (regression) {
    const details = document.createElement("details");
    details.className = "regression-details";
    const summary = document.createElement("summary");
    summary.textContent = "National 2-mile regression";
    details.append(summary);
    const outcomeLabels = ["Child-involved fatal crashes", "Child fatalities", "Child pedestrian / cyclist fatalities"];
    regression.forEach(([irr, lower, upper], index) => {
      const result = document.createElement("p");
      result.textContent = `${outcomeLabels[index]}: IRR ${irr.toFixed(2)} (${lower.toFixed(2)}–${upper.toFixed(2)})`;
      details.append(result);
    });
    const note = document.createElement("small");
    note.textContent = "Highest versus lowest tertile; national association, not an individual-school prediction.";
    details.append(note);
    popup.append(details);
  }
  L.popup({ offset: [0, -8] }).setLatLng([latitude, longitude]).setContent(popup).openOn(map);
  map.fitBounds(bufferCircle.getBounds(), { padding: [44, 44], maxZoom: 12 });
  refreshSchoolContextOverlays().catch(console.error);
  updateSchoolOverlapRow(feature, overlapRow).catch(() => {
    overlapRow.textContent = `Address ZIP ${properties.zip_code || "not available"}; overlap calculation unavailable.`;
  });
}

map.on("click", (event) => {
  if (!new Set(["schools", "hotspots"]).has(selectedLayer)) return;
  const candidate = nearestPointBin(map.latLngToContainerPoint(event.latlng));
  if (!candidate) return;
  const { bin } = candidate;
  if (selectedLayer === "hotspots") {
    const popup = popupContent("Crash-density cell", [
      ["Crash locations", bin.records.toLocaleString()],
      ["Child-involved fatal crashes", (bin.values.child_crashes || 0).toLocaleString()],
      ["Child fatalities", (bin.values.child_deaths || 0).toLocaleString()],
      ["Child pedestrian / cyclist deaths", (bin.values.ped_cyclist_deaths || 0).toLocaleString()],
    ]);
    L.popup().setLatLng(event.latlng).setContent(popup).openOn(map);
    return;
  }
  const clickPoint = map.latLngToContainerPoint(event.latlng);
  const showingIndividualSchools = geographySelection.state !== "all" || map.getZoom() >= 7;
  if (!showingIndividualSchools) {
    // At low zoom a dot is a cluster of many schools, so picking one would
    // centre the buffer on the wrong school. Zoom in until schools separate.
    map.setView(event.latlng, Math.max(map.getZoom() + 2, 7), { animate: false });
    return;
  }
  const nearestSchool = bin.features.reduce((nearest, feature) => {
    const [longitude, latitude] = feature.geometry.coordinates;
    const point = map.latLngToContainerPoint([latitude, longitude]);
    const distance = Math.hypot(point.x - clickPoint.x, point.y - clickPoint.y);
    return !nearest || distance < nearest.distance ? { feature, distance } : nearest;
  }, null);
  if (nearestSchool) showSchool(nearestSchool.feature);
});

function makeTractPopup(feature) {
  const properties = feature.properties;
  if (!tractDataById.has(properties.geoid)) {
    return popupContent(`Census tract ${properties.name || properties.geoid}`, [
      ["GEOID", properties.geoid],
      ["Status", "Not in the manuscript's Figure 2 data (no Street View indicators or population)"],
      ["Note", "Unavailable, as in the manuscript's Figure 2. Gray does not mean zero crashes."],
    ]);
  }
  return popupContent(`Census tract ${properties.name || properties.geoid}`, [
    ["GEOID", properties.geoid],
    ["Child-involved fatal crashes", formatValue(properties.child_crashes, "child_crashes")],
    ["Child fatalities", formatValue(properties.child_deaths, "child_deaths")],
    ["Child pedestrian / cyclist deaths", formatValue(properties.ped_cyclist_deaths, "ped_cyclist_deaths")],
    ["Crashes per 10,000 children", formatValue(properties.child_crash_rate, "child_crash_rate")],
    ["In manuscript regression sample", properties.in_sample ? "Yes" : "No (e.g. missing traffic-volume data)"],
  ]);
}

function tractStyle(feature) {
  if (!featureMatchesGeography(feature)) {
    return { color: "transparent", weight: 0, opacity: 0, fillColor: "transparent", fillOpacity: 0 };
  }
  const measureKey = measureSelect.value;
  const value = getValue(feature, measureKey);
  return {
    color: value === null ? "#aeb7b2" : "#ffffff",
    weight: value === null ? 0.65 : 0.45,
    opacity: 0.9,
    dashArray: value === null ? "3 3" : null,
    fillColor: measureColor(value, activeTractDomain, measureKey),
    fillOpacity: value === null ? 0.42 : 0.76,
  };
}

function decorateTractFeature(feature, leafletFeature) {
  const data = tractDataById.get(feature.properties.geoid);
  feature.properties = { ...feature.properties, ...(data || {}) };
  leafletFeature.bindPopup(() => makeTractPopup(feature));
  leafletFeature.on({
    mouseover: (event) => event.target.setStyle({ weight: 1.35, color: "#174e43" }),
    mouseout: (event) => event.target.setStyle(tractStyle(feature)),
  });
}

function boundsIntersectMap(bounds) {
  const visible = map.getBounds();
  return !(
    bounds.east < visible.getWest()
    || bounds.west > visible.getEast()
    || bounds.north < visible.getSouth()
    || bounds.south > visible.getNorth()
  );
}

function visibleStateIds() {
  return Object.entries(stateIndex).filter(([stateFips, bounds]) => {
    if (stateFips === "02" && map.getCenter().lng > -130) return false;
    return boundsIntersectMap(bounds);
  }).map(([stateFips]) => stateFips);
}

async function ensureTractState(stateFips) {
  if (tractStateLayers.has(stateFips)) return tractStateLayers.get(stateFips);
  if (tractStateRequests.has(stateFips)) return tractStateRequests.get(stateFips);
  const request = fetch(`data/tract-shapes/state-${stateFips}.geojson`)
    .then((response) => {
      if (!response.ok) throw new Error(`Tract geometry request failed (${response.status}).`);
      return response.json();
    })
    .then((collection) => {
      collection.features.forEach((feature) => {
        feature.properties = { ...feature.properties, ...(tractDataById.get(feature.properties.geoid) || {}) };
      });
      const layer = L.geoJSON(collection, { style: tractStyle, onEachFeature: decorateTractFeature });
      tractStateLayers.set(stateFips, layer);
      return layer;
    })
    .finally(() => tractStateRequests.delete(stateFips));
  tractStateRequests.set(stateFips, request);
  return request;
}

async function updateVisibleTracts() {
  if (selectedLayer !== "tracts" || map.getZoom() < tractZoomThreshold) {
    tractStateLayers.forEach((layer) => map.removeLayer(layer));
    syncCountyDisplay();
    return;
  }
  const visibleStates = new Set(
    geographySelection.state === "all" ? visibleStateIds() : [geographySelection.state],
  );
  tractStateLayers.forEach((layer, stateFips) => {
    if (!visibleStates.has(stateFips)) map.removeLayer(layer);
  });
  const loaded = await Promise.all([...visibleStates].map(async (stateFips) => {
    try {
      const layer = await ensureTractState(stateFips);
      if (selectedLayer === "tracts" && map.getZoom() >= tractZoomThreshold && visibleStateIds().includes(stateFips)) {
        layer.addTo(map);
      }
      return layer.getLayers().filter((tractLayer) => featureMatchesGeography(tractLayer.feature)).length;
    } catch (error) {
      console.error(error);
      return 0;
    }
  }));
  if (countyOutlineLayer) countyOutlineLayer.bringToFront();
  const tractCount = loaded.reduce((sum, value) => sum + value, 0);
  const tractScope = geographySelection.county !== "all"
    ? "in the selected county"
    : geographySelection.state !== "all" ? "in the selected state" : "visible on the map";
  document.getElementById("feature-count").textContent = `${tractCount.toLocaleString()} census tracts ${tractScope}`;
  syncCountyDisplay();
}

const roadClassNames = {
  S1100: "Primary road", S1200: "Secondary road", S1400: "Local street", S1500: "Four-wheel-drive trail",
  S1630: "Ramp", S1640: "Service drive", S1710: "Walkway", S1720: "Stairway", S1730: "Alley",
  S1740: "Private road", S1750: "Internal census road", S1780: "Parking lot road", S1820: "Bike path", S1830: "Bridle path",
};

function makeRoadPopup(feature) {
  const properties = feature.properties;
  return popupContent(properties.name || "Unnamed road", [
    ["Road class", roadClassNames[properties.road_class] || properties.road_class || "Road"],
    ["Segment length", `${Number(properties.length_miles || 0).toFixed(1)} miles`],
    ["Matched child-involved fatal crashes", formatValue(properties.child_crashes, "child_crashes")],
    ["Crashes per road mile", formatValue(properties.crashes_per_mile, "crashes_per_mile")],
    ["Child fatalities", formatValue(properties.child_deaths, "child_deaths")],
    ["Child pedestrian / cyclist deaths", formatValue(properties.ped_cyclist_deaths, "ped_cyclist_deaths")],
  ]);
}

function roadStyle(feature) {
  if (!featureMatchesGeography(feature)) {
    return { color: "#87938e", weight: 0, opacity: 0, interactive: false };
  }
  const measureKey = measureSelect.value;
  const value = getValue(feature, measureKey);
  const hasMatchedCrash = numberOrZero(feature.properties.child_crashes) > 0;
  return {
    color: hasMatchedCrash ? measureColor(value, activeRoadDomain, measureKey) : "#87938e",
    weight: hasMatchedCrash ? 3.4 : 0.6,
    opacity: hasMatchedCrash ? 0.95 : 0.12,
    lineCap: "round",
    lineJoin: "round",
  };
}

function decorateRoadFeature(feature, leafletFeature) {
  // Roads without matched crashes are faint context only; skipping their
  // popups and hover handlers makes the 17,000-segment layer far quicker to build.
  if (numberOrZero(feature.properties.child_crashes) <= 0) return;
  leafletFeature.bindPopup(() => makeRoadPopup(feature));
  leafletFeature.on({
    mouseover: (event) => event.target.setStyle({ weight: 4.5, opacity: 1 }),
    mouseout: (event) => event.target.setStyle(roadStyle(feature)),
  });
}

function syncRoadDisplay() {
  if (!roadLayer) return;
  const showRoads = selectedLayer === "roads" && !canShowNationalOverview();
  if (showRoads) {
    roadLayer.setStyle(roadStyle);
    if (!map.hasLayer(roadLayer)) roadLayer.addTo(map);
    roadLayer.bringToFront();
    if (countyOutlineLayer) countyOutlineLayer.bringToFront();
  } else if (map.hasLayer(roadLayer)) map.removeLayer(roadLayer);
}

function countyStyle(feature) {
  const measureKey = measureSelect.value;
  const supportsMeasure = layerMeasures.tracts.includes(measureKey);
  const value = supportsMeasure ? getValue(feature, measureKey) : null;
  return {
    color: "#ffffff",
    weight: 0.65,
    opacity: 0.85,
    fillColor: supportsMeasure ? measureColor(value, activeCountyDomain, measureKey) : "#edf1ee",
    fillOpacity: 0.76,
  };
}

function isAlbersUsaState(stateFips) {
  const code = Number(stateFips);
  return Number.isFinite(code) && code >= 1 && code <= 56;
}

function canShowNationalOverview() {
  const selectedDataReady = selectedLayer === "tracts"
    ? Boolean(mapLayers.tracts?.features?.length)
    : Boolean(mapLayers[selectedLayer]?.features?.length);
  return Boolean(
    map.getZoom() < tractZoomThreshold
    && geographySelection.state === "all"
    && selectedDataReady
    && mapLayers.counties?.features?.length
    && mapLayers.states?.features?.length
    && window.d3,
  );
}

function buildOverviewCountyValues(measureKey) {
  const values = new Map();
  if (selectedLayer === "tracts") {
    mapLayers.counties.features.forEach((feature) => {
      values.set(feature.properties.county_fips, getValue(feature, measureKey));
    });
    return values;
  }
  if (selectedLayer === "hotspots") {
    mapLayers.counties.features.forEach((feature) => values.set(feature.properties.county_fips, 0));
    filteredHotspotFeatures().forEach((feature) => {
      const countyFips = feature.properties.county_fips;
      if (!countyFips) return;
      values.set(countyFips, (values.get(countyFips) || 0) + (getValue(feature, measureKey) || 0));
    });
    return values;
  }
  return values;
}

function setNationalTooltip(feature, event) {
  const properties = feature.properties;
  const title = document.createElement("strong");
  title.textContent = properties.name;
  const detail = document.createElement("span");
  const measureKey = measureSelect.value;
  if (selectedLayer === "roads" || selectedLayer === "schools") {
    detail.textContent = selectedLayer === "roads"
      ? "Select this county to inspect road corridors."
      : "Select this county to inspect individual schools.";
  } else {
    const value = overviewCountyValues.get(feature.properties.county_fips);
    detail.textContent = `${measureSettings[measureKey].label}: ${formatValue(value, measureKey)}`;
  }
  nationalOverviewTooltip.replaceChildren(title, detail);
  nationalOverviewTooltip.hidden = false;
  if (!event?.clientX) return;
  const overviewBounds = nationalOverview.getBoundingClientRect();
  const tooltipWidth = 220;
  const left = Math.max(8, Math.min(overviewBounds.width - tooltipWidth - 8, event.clientX - overviewBounds.left + 13));
  const top = Math.max(8, Math.min(overviewBounds.height - 58, event.clientY - overviewBounds.top + 13));
  nationalOverviewTooltip.style.left = `${left}px`;
  nationalOverviewTooltip.style.top = `${top}px`;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function setSchoolClusterTooltip(cluster, event) {
  const title = document.createElement("strong");
  title.textContent = `${cluster.schoolCount.toLocaleString()} schools`;
  const detail = document.createElement("span");
  detail.textContent = `Median ${measureSettings[measureSelect.value].label.toLowerCase()}: ${formatValue(cluster.median, measureSelect.value)}`;
  nationalOverviewTooltip.replaceChildren(title, detail);
  nationalOverviewTooltip.hidden = false;
  if (!event?.clientX) return;
  const overviewBounds = nationalOverview.getBoundingClientRect();
  nationalOverviewTooltip.style.left = `${Math.max(8, Math.min(overviewBounds.width - 228, event.clientX - overviewBounds.left + 13))}px`;
  nationalOverviewTooltip.style.top = `${Math.max(8, Math.min(overviewBounds.height - 58, event.clientY - overviewBounds.top + 13))}px`;
}

function openCountyDetail(feature) {
  const centroid = window.d3.geoCentroid(feature);
  if (!centroid || !Number.isFinite(centroid[0]) || !Number.isFinite(centroid[1])) return;
  geographySelection.state = feature.properties.county_fips.slice(0, 2);
  geographySelection.county = feature.properties.county_fips;
  geographySelection.zip = "all";
  syncLocationControls();
  nationalOverviewTooltip.hidden = true;
  nationalOverview.hidden = true;
  map.invalidateSize({ animate: false });
  map.setView([centroid[1], centroid[0]], 7, { animate: false });
  renderLayer();
}

function renderNationalOverview() {
  if (!canShowNationalOverview()) return false;
  const width = nationalOverview.clientWidth;
  const height = nationalOverview.clientHeight;
  if (!width || !height) return false;

  const counties = mapLayers.counties.features.filter((feature) => isAlbersUsaState(feature.properties.county_fips.slice(0, 2)));
  const states = mapLayers.states.features.filter((feature) => isAlbersUsaState(feature.properties.state_fips));
  const collection = { type: "FeatureCollection", features: counties };
  const projection = window.d3.geoAlbersUsa().fitExtent([[34, 25], [width - 34, height - 28]], collection);
  const path = window.d3.geoPath(projection);
  const svg = window.d3.select(nationalOverviewSvg)
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet");
  svg.selectAll("*").remove();

  const measureKey = measureSelect.value;
  overviewCountyValues = buildOverviewCountyValues(measureKey);
  const overviewFeatures = [...overviewCountyValues.values()].map((value) => ({
    properties: { [measureKey]: value },
  }));
  const overviewDomain = measureDomain(overviewFeatures, measureKey);
  const supportsCountyMeasure = !new Set(["roads", "schools"]).has(selectedLayer);
  if (supportsCountyMeasure) {
    document.getElementById("legend-title").textContent = `${measureSettings[measureKey].legend} · county`;
    document.getElementById("legend-max").textContent = formatValue(overviewDomain.maximum, measureKey);
  }
  svg.append("g")
    .attr("class", "county-layer")
    .selectAll("path")
    .data(counties.filter((feature) => path(feature)))
    .join("path")
    .attr("class", "county-shape")
    .attr("d", path)
    .attr("fill", (feature) => supportsCountyMeasure
      ? measureColor(overviewCountyValues.get(feature.properties.county_fips), overviewDomain, measureKey)
      : "#e7ede9")
    .attr("stroke", "#ffffff")
    .attr("stroke-width", 0.45)
    .attr("tabindex", 0)
    .attr("role", "button")
    .attr("aria-label", (feature) => `${feature.properties.name}. Select to open the detailed ${layerSettings[selectedLayer].label} map.`)
    .on("mousemove", (event, feature) => setNationalTooltip(feature, event))
    .on("mouseleave", () => { nationalOverviewTooltip.hidden = true; })
    .on("focus", (event, feature) => setNationalTooltip(feature))
    .on("blur", () => { nationalOverviewTooltip.hidden = true; })
    .on("click", (event, feature) => openCountyDetail(feature))
    .on("keydown", (event, feature) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openCountyDetail(feature);
      }
    });

  if (selectedLayer === "roads") {
    svg.append("g")
      .attr("class", "road-layer")
      .selectAll("path")
      // With every road class loaded, the national map draws only primary/secondary roads and corridors with 2+ crashes to stay fast.
      .data(mapLayers.roads.features.filter((feature) => numberOrZero(feature.properties.child_crashes) > 0
        && (numberOrZero(feature.properties.child_crashes) >= 2 || ["S1100", "S1200"].includes(feature.properties.road_class))
        && path(feature)))
      .join("path")
      .attr("class", "road-corridor")
      .attr("d", path)
      .attr("fill", "none")
      .attr("stroke", (feature) => measureColor(getValue(feature, measureKey), activeRoadDomain, measureKey))
      .attr("stroke-width", 1.7)
      .attr("stroke-linecap", "round")
      .attr("stroke-linejoin", "round")
      .attr("stroke-opacity", 0.92);
  }

  if (selectedLayer === "schools") {
    const clusterSize = 28;
    const clusters = new Map();
    filteredSchoolFeatures().forEach((feature) => {
      const [longitude, latitude] = feature.geometry.coordinates;
      const projected = projection([longitude, latitude]);
      const value = getValue(feature, measureKey);
      if (!projected || value === null) return;
      const key = `${Math.floor(projected[0] / clusterSize)}:${Math.floor(projected[1] / clusterSize)}`;
      const cluster = clusters.get(key) || { x: 0, y: 0, longitude: 0, latitude: 0, records: 0, ids: new Set(), values: [] };
      cluster.x += projected[0];
      cluster.y += projected[1];
      cluster.longitude += longitude;
      cluster.latitude += latitude;
      cluster.records += 1;
      cluster.ids.add(feature.properties.ncesid_t);
      cluster.values.push(value);
      clusters.set(key, cluster);
    });
    const schoolClusters = [...clusters.values()].map((cluster) => ({
      ...cluster,
      x: cluster.x / cluster.records,
      y: cluster.y / cluster.records,
      longitude: cluster.longitude / cluster.records,
      latitude: cluster.latitude / cluster.records,
      schoolCount: cluster.ids.size,
      median: median(cluster.values),
    }));
    const clusterFeatures = schoolClusters.map((cluster) => ({ properties: { [measureKey]: cluster.median } }));
    const clusterDomain = measureDomain(clusterFeatures, measureKey);
    document.getElementById("legend-title").textContent = `Median ${measureSettings[measureKey].legend.toLowerCase()} · school clusters`;
    document.getElementById("legend-max").textContent = formatValue(clusterDomain.maximum, measureKey);
    svg.append("g")
      .attr("class", "school-cluster-layer")
      .selectAll("circle")
      .data(schoolClusters)
      .join("circle")
      .attr("class", "school-cluster")
      .attr("cx", (cluster) => cluster.x)
      .attr("cy", (cluster) => cluster.y)
      .attr("r", (cluster) => 3.5 + Math.min(11, Math.sqrt(cluster.schoolCount) * 0.75))
      .attr("fill", (cluster) => measureColor(cluster.median, clusterDomain, measureKey))
      .attr("fill-opacity", 0.88)
      .attr("tabindex", 0)
      .attr("role", "button")
      .attr("aria-label", (cluster) => `${cluster.schoolCount} schools. Select to inspect this area.`)
      .on("mousemove", (event, cluster) => setSchoolClusterTooltip(cluster, event))
      .on("mouseleave", () => { nationalOverviewTooltip.hidden = true; })
      .on("focus", (event, cluster) => setSchoolClusterTooltip(cluster))
      .on("blur", () => { nationalOverviewTooltip.hidden = true; })
      .on("click", (event, cluster) => {
        nationalOverview.hidden = true;
        map.setView([cluster.latitude, cluster.longitude], 8, { animate: false });
      });
  }

  svg.append("g")
    .attr("class", "state-layer")
    .selectAll("path")
    // Alaska crosses the antimeridian. Its spherical polygon outline can draw
    // the composite projection's clip rectangles, so county coastlines provide
    // its clean inset edge instead.
    .data(states.filter((feature) => feature.properties.state_fips !== "02" && path(feature)))
    .join("path")
    .attr("class", "state-outline")
    .attr("d", path)
    .attr("fill", "none")
    .attr("stroke", "#285b50")
    .attr("stroke-width", 1.35)
    .attr("stroke-opacity", 0.98)
    .attr("stroke-linejoin", "round");

  // Alaska's state polygon crosses the antimeridian, which produces broken
  // inset lines in d3.geoAlbersUsa. Dissolve shared county edges into a clean
  // outer boundary and draw that in the same state-boundary color.
  const alaskaBoundary = outerBoundaryFromPolygons(
    counties.filter((feature) => feature.properties.county_fips.startsWith("02")),
  );
  svg.append("g")
    .attr("class", "state-layer alaska-state-outline")
    .selectAll("path")
    .data([alaskaBoundary])
    .join("path")
    .attr("class", "state-outline")
    .attr("d", path)
    .attr("fill", "none")
    .attr("stroke", "#285b50")
    .attr("stroke-width", 1.35)
    .attr("stroke-opacity", 0.98)
    .attr("stroke-linejoin", "round");
  const promptText = {
    tracts: "Select a county to explore census tracts",
    hotspots: "Select a county to explore crash density",
    roads: "Select a county to inspect road corridors",
    schools: "Select a county to explore schools and buffers",
  };
  nationalOverviewPrompt.textContent = promptText[selectedLayer];
  return true;
}

function syncCountyDisplay() {
  if (!countyFillLayer || !countyOutlineLayer) return;
  const showAlbersOverview = canShowNationalOverview();
  nationalOverview.hidden = !showAlbersOverview;
  pointCanvas.style.display = showAlbersOverview ? "none" : "block";
  if (showAlbersOverview) {
    renderNationalOverview();
    document.getElementById("map-title").textContent = selectedLayer === "tracts"
      ? "Child-involved fatal crashes by county · select a county"
      : layerSettings[selectedLayer].title;
    let overviewCountText;
    if (selectedLayer === "tracts") {
      overviewCountText = `${mapLayers.counties.features.length.toLocaleString()} counties and county equivalents · select one to explore`;
    } else if (selectedLayer === "hotspots") {
      overviewCountText = `${filteredHotspotFeatures().length.toLocaleString()} crash locations · aggregated by county`;
    } else if (selectedLayer === "roads") {
      const highCrashRoads = filteredRoadFeatures().filter((feature) => numberOrZero(feature.properties.child_crashes) > 0);
      overviewCountText = `${highCrashRoads.length.toLocaleString()} high-crash road corridors`;
    } else {
      const schools = filteredSchoolFeatures();
      const uniqueSchools = new Set(schools.map((feature) => feature.properties.ncesid_t)).size;
      overviewCountText = `${uniqueSchools.toLocaleString()} schools · clustered by location`;
    }
    document.getElementById("feature-count").textContent = overviewCountText;
  }
  if (showAlbersOverview) {
    mapSourceCaption.textContent = selectedLayer === "roads"
      ? "Projection: Albers USA · Roads and boundaries: U.S. Census Bureau"
      : "Projection: Albers USA · Boundaries: U.S. Census Bureau";
  } else {
    mapSourceCaption.textContent = selectedLayer === "roads"
      ? "Roads: Census TIGER/Line · Basemap © Esri"
      : "Basemap © Esri and data providers";
  }
  document.getElementById("map-scope-label").textContent = showAlbersOverview ? "Projected national view" : "Interactive map";

  const showCountyFill = selectedLayer === "tracts" && map.getZoom() < tractZoomThreshold && !showAlbersOverview;
  if (showCountyFill) {
    countyFillLayer.setStyle(countyStyle);
    if (!map.hasLayer(countyFillLayer)) countyFillLayer.addTo(map);
    document.getElementById("map-title").textContent = "Child-involved fatal crashes by county · zoom in for tracts";
    document.getElementById("feature-count").textContent = "County overview · zoom in for census tracts";
  } else {
    if (map.hasLayer(countyFillLayer)) map.removeLayer(countyFillLayer);
    if (selectedLayer === "tracts") document.getElementById("map-title").textContent = showAlbersOverview
      ? "Child-involved fatal crashes by county · select a county"
      : layerSettings.tracts.title;
  }
  if (!map.hasLayer(countyOutlineLayer)) countyOutlineLayer.addTo(map);
  countyOutlineLayer.bringToFront();
  syncRoadDisplay();
}

function syncMeasureOptions() {
  const available = layerMeasures[selectedLayer];
  const previous = measureSelect.value;
  measureSelect.replaceChildren(...available.map((key) => {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = measureSettings[key].label;
    return option;
  }));
  measureSelect.value = available.includes(previous) ? previous : available[0];
}

function setSummary(labels, values, units) {
  const labelElements = ["summary-label-one", "summary-label-two", "summary-label-three"];
  const valueElements = ["crash-total", "death-total", "active-travel-total"];
  const unitElements = ["summary-unit-one", "summary-unit-two", "summary-unit-three"];
  labelElements.forEach((id, index) => { document.getElementById(id).textContent = labels[index]; });
  valueElements.forEach((id, index) => { document.getElementById(id).textContent = values[index]; });
  unitElements.forEach((id, index) => { document.getElementById(id).textContent = units[index]; });
}

function updateSummary(features) {
  if (selectedLayer === "schools") {
    const means = ["prop_sidewalk", "prop_single_lane"].map((key) => {
      const values = features.map((feature) => getValue(feature, key)).filter((value) => value !== null);
      return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
    });
    setSummary(
      ["Schools", "Mean sidewalk share", "Mean single-lane share"],
      [new Set(features.map((feature) => feature.properties.ncesid_t)).size.toLocaleString(), formatValue(means[0], "prop_sidewalk"), formatValue(means[1], "prop_single_lane")],
      ["with coordinates", "of sampled images", "of sampled images"],
    );
    return;
  }
  const totals = Object.fromEntries(outcomeKeys.map((key) => [key, 0]));
  features.forEach((feature) => outcomeKeys.forEach((key) => { totals[key] += getValue(feature, key) || 0; }));
  const units = selectedLayer === "roads"
    ? ["matched to roads", "matched to roads", "matched to roads"]
    : ["mapped records", "mapped records", "child deaths"];
  setSummary(
    ["Child-involved crashes", "Child fatalities", "Child pedestrian / cyclist"],
    [totals.child_crashes.toLocaleString(), totals.child_deaths.toLocaleString(), totals.ped_cyclist_deaths.toLocaleString()],
    units,
  );
}

function showEmpty(title, description, loading = false) {
  mapStage.classList.toggle("is-loading", loading);
  mapStage.setAttribute("aria-busy", String(loading));
  emptyState.hidden = false;
  emptyState.classList.remove("is-hidden");
  document.getElementById("empty-title").textContent = title;
  document.getElementById("empty-description").textContent = description;
}

function hideEmpty() {
  mapStage.classList.remove("is-loading");
  mapStage.setAttribute("aria-busy", "false");
  emptyState.classList.add("is-hidden");
  emptyState.hidden = true;
}

function layerUiText() {
  const info = layerSettings[selectedLayer];
  document.getElementById("map-title").textContent = info.title;
  document.getElementById("layer-description").textContent = info.description;
  const measureNotes = {
    hotspots: "Crash outcomes across 2017–2023",
    tracts: "Counts and rates across 2017–2023",
    roads: "Crashes matched to roads · 2017–2023",
    schools: "Built-environment indicators from sampled images",
  };
  document.getElementById("measure-note").textContent = measureNotes[selectedLayer];
}

function hideTractLayers() {
  tractStateLayers.forEach((layer) => map.removeLayer(layer));
}

function renderLayer() {
  syncMeasureOptions();
  layerUiText();
  hotspotFilters.hidden = selectedLayer !== "hotspots";
  schoolFilters.hidden = selectedLayer !== "schools";
  zipFilterGroup.hidden = selectedLayer !== "schools";
  document.getElementById("legend-missing").hidden = selectedLayer !== "tracts";
  if (selectedLayer !== "schools" && selectedSchoolBuffer) {
    map.removeLayer(selectedSchoolBuffer);
    selectedSchoolBuffer = null;
    selectedSchoolFeature = null;
    clearSchoolContextOverlays();
    schoolCrashesToggle.checked = false;
    schoolRoadsToggle.checked = false;
    schoolCrashesToggle.disabled = true;
    schoolRoadsToggle.disabled = true;
  }
  if (selectedLayer !== "roads" && roadLayer && map.hasLayer(roadLayer)) map.removeLayer(roadLayer);

  const measureKey = measureSelect.value;
  pointMeasureKey = measureKey;
  document.getElementById("legend-title").textContent = measureSettings[measureKey].legend;

  if (selectedLayer === "tracts") {
    pointFeatures = [];
    drawPointCells();
    const features = filteredTractFeatures();
    if (!features.length) {
      showEmpty("Loading study geography", "Preparing county and census tract layers.", true);
      return;
    }
    hideEmpty();
    updateSummary(features);
    activeTractDomain = updateLegend(features, measureKey);
    const countyFeatures = (mapLayers.counties?.features || []).filter(featureMatchesGeography);
    activeCountyDomain = measureDomain(countyFeatures, measureKey);
    tractStateLayers.forEach((layer) => layer.setStyle(tractStyle));
    updateVisibleTracts();
    return;
  }

  hideTractLayers();
  syncCountyDisplay();
  const collection = mapLayers[selectedLayer];
  if (!collection) {
    pointFeatures = [];
    drawPointCells();
    showEmpty(`Loading ${selectedLayer}`, "Preparing the selected study layer.", true);
    return;
  }

  if (selectedLayer === "roads") {
    const features = filteredRoadFeatures();
    pointFeatures = [];
    drawPointCells();
    hideEmpty();
    activeRoadDomain = updateLegend(features, measureKey);
    if (roadLayer) roadLayer.setStyle(roadStyle);
    updateSummary(features);
    syncCountyDisplay();
    if (!canShowNationalOverview()) {
      const nonzero = features.filter((feature) => numberOrZero(feature.properties.child_crashes) > 0).length;
      document.getElementById("feature-count").textContent = `${nonzero.toLocaleString()} segments with matched crashes`;
    }
    return;
  }

  pointFeatures = selectedLayer === "hotspots" ? filteredHotspotFeatures() : filteredSchoolFeatures();
  hideEmpty();
  drawPointCells();
  updateSummary(pointFeatures);
  syncCountyDisplay();
  if (!canShowNationalOverview()) {
    const detailLabel = selectedLayer === "schools" ? "individual schools" : layerSettings[selectedLayer].label;
    document.getElementById("feature-count").textContent = `${pointFeatures.length.toLocaleString()} ${detailLabel} in the selected area`;
  }
}

async function loadTractData() {
  const response = await fetch("data/tracts.csv");
  if (!response.ok) throw new Error(`Tract data request failed (${response.status}).`);
  const features = makeTractRecords(parseCsv(await response.text()));
  mapLayers.tracts = { type: "FeatureCollection", features };
}

async function loadCountyData() {
  const response = await fetch("data/counties.geojson");
  if (!response.ok) throw new Error(`County geometry request failed (${response.status}).`);
  const collection = await response.json();
  mapLayers.counties = collection;
  activeCountyDomain = measureDomain(collection.features, measureSelect.value);
  countyFillLayer = L.geoJSON(collection, {
    style: countyStyle,
    onEachFeature: (feature, layer) => layer.bindPopup(() => popupContent(feature.properties.name, [
      ["County FIPS", feature.properties.county_fips],
      ["Child-involved fatal crashes", formatValue(feature.properties.child_crashes, "child_crashes")],
      ["Child fatalities", formatValue(feature.properties.child_deaths, "child_deaths")],
      ["Child pedestrian / cyclist deaths", formatValue(feature.properties.ped_cyclist_deaths, "ped_cyclist_deaths")],
    ])),
  });
  countyOutlineLayer = L.geoJSON(collection, {
    interactive: false,
    style: { color: "#47675f", weight: 0.7, opacity: 0.72, fillOpacity: 0 },
  }).addTo(map);
}

// County values for the tract tab come from the manuscript's tract sample, so the
// national county view matches the tract layer and the summary totals. Rates are
// county deaths per 10,000 children in the sampled tracts; tertiles are the mean
// tract tertile. Counties with no sampled tracts stay gray ("No analysis data").
function applyTractSampleToCounties() {
  const totals = new Map();
  tractDataById.forEach((tract, geoid) => {
    const fips = geoid.slice(0, 5);
    const entry = totals.get(fips) || { children: 0, crashes: 0, deaths: 0, ped: 0, tracts: 0, tertiles: {} };
    entry.children += tract.children;
    entry.crashes += tract.child_crashes;
    entry.deaths += tract.child_deaths;
    entry.ped += tract.ped_cyclist_deaths;
    entry.tracts += 1;
    ["sidewalk_tertile", "single_lane_tertile", "stopsign_tertile", "greenness_tertile", "streetlight_tertile"].forEach((key) => {
      if (tract[key] === null || tract[key] === undefined) return;
      const running = entry.tertiles[key] || { sum: 0, count: 0 };
      running.sum += tract[key];
      running.count += 1;
      entry.tertiles[key] = running;
    });
    totals.set(fips, entry);
  });
  const perTenThousand = (count, children) => (children > 0 ? (count / children) * 10000 : null);
  mapLayers.counties.features.forEach((county) => {
    const entry = totals.get(county.properties.county_fips);
    const properties = county.properties;
    const keys = [
      "child_crashes", "child_deaths", "ped_cyclist_deaths", "child_crash_rate", "child_death_rate",
      "ped_cyclist_death_rate", "sidewalk_tertile", "single_lane_tertile", "stopsign_tertile",
      "greenness_tertile", "streetlight_tertile",
    ];
    if (!entry) {
      keys.forEach((key) => { properties[key] = null; });
      return;
    }
    properties.child_crashes = entry.crashes;
    properties.child_deaths = entry.deaths;
    properties.ped_cyclist_deaths = entry.ped;
    properties.child_crash_rate = perTenThousand(entry.crashes, entry.children);
    properties.child_death_rate = perTenThousand(entry.deaths, entry.children);
    properties.ped_cyclist_death_rate = perTenThousand(entry.ped, entry.children);
    Object.entries(entry.tertiles).forEach(([key, { sum, count }]) => { properties[key] = sum / count; });
  });
  activeCountyDomain = measureDomain(mapLayers.counties.features, measureSelect.value);
}

async function loadStateIndex() {
  const response = await fetch("data/state-bounds.json");
  if (!response.ok) throw new Error(`State index request failed (${response.status}).`);
  stateIndex = await response.json();
}

async function loadStateBoundaries() {
  const response = await fetch("data/states.geojson");
  if (!response.ok) throw new Error(`State geometry request failed (${response.status}).`);
  mapLayers.states = await response.json();
}

// Each dataset downloads once, even if a background prefetch and a tab click ask at the same time.
function loadOnce(loader) {
  let pending = null;
  return () => {
    pending ||= loader().catch((error) => { pending = null; throw error; });
    return pending;
  };
}

const loadSchoolData = loadOnce(async () => {
  if (mapLayers.schools) return;
  const response = await fetch("data/schools.csv");
  if (!response.ok) throw new Error(`School data request failed (${response.status}).`);
  mapLayers.schools = { type: "FeatureCollection", features: makeSchoolFeatures(parseCsv(await response.text())) };
});

const loadHotspotData = loadOnce(async () => {
  if (mapLayers.hotspots) return;
  const response = await fetch("data/crashes.csv");
  if (!response.ok) throw new Error(`Crash data request failed (${response.status}).`);
  mapLayers.hotspots = { type: "FeatureCollection", features: makeCrashFeatures(parseCsv(await response.text())) };
});

const loadRoadData = loadOnce(async () => {
  if (mapLayers.roads) return;
  const response = await fetch("data/roads.geojson");
  if (!response.ok) throw new Error(`Road corridor request failed (${response.status}).`);
  const collection = await response.json();
  mapLayers.roads = collection;
  activeRoadDomain = measureDomain(collection.features, measureSelect.value);
  roadLayer = L.geoJSON(collection, {
    renderer: L.canvas({ padding: 0.5 }),
    style: roadStyle,
    onEachFeature: decorateRoadFeature,
  });
});

// Warm the browser's download cache for the other tabs. Only the network
// transfer happens here; parsing waits until the tab is opened, so the page
// never freezes while you use the map.
function prefetchOtherLayers() {
  const urls = [
    "data/schools.csv",
    "data/crashes.csv",
    "data/roads.geojson",
  ];
  const run = () => urls.reduce(
    (chain, url) => chain.then(() => fetch(url)).then((response) => response.arrayBuffer()).catch(() => {}),
    Promise.resolve(),
  );
  setTimeout(run, 2500);
}

function populateStateOptions() {
  const stateFipsValues = [...new Set((mapLayers.states?.features || [])
    .map((feature) => String(feature.properties.state_fips).padStart(2, "0"))
    .filter((stateFips) => stateNames[stateFips]))]
    .sort((left, right) => stateNames[left].localeCompare(stateNames[right]));
  stateFilter.replaceChildren(new Option("All states", "all"), ...stateFipsValues.map((stateFips) => (
    new Option(stateNames[stateFips], stateFips)
  )));
  stateFilter.value = geographySelection.state;
}

function populateCountyOptions() {
  if (geographySelection.state === "all") {
    countyFilter.replaceChildren(new Option("Select a state first", "all"));
    countyFilter.disabled = true;
    geographySelection.county = "all";
    return;
  }
  const counties = (mapLayers.counties?.features || [])
    .filter((feature) => feature.properties.county_fips.slice(0, 2) === geographySelection.state)
    .sort((left, right) => left.properties.name.localeCompare(right.properties.name));
  countyFilter.replaceChildren(new Option("All counties", "all"), ...counties.map((feature) => (
    new Option(feature.properties.name, feature.properties.county_fips)
  )));
  countyFilter.disabled = false;
  countyFilter.value = counties.some((feature) => feature.properties.county_fips === geographySelection.county)
    ? geographySelection.county
    : "all";
  geographySelection.county = countyFilter.value;
}

function populateZipOptions() {
  if (selectedLayer !== "schools" || geographySelection.county === "all" || !mapLayers.schools) {
    zipFilter.replaceChildren(new Option("Select a county first", "all"));
    zipFilter.disabled = true;
    if (geographySelection.county === "all") geographySelection.zip = "all";
    return;
  }
  const zipCodes = [...new Set(mapLayers.schools.features
    .filter((feature) => featureCountyFips(feature) === geographySelection.county)
    .map((feature) => String(feature.properties.zip_code || "").trim())
    .filter((zipCode) => /^\d{5}$/.test(zipCode)))]
    .sort();
  zipFilter.replaceChildren(new Option("All school ZIPs", "all"), ...zipCodes.map((zipCode) => new Option(zipCode, zipCode)));
  zipFilter.disabled = false;
  zipFilter.value = zipCodes.includes(geographySelection.zip) ? geographySelection.zip : "all";
  geographySelection.zip = zipFilter.value;
}

function syncLocationControls() {
  stateFilter.value = geographySelection.state;
  populateCountyOptions();
  populateZipOptions();
  clearLocationButton.disabled = geographySelection.state === "all";
}

function zoomToSelectedLocation() {
  if (geographySelection.zip !== "all" && selectedLayer === "schools") {
    const schools = filteredSchoolFeatures();
    if (schools.length) {
      const bounds = L.latLngBounds(schools.map((feature) => [feature.geometry.coordinates[1], feature.geometry.coordinates[0]]));
      map.fitBounds(bounds, { padding: [35, 35], maxZoom: 11, animate: false });
      return;
    }
  }
  if (geographySelection.county !== "all") {
    const county = mapLayers.counties?.features.find((feature) => feature.properties.county_fips === geographySelection.county);
    if (county) {
      map.fitBounds(L.geoJSON(county).getBounds(), { padding: [25, 25], maxZoom: 9, animate: false });
      return;
    }
  }
  if (geographySelection.state !== "all") {
    const bounds = stateIndex[geographySelection.state];
    if (bounds) {
      map.fitBounds([[bounds.south, bounds.west], [bounds.north, bounds.east]], { padding: [25, 25], maxZoom: 6, animate: false });
      if (map.getZoom() < tractZoomThreshold) map.setZoom(tractZoomThreshold, { animate: false });
    }
  }
}

function clearLocationFilters() {
  geographySelection.state = "all";
  geographySelection.county = "all";
  geographySelection.zip = "all";
  syncLocationControls();
  map.closePopup();
  map.setView(nationalView.center, nationalView.zoom, { animate: false });
  renderLayer();
}

// Filters are independent per tab, and a tab starts fresh every time you open
// it: leaving a tab clears its State / County / ZIP choices and map view.
layerButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    if (button.dataset.layer === selectedLayer) return;
    Object.assign(geographySelections[selectedLayer], { state: "all", county: "all", zip: "all" });
    map.closePopup();
    selectedLayer = button.dataset.layer;
    geographySelection = geographySelections[selectedLayer];
    layerButtons.forEach((tab) => {
      const active = tab === button;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-pressed", String(active));
    });
    syncLocationControls();
    measureSelect.value = ""; // not in the option list, so the tab's default indicator is used
    map.setView(nationalView.center, nationalView.zoom, { animate: false });
    renderLayer();
    try {
      if (selectedLayer === "schools") await loadSchoolData();
      if (selectedLayer === "hotspots") await loadHotspotData();
      if (selectedLayer === "roads") await loadRoadData();
      syncLocationControls();
      renderLayer();
    } catch (error) {
      showEmpty("Layer unavailable", error.message);
    }
  });
});

measureSelect.addEventListener("change", renderLayer);
yearSelect.addEventListener("change", renderLayer);
ageSelect.addEventListener("change", renderLayer);
stateFilter.addEventListener("change", () => {
  geographySelection.state = stateFilter.value;
  geographySelection.county = "all";
  geographySelection.zip = "all";
  syncLocationControls();
  zoomToSelectedLocation();
  renderLayer();
});
countyFilter.addEventListener("change", () => {
  geographySelection.county = countyFilter.value;
  geographySelection.zip = "all";
  populateZipOptions();
  zoomToSelectedLocation();
  renderLayer();
});
zipFilter.addEventListener("change", () => {
  geographySelection.zip = zipFilter.value;
  zoomToSelectedLocation();
  renderLayer();
});
clearLocationButton.addEventListener("click", clearLocationFilters);
schoolCrashesToggle.addEventListener("change", () => refreshSchoolContextOverlays().catch(console.error));
schoolRoadsToggle.addEventListener("change", () => refreshSchoolContextOverlays().catch(console.error));
document.getElementById("reset-map").addEventListener("click", () => {
  clearLocationFilters();
});

map.on("movestart zoomstart", () => { pointCanvas.style.visibility = "hidden"; });
map.on("moveend zoomend resize", () => {
  pointCanvas.style.visibility = "visible";
  if (selectedLayer === "tracts") updateVisibleTracts();
  else if (selectedLayer !== "roads") drawPointCells();
  syncCountyDisplay();
});

async function initialize() {
  try {
    await Promise.all([loadTractData(), loadCountyData(), loadStateIndex(), loadStateBoundaries()]);
    applyTractSampleToCounties();
    if (selectedLayer === "schools") await loadSchoolData();
    if (selectedLayer === "hotspots") await loadHotspotData();
    if (selectedLayer === "roads") await loadRoadData();
    populateStateOptions();
    syncLocationControls();
    if (geographySelection.state !== "all") zoomToSelectedLocation();
    renderLayer();
    prefetchOtherLayers();
    if (selectedLayer === "schools" && requestedSchoolId) {
      const requestedSchool = mapLayers.schools.features.find((feature) => String(feature.properties.ncesid_t) === requestedSchoolId);
      if (requestedSchool) showSchool(requestedSchool);
    }
  } catch (error) {
    showEmpty("Study data unavailable", error.message);
  }
}

// Query parameters make filtered map views easy to review and share.
const initialParameters = new URLSearchParams(window.location.search);
const requestedLayer = initialParameters.get("layer");
if (requestedLayer && layerSettings[requestedLayer]) selectedLayer = requestedLayer;
geographySelection = geographySelections[selectedLayer];
const requestedState = initialParameters.get("state");
const requestedCounty = initialParameters.get("county");
const requestedZip = initialParameters.get("zip");
const requestedSchoolId = initialParameters.get("school");
if (requestedState && stateNames[requestedState]) geographySelection.state = requestedState;
if (requestedCounty && /^\d{5}$/.test(requestedCounty) && requestedCounty.startsWith(geographySelection.state)) {
  geographySelection.county = requestedCounty;
}
if (requestedZip && /^\d{5}$/.test(requestedZip)) geographySelection.zip = requestedZip;
if ([...yearSelect.options].some((option) => option.value === initialParameters.get("year"))) {
  yearSelect.value = initialParameters.get("year");
}
if ([...ageSelect.options].some((option) => option.value === initialParameters.get("age"))) {
  ageSelect.value = initialParameters.get("age");
}
const requestedLatitude = Number(initialParameters.get("lat"));
const requestedLongitude = Number(initialParameters.get("lng"));
const requestedZoom = Number(initialParameters.get("zoom"));
if (
  initialParameters.has("lat") && initialParameters.has("lng") && initialParameters.has("zoom")
  && Number.isFinite(requestedLatitude) && Number.isFinite(requestedLongitude) && Number.isFinite(requestedZoom)
) {
  map.setView([requestedLatitude, requestedLongitude], requestedZoom, { animate: false });
}
layerButtons.forEach((button) => {
  const active = button.dataset.layer === selectedLayer;
  button.classList.toggle("is-active", active);
  button.setAttribute("aria-pressed", String(active));
});

renderLayer();
initialize();
