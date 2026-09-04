"use strict";

const PROCESSING_JOB_STORAGE_KEY = "natObserve.processingJobId";
const RESULT_OVERLAYS_STORAGE_KEY = "natObserve.resultOverlays";
const THEME_STORAGE_KEY = "natObserve.theme";
const API_BASE_URL = (
  document.querySelector('meta[name="ice-api-base"]')?.content || ""
).replace(/\/$/, "");
const IS_STATIC_DEMO =
  !API_BASE_URL && window.location.hostname.endsWith(".github.io");
const VALID_ANALYSIS_MODES = new Set(["ice", "desertification"]);

const state = {
  map: null,
  baseLayer: null,
  drawnItems: null,
  sceneLayers: [],
  opticalLayer: null,
  selectedSceneIndex: -1,
  scenes: [],
  credentialsConfigured: false,
  snapAvailable: false,
  objectStorageConfigured: false,
  selectedProcessingScene: null,
  selectedProcessingFilename: "",
  completedProcessingJobId: "",
  completedProcessingSourceFilename: "",
  completedProcessingMode: "",
  selectedProcessingStorageKey: "",
  resultLayers: [],
  resultOverlayRecords: [],
  pendingResultOverlays: new Set(),
  toastTimer: null,
  searchGeneration: 0,
  analysisMode: "",
  desertificationModelAvailable: false,
  selectedLandScenes: [],
  landCatalogueScenes: [],
  activeLandTile: "",
  landTileSearchGeneration: 0,
  landTileSearchController: null,
  safeCache: null,
  safeCacheMode: "",
  timelineScenes: [],
  timelineRequestGeneration: 0,
};

const elements = {};

document.addEventListener("DOMContentLoaded", initialise);

async function initialise() {
  cacheElements();
  if (!initialiseMode()) return;
  initialiseTheme();
  initialiseDates();
  initialiseMap();
  bindEvents();
  updateSourceControls();
  initialiseLandDemoDashboard();

  await Promise.all([loadDefaultRegion(), loadServerConfig()]);
  await loadCachedSceneTimeline();
  restoreResultOverlays();
  await restoreLandProcessingResult();
  resumeProcessingJob();
}

function cacheElements() {
  const ids = [
    "modeGate",
    "appHeader",
    "workspace",
    "appFooter",
    "modeSwitch",
    "productSubtitle",
    "footerContext",
    "mapTitle",
    "mapClassLegend",
    "regionLegendLabel",
    "scenesLegendLabel",
    "selectedLegendLabel",
    "serverDot",
    "serverStatus",
    "credentialStatus",
    "snapStatus",
    "storageStatus",
    "themeColor",
    "themeToggle",
    "themeToggleIcon",
    "themeToggleText",
    "searchForm",
    "collection",
    "sourceHint",
    "dateFrom",
    "dateTo",
    "cloudCover",
    "cloudField",
    "resultLimit",
    "searchButton",
    "storageButton",
    "backToTilesButton",
    "mapOpacityControl",
    "resultsSourceLabel",
    "summaryGrid",
    "sceneCount",
    "sceneCountNote",
    "latestScene",
    "activeSource",
    "activeSourceNote",
    "resultsPanel",
    "requestState",
    "emptyState",
    "emptyStateTitle",
    "emptyStateText",
    "tableWrap",
    "sceneRows",
    "processingPanel",
    "processingForm",
    "processingState",
    "selectedProduct",
    "selectedProductNote",
    "processingPolarization",
    "processingPixelSize",
    "processingThreshold",
    "processingUncertainty",
    "processButton",
    "deleteSourceButton",
    "processingEmpty",
    "processingMetrics",
    "iceArea",
    "waterArea",
    "uncertainArea",
    "iceConcentration",
    "regionCoverage",
    "summaryConcentration",
    "summaryConcentrationNote",
    "summaryMetricLabel",
    "overlayOpacity",
    "resultWarning",
    "downloadAreaMask",
    "downloadMapMask",
    "downloadReport",
    "downloadMetadata",
    "downloadSnapLog",
    "clearMapResultsButton",
    "sceneTimeline",
    "sceneTimelineCurrent",
    "sceneTimelinePosition",
    "sceneTimelineRange",
    "sceneTimelineStart",
    "sceneTimelineEnd",
    "landProcessingPanel",
    "landProcessingForm",
    "landProcessingState",
    "landSelectedCount",
    "landSelectedList",
    "landBareThreshold",
    "landMinObservations",
    "processLandButton",
    "landDemoBanner",
    "landMetricPeriod",
    "landMetricZones",
    "landMetricStrong",
    "landMetricPriority",
    "landTrendCaption",
    "landTrendChart",
    "landResult",
    "landResultWarning",
    "downloadDesertificationMap",
    "downloadPastureMap",
    "downloadProblemZones",
    "downloadLandReport",
    "downloadLandTimeseries",
    "downloadLandMetadata",
    "downloadLandLog",
    "toast",
  ];

  for (const id of ids) {
    elements[id] = document.getElementById(id);
  }
}

function initialiseMode() {
  const requestedMode = new URLSearchParams(window.location.search).get("mode");
  for (const button of document.querySelectorAll("[data-mode]")) {
    button.addEventListener("click", () => {
      const mode = button.dataset.mode;
      if (!VALID_ANALYSIS_MODES.has(mode)) return;
      const url = new URL(window.location.href);
      url.searchParams.set("mode", mode);
      window.location.assign(url);
    });
  }

  if (!VALID_ANALYSIS_MODES.has(requestedMode)) {
    elements.modeGate.hidden = false;
    return false;
  }

  state.analysisMode = requestedMode;
  elements.modeGate.hidden = true;
  elements.appHeader.hidden = false;
  elements.workspace.hidden = false;
  elements.appFooter.hidden = false;
  elements.modeSwitch.addEventListener("click", () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("mode");
    window.location.assign(url);
  });

  const isLand = requestedMode === "desertification";
  elements.productSubtitle.textContent = isLand
    ? "Мониторинг опустынивания"
    : "Мониторинг морского льда";
  elements.footerContext.textContent = isLand
    ? "Sentinel-2 land degradation intelligence"
    : "Sentinel-1 Arctic navigation intelligence";
  elements.mapTitle.textContent = isLand
    ? "Карта деградации земель"
    : "Карта ледовой обстановки";
  elements.regionLegendLabel.textContent = "Область анализа";
  elements.scenesLegendLabel.textContent = "Сцены";
  elements.selectedLegendLabel.textContent = "Активная сцена";
  elements.summaryMetricLabel.textContent = isLand
    ? "Индекс риска"
    : "Концентрация льда";
  elements.summaryConcentration.textContent = "—";
  elements.summaryConcentrationNote.textContent = isLand
    ? "Запустите GeoIntellect"
    : "Обработайте Sentinel-1 GRD";
  elements.mapClassLegend.hidden = !isLand;
  // До первого поиска режим опустынивания показывает только форму и карту.
  elements.landProcessingPanel.hidden = true;
  if (isLand) {
    elements.collection.value = "sentinel-2-l2a";
    elements.collection.disabled = true;
  }
  return true;
}

function initialiseTheme() {
  applyTheme(
    document.documentElement.dataset.theme === "dark" ? "dark" : "light",
  );
  elements.themeToggle.addEventListener("click", () => {
    const nextTheme =
      document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(nextTheme, true);
  });
}

function applyTheme(theme, persist = false) {
  const isDark = theme === "dark";
  document.documentElement.dataset.theme = isDark ? "dark" : "light";

  const actionLabel = isDark
    ? "Включить светлую тему"
    : "Включить тёмную тему";
  elements.themeToggleIcon.textContent = isDark ? "☀" : "☾";
  elements.themeToggleText.textContent = isDark
    ? "Светлая тема"
    : "Тёмная тема";
  elements.themeToggle.setAttribute("aria-label", actionLabel);
  elements.themeToggle.title = actionLabel;
  elements.themeColor.setAttribute("content", isDark ? "#111216" : "#ffffff");
  updateBaseMap();
  refreshSceneOutlineStyles();

  if (persist) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, isDark ? "dark" : "light");
    } catch {
      // Интерфейс продолжает работать, даже если браузер запретил хранилище.
    }
  }
}

function initialiseDates() {
  const today = new Date();
  const todayText = formatDateInput(today);
  elements.dateFrom.value = state.analysisMode === "desertification"
    ? "2020-05-01"
    : "2026-06-27";
  elements.dateTo.value = "2026-07-27";
  elements.dateTo.max = todayText;
  elements.dateFrom.max = todayText;
}

function formatDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function initialiseMap() {
  const isLand = state.analysisMode === "desertification";
  state.map = L.map("map", {
    center: isLand ? [46.45, 45.1] : [75.2, 34],
    zoom: isLand ? 6 : 4,
    minZoom: 2,
    zoomControl: true,
  });
  state.map.attributionControl.setPrefix(
    '<a href="https://leafletjs.com/" target="_blank" ' +
      'rel="noopener noreferrer">Leaflet</a>',
  );

  updateBaseMap();

  state.drawnItems = new L.FeatureGroup();
  state.drawnItems.addTo(state.map);

  state.map.createPane("opticalPreviewPane");
  state.map.getPane("opticalPreviewPane").style.zIndex = "350";
  state.map.getPane("opticalPreviewPane").style.pointerEvents = "none";

  state.map.addControl(
    new L.Control.Draw({
      position: "topleft",
      draw: {
        polygon: {
          allowIntersection: false,
          showArea: false,
          shapeOptions: regionStyle(),
        },
        rectangle: {
          shapeOptions: regionStyle(),
        },
        polyline: false,
        circle: false,
        circlemarker: false,
        marker: false,
      },
      edit: {
        featureGroup: state.drawnItems,
        remove: true,
      },
    }),
  );

  state.map.on(L.Draw.Event.CREATED, (event) => {
    state.drawnItems.addLayer(event.layer);
    updateRegionStatus();
  });
  state.map.on(L.Draw.Event.EDITED, updateRegionStatus);
  state.map.on(L.Draw.Event.DELETED, updateRegionStatus);

  if ("ResizeObserver" in window) {
    let resizeFrame = 0;
    const mapResizeObserver = new ResizeObserver(() => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        state.map.invalidateSize({ animate: false });
      });
    });
    mapResizeObserver.observe(document.getElementById("map"));
  }
}

function updateBaseMap() {
  if (!state.map) return;

  if (state.baseLayer) {
    state.map.removeLayer(state.baseLayer);
  }
  state.baseLayer = L.tileLayer(
    "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">' +
        "OpenStreetMap contributors</a>",
      maxZoom: 19,
    },
  ).addTo(state.map);
  state.baseLayer.bringToBack();
}

function bindEvents() {
  elements.collection.addEventListener("change", updateSourceControls);
  elements.searchForm.addEventListener("submit", handleSearch);
  elements.storageButton.addEventListener("click", handleStorageCheck);
  elements.backToTilesButton.addEventListener("click", showLandTileGroups);
  elements.processingForm.addEventListener("submit", handleProcessing);
  elements.deleteSourceButton.addEventListener(
    "click",
    handleDeleteDownloadedProduct,
  );
  elements.overlayOpacity.addEventListener("input", updateOverlayOpacity);
  elements.clearMapResultsButton.addEventListener(
    "click",
    clearProcessedMap,
  );
  elements.landProcessingForm.addEventListener(
    "submit",
    handleLandProcessing,
  );
  elements.landMinObservations.addEventListener("input", updateLandSelection);
  elements.sceneTimelineRange.addEventListener("input", () => {
    void showTimelineScene(Number(elements.sceneTimelineRange.value));
  });
}

function timelineSceneKey(scene) {
  return String(scene.local_filename || scene.name || scene.stac_item_id || "");
}

function timelineSceneTimestamp(scene) {
  const timestamp = new Date(scene.datetime || sentinel2SceneDate(scene)).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function registerTimelineScene(scene) {
  if (
    state.analysisMode !== "desertification" ||
    scene.collection !== "sentinel-2-l2a" ||
    !scene.local_exists ||
    !scene.local_filename
  ) return;
  const key = timelineSceneKey(scene);
  const existing = state.timelineScenes.findIndex(
    (item) => timelineSceneKey(item) === key,
  );
  if (existing >= 0) state.timelineScenes[existing] = { ...state.timelineScenes[existing], ...scene };
  else state.timelineScenes.push({ ...scene });
  state.timelineScenes.sort((left, right) =>
    timelineSceneTimestamp(left) - timelineSceneTimestamp(right) ||
    timelineSceneKey(left).localeCompare(timelineSceneKey(right)));
  updateSceneTimeline();
}

function removeTimelineScene(filename) {
  state.timelineScenes = state.timelineScenes.filter(
    (scene) => scene.local_filename !== filename,
  );
  updateSceneTimeline();
}

async function loadCachedSceneTimeline() {
  if (IS_STATIC_DEMO || state.analysisMode !== "desertification") return;
  try {
    const result = await fetchJSON(apiUrl("/api/cache/scenes"));
    state.timelineScenes = (result.scenes || [])
      .filter((scene) => scene.collection === "sentinel-2-l2a" && scene.local_exists)
      .sort((left, right) =>
        timelineSceneTimestamp(left) - timelineSceneTimestamp(right) ||
        timelineSceneKey(left).localeCompare(timelineSceneKey(right)));
    updateSceneTimeline();
    if (state.timelineScenes.length) {
      const latestIndex = state.timelineScenes.length - 1;
      elements.sceneTimelineRange.value = String(latestIndex);
      await showTimelineScene(latestIndex);
    }
  } catch (error) {
    elements.sceneTimeline.hidden = true;
  }
}

function updateSceneTimeline() {
  const scenes = state.timelineScenes;
  elements.sceneTimeline.hidden = scenes.length === 0;
  if (!scenes.length) {
    clearOpticalScene();
    return;
  }
  const range = elements.sceneTimelineRange;
  range.min = "0";
  range.max = String(Math.max(0, scenes.length - 1));
  const current = Math.min(Number(range.value) || 0, scenes.length - 1);
  range.value = String(current);
  elements.sceneTimelineStart.textContent = formatCompactDate(scenes[0].datetime);
  elements.sceneTimelineEnd.textContent = formatCompactDate(scenes.at(-1).datetime);
  updateSceneTimelineLabel(current);
}

function updateSceneTimelineLabel(index) {
  const scene = state.timelineScenes[index];
  if (!scene) return;
  elements.sceneTimelineCurrent.textContent = [
    formatCompactDate(scene.datetime),
    sentinel2SceneTile(scene),
    formatPlatform(scene.platform),
  ].filter(Boolean).join(" · ");
  elements.sceneTimelinePosition.textContent = `${index + 1} из ${state.timelineScenes.length}`;
}

async function showTimelineScene(index) {
  const scene = state.timelineScenes[index];
  if (!scene) return;
  elements.sceneTimelineRange.value = String(index);
  updateSceneTimelineLabel(index);
  elements.sceneTimelineCurrent.textContent += " · подготовка…";
  const generation = ++state.timelineRequestGeneration;
  try {
    const preview = await fetchJSON(apiUrl("/api/cache/preview"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: scene.local_filename }),
    });
    if (generation !== state.timelineRequestGeneration) return;
    clearOpticalScene();
    state.opticalLayer = L.imageOverlay(
      apiUrl(preview.image_url),
      preview.bounds,
      { pane: "opticalPreviewPane", opacity: 0.9, interactive: false },
    ).addTo(state.map);
    const bounds = L.latLngBounds(preview.bounds);
    if (bounds.isValid()) state.map.fitBounds(bounds, { padding: [24, 24] });
    updateSceneTimelineLabel(index);
  } catch (error) {
    if (generation !== state.timelineRequestGeneration) return;
    updateSceneTimelineLabel(index);
    elements.sceneTimelineCurrent.textContent += " · предпросмотр недоступен";
    showToast(error.message, true);
  }
}

function regionStyle() {
  return {
    color: "#ff0032",
    weight: 2,
    opacity: 0.95,
    fillColor: "#ff0032",
    fillOpacity: 0.1,
  };
}

function sceneStyle() {
  return {
    color: cssThemeColor("--dark", "#1b1b1d"),
    weight: 3,
    opacity: 1,
    dashArray: null,
    fillColor: cssThemeColor("--dark", "#1b1b1d"),
    fillOpacity: 0.08,
  };
}

function sceneOverviewStyle() {
  return {
    color: cssThemeColor("--neutral-accent", "#78787d"),
    weight: 1.5,
    opacity: 0.82,
    dashArray: "6 4",
    fillColor: cssThemeColor("--neutral-accent", "#78787d"),
    fillOpacity: 0.025,
  };
}

function cssThemeColor(variableName, fallback) {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(variableName)
    .trim();
  return value || fallback;
}

async function loadServerConfig() {
  if (IS_STATIC_DEMO) {
    elements.serverStatus.textContent = "Демо · backend не подключён";
    elements.credentialStatus.textContent = "";
    elements.snapStatus.textContent = "";
    elements.storageStatus.textContent = "";
    for (const separator of document.querySelectorAll(
      ".header-status .separator",
    )) {
      separator.hidden = true;
    }
    return;
  }

  try {
    const health = await fetchJSON(apiUrl("/api/health"));
    elements.serverDot.classList.add("ok");
    elements.serverStatus.textContent = `${health.service} ${health.version}`;

    const config = await fetchJSON(apiUrl("/api/config"));
    state.credentialsConfigured = Boolean(config.credentials_configured);
    state.snapAvailable = Boolean(config.snap_available);
    state.objectStorageConfigured = Boolean(
      config.object_storage_configured,
    );
    state.desertificationModelAvailable = Boolean(
      config.desertification_model_available,
    );
    state.safeCache = config.safe_cache || null;
    state.safeCacheMode = String(config.safe_cache_mode || "");
    elements.credentialStatus.textContent = state.credentialsConfigured
      ? "CDSE: загрузка настроена"
      : "CDSE: добавьте данные в .env";
    elements.snapStatus.textContent = state.analysisMode === "desertification"
      ? state.desertificationModelAvailable
        ? "GeoIntellect: готов"
        : "GeoIntellect: модель не найдена"
      : state.snapAvailable
        ? "SNAP: готов"
        : "SNAP: задайте путь в .env";
    elements.storageStatus.textContent = state.safeCache
      ? `SAFE на сервере: ${formatBytes(state.safeCache.used_bytes)} из ${formatBytes(state.safeCache.limit_bytes)}`
      : state.analysisMode === "desertification"
        ? "Backend: требуется перезапуск"
        : "SAFE-кэш: проверка недоступна";
    elements.storageStatus.title = state.objectStorageConfigured
      ? `Архив: ${config.object_storage_bucket}`
      : "Object Storage не настроен";
    updateProcessButtonState();
    updateLandSelection();
  } catch (error) {
    elements.serverDot.classList.add("error");
    elements.serverStatus.textContent = "Сервер недоступен";
    elements.credentialStatus.textContent = "";
    elements.snapStatus.textContent = "";
    elements.storageStatus.textContent = "";
    showToast(error.message, true);
  }
}

async function loadDefaultRegion() {
  try {
    const isLand = state.analysisMode === "desertification";
    const asset = isLand
      ? "assets/kalmykia_aoi.geojson"
      : "assets/barents_sea.geojson";
    let response = IS_STATIC_DEMO
      ? await fetch(asset)
      : await fetch(apiUrl(`/api/region/default${isLand ? "?mode=desertification" : ""}`));
    if (!response.ok) {
      response = await fetch(asset);
    }
    if (!response.ok) {
      throw new Error("Не удалось загрузить регион по умолчанию.");
    }
    const geojson = await response.json();
    setRegionGeoJSON(geojson);
  } catch (error) {
    showToast(error.message, true);
  }
}

function setRegionGeoJSON(geojson) {
  const geometry = extractGeometry(geojson);
  if (!["Polygon", "MultiPolygon"].includes(geometry.type)) {
    throw new Error("GeoJSON должен содержать Polygon или MultiPolygon.");
  }

  state.drawnItems.clearLayers();
  const layer = L.geoJSON(
    {
      type: "Feature",
      properties: {},
      geometry,
    },
    { style: regionStyle },
  );

  layer.eachLayer((item) => state.drawnItems.addLayer(item));
  const bounds = state.drawnItems.getBounds();
  if (bounds.isValid()) {
    state.map.fitBounds(bounds, { padding: [24, 24] });
  }
  updateRegionStatus();
}

function extractGeometry(geojson) {
  if (geojson.type === "Feature") {
    return geojson.geometry;
  }

  if (geojson.type === "FeatureCollection") {
    const geometries = geojson.features
      .map((feature) => feature.geometry)
      .filter(
        (geometry) =>
          geometry && ["Polygon", "MultiPolygon"].includes(geometry.type),
      );
    return mergeGeometries(geometries);
  }

  return geojson;
}

function geometryFromMap() {
  const geometries = [];

  state.drawnItems.eachLayer((layer) => {
    const geojson = layer.toGeoJSON();
    if (geojson.geometry) {
      geometries.push(geojson.geometry);
    }
  });

  if (geometries.length === 0) {
    throw new Error("Нарисуйте область анализа на карте.");
  }
  return mergeGeometries(geometries);
}

function mergeGeometries(geometries) {
  if (geometries.length === 0) {
    throw new Error("GeoJSON не содержит полигонов.");
  }
  if (geometries.length === 1) {
    return geometries[0];
  }

  const coordinates = [];
  for (const geometry of geometries) {
    if (geometry.type === "Polygon") {
      coordinates.push(geometry.coordinates);
    } else if (geometry.type === "MultiPolygon") {
      coordinates.push(...geometry.coordinates);
    }
  }
  return { type: "MultiPolygon", coordinates };
}

function updateRegionStatus() {
  if (state.selectedProcessingScene) {
    clearProcessingSelection(
      "Область изменена. Выберите подходящую сцену заново.",
    );
  }
  if (state.analysisMode === "desertification" && state.selectedLandScenes.length) {
    elements.landProcessingState.textContent = "Область изменена";
    elements.landProcessingState.className = "request-state loading";
  }
}

function updateSourceControls() {
  const isSentinel2 = elements.collection.value === "sentinel-2-l2a";
  elements.cloudCover.disabled = !isSentinel2;
  elements.cloudField.style.opacity = isSentinel2 ? "1" : "0.56";
  elements.sourceHint.textContent = isSentinel2
    ? state.analysisMode === "desertification"
      ? "Sentinel-2 L2A: спектральные каналы и SCL для модели GeoIntellect."
      : "Оптическое уточнение при достаточном освещении и малой облачности."
    : "Основной источник: работает ночью и через облачность.";
  elements.activeSource.textContent = isSentinel2 ? "S-2" : "S-1";
  elements.activeSourceNote.textContent = isSentinel2
    ? "Оптика · L2A"
    : "SAR · GRD";
}

async function handleSearch(event) {
  event.preventDefault();

  if (IS_STATIC_DEMO) {
    elements.requestState.textContent = "Backend не подключён";
    elements.requestState.className = "request-state";
    showToast(
      "Это демонстрация интерфейса. Для поиска сцен подключите backend-сервер.",
    );
    return;
  }

  let geometry;
  try {
    geometry = geometryFromMap();
  } catch (error) {
    showToast(error.message, true);
    return;
  }

  const payload = {
    collection: elements.collection.value,
    date_from: elements.dateFrom.value,
    date_to: elements.dateTo.value,
    cloud_cover: Number(elements.cloudCover.value),
    limit: Number(elements.resultLimit.value),
    geometry,
  };

  setSearchLoading(true, "catalogue");
  elements.resultsSourceLabel.textContent = "Каталог Copernicus";
  setSearchResultsVisibility(false);
  clearSceneOutlines();
  if (state.analysisMode === "desertification") {
    resetLandTileSearch();
    state.landCatalogueScenes = [];
    state.selectedLandScenes = [];
    updateLandSelection();
  } else {
    clearProcessingSelection(
      "Выберите сцену из нового результата поиска.",
    );
  }

  try {
    const result = await fetchJSON(apiUrl("/api/search"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    state.scenes = (result.scenes || []).filter(
      (scene) =>
        state.analysisMode !== "desertification" ||
        scene.collection === "sentinel-2-l2a",
    );
    if (state.analysisMode === "desertification") {
      state.landCatalogueScenes = state.scenes.slice();
    }
    renderScenes();
    const tileCount = new Set(state.scenes.map(sentinel2SceneTile).filter(Boolean)).size;
    elements.requestState.textContent = state.analysisMode === "desertification"
      ? `Получено: ${tileCount} тайлов · ${state.scenes.length} сцен`
      : `Получено: ${state.scenes.length}`;
    elements.requestState.className = "request-state success";
  } catch (error) {
    state.scenes = [];
    renderScenes({ reveal: false });
    elements.requestState.textContent = "Ошибка запроса";
    elements.requestState.className = "request-state error";
    showToast(error.message, true);
  } finally {
    setSearchLoading(false);
  }
}

async function handleStorageCheck() {
  if (IS_STATIC_DEMO) {
    showToast(
      "Для просмотра локального SAFE-кэша подключите backend-сервер.",
      true,
    );
    return;
  }
  setSearchLoading(true, "storage");
  elements.resultsSourceLabel.textContent = "SAFE на сервере";
  setSearchResultsVisibility(false);
  clearSceneOutlines();
  if (state.analysisMode === "desertification") {
    resetLandTileSearch();
    state.selectedLandScenes = [];
    updateLandSelection();
  } else {
    clearProcessingSelection("Выберите SAFE из локального кэша сервера.");
  }

  try {
    const result = await fetchJSON(apiUrl("/api/cache/scenes"));
    state.scenes = (result.scenes || []).filter(
      (scene) =>
        state.analysisMode !== "desertification" ||
        scene.collection === "sentinel-2-l2a",
    );
    if (state.analysisMode === "desertification") {
      state.landCatalogueScenes = state.scenes.slice();
    }
    renderScenes();
    if (state.scenes.length === 0) {
      elements.emptyStateTitle.textContent =
        "SAFE на сервере не найдены";
      elements.emptyStateText.textContent =
        "Локальный SAFE-кэш пока пуст.";
    }
    const tileCount = new Set(state.scenes.map(sentinel2SceneTile).filter(Boolean)).size;
    elements.requestState.textContent = state.analysisMode === "desertification"
      ? `На сервере: ${tileCount} тайлов · ${state.scenes.length} сцен`
      : `На сервере: ${state.scenes.length}`;
    elements.requestState.className = "request-state success";
    elements.sceneCountNote.textContent =
      state.scenes.length === 0
        ? "SAFE в кэше не найдены"
        : `${formatBytes(result.cache?.used_bytes)} из ${formatBytes(result.cache?.limit_bytes)}`;
    elements.activeSource.textContent = "Сервер";
    elements.activeSourceNote.textContent = "Локальные SAFE";
  } catch (error) {
    state.scenes = [];
    renderScenes({ reveal: false });
    elements.requestState.textContent = "Ошибка SAFE-кэша";
    elements.requestState.className = "request-state error";
    showToast(error.message, true);
  } finally {
    setSearchLoading(false);
  }
}

function setSearchLoading(isLoading, source = "") {
  elements.searchButton.disabled = isLoading;
  elements.storageButton.disabled = isLoading;
  elements.searchButton.querySelector("span").textContent =
    isLoading && source === "catalogue"
      ? "Поиск в каталоге…"
      : "Найти снимки";
  elements.storageButton.querySelector("span").textContent =
    isLoading && source === "storage"
      ? "Чтение SAFE-кэша…"
      : "Файлы на сервере";

  if (isLoading) {
    elements.requestState.textContent =
      source === "storage"
        ? "Проверка файлов на сервере"
        : "Запрос выполняется";
    elements.requestState.className = "request-state loading";
  }
}

function setSearchResultsVisibility(visible) {
  elements.summaryGrid.hidden = !visible;
  elements.resultsPanel.hidden = !visible;
  if (state.analysisMode === "desertification") {
    elements.landProcessingPanel.hidden = !visible;
  }
}

function renderScenes({ reveal = true } = {}) {
  const searchGeneration = ++state.searchGeneration;
  const sizeTasks = [];
  clearSceneOutlines();
  let regionGeometry = null;
  try {
    regionGeometry = geometryFromMap();
  } catch {
    // Результаты всё равно отображаются, даже если регион был удалён с карты.
  }
  elements.sceneRows.replaceChildren();
  elements.backToTilesButton.hidden = !(
    state.analysisMode === "desertification" && state.activeLandTile
  );
  elements.sceneCount.textContent = String(state.scenes.length);
  elements.sceneCountNote.textContent =
    state.scenes.length === 0
      ? "Сцен в заданном диапазоне нет"
      : "Самые новые в выбранном диапазоне";

  if (state.scenes.length === 0) {
    elements.emptyStateTitle.textContent = "Сцен в диапазоне не найдено";
    elements.emptyStateText.textContent =
      "Измените даты, регион или параметры поиска и повторите запрос.";
    elements.emptyState.hidden = false;
    elements.tableWrap.hidden = true;
    elements.latestScene.textContent = "—";
    setSearchResultsVisibility(reveal);
    return;
  }

  elements.emptyState.hidden = true;
  elements.tableWrap.hidden = false;
  elements.latestScene.textContent = formatCompactDate(
    state.scenes[0].datetime,
  );

  if (state.analysisMode === "desertification" && !state.activeLandTile) {
    renderLandTileGroups(regionGeometry);
    setSearchResultsVisibility(reveal);
    return;
  }

  state.scenes.forEach((scene, index) => {
    const row = document.createElement("tr");
    row.dataset.sceneIndex = String(index);
    row.addEventListener("click", () => showScene(scene, index, false));

    row.appendChild(scenePreviewCell(scene.geometry, regionGeometry));

    row.appendChild(
      cellWithNote(
        formatDateTime(scene.datetime),
        scene.storage_exists
          ? "Источник: Object Storage"
          : scene.orbit_direction
          ? `Орбита: ${translateOrbit(scene.orbit_direction)}`
          : "Направление орбиты не указано",
      ),
    );

    const productCell = document.createElement("td");
    const productName = document.createElement("span");
    productName.className = "product-name";
    productName.textContent = scene.name || scene.stac_item_id || "Без имени";
    productName.title = productName.textContent;
    productCell.appendChild(productName);
    const collection = document.createElement("span");
    collection.className = "cell-note";
    const collectionLabel = formatCollection(scene.collection);
    collection.textContent =
      scene.storage_exists
        ? `${collectionLabel} · исходные данные уже в хранилище`
        : scene.download_product_type === "original-safe"
        ? `${collectionLabel} · временная обработка на сервере`
        : collectionLabel;
    productCell.appendChild(collection);
    row.appendChild(productCell);

    row.appendChild(
      cellWithNote(
        formatPlatform(scene.platform),
        scene.collection === "sentinel-2-l2a"
          ? "Оптические данные уровня L2A"
          : scene.polarizations?.length
          ? `Поляризация: ${scene.polarizations.join(" / ")}`
          : "Поляризация не указана",
      ),
    );

    const cloudText =
      scene.cloud_cover === null || scene.cloud_cover === undefined
        ? "SAR: облачность не влияет"
        : `Облачность: ${Number(scene.cloud_cover).toFixed(1)}%`;
    row.appendChild(cellWithNote(cloudText, "Нажмите строку для контура"));

    const actionCell = document.createElement("td");
    const downloadPanel = document.createElement("div");
    downloadPanel.className = "download-panel";
    const downloadMeta = document.createElement("span");
    downloadMeta.className = "download-meta";
    downloadMeta.textContent = "Размер: определяется…";
    const actionGroup = document.createElement("div");
    actionGroup.className = "scene-actions";

    const downloadButton = document.createElement("button");
    downloadButton.type = "button";
    downloadButton.className = "button download-button";
    downloadButton.textContent = "Скачать";
    downloadButton.dataset.sceneIndex = String(index);

    let processButton = null;
    const archiveButton = document.createElement("button");
    archiveButton.type = "button";
    archiveButton.className = "button secondary archive-safe-button";
    archiveButton.textContent = "Выгрузить SAFE и удалить";
    archiveButton.hidden = true;
    if (
      scene.collection === "sentinel-1-grd" ||
      (state.analysisMode === "desertification" &&
        scene.collection === "sentinel-2-l2a")
    ) {
      processButton = document.createElement("button");
      processButton.type = "button";
      processButton.className = "button process-scene-button";
      processButton.textContent = state.analysisMode === "desertification"
        ? "Добавить к обработке"
        : "Обработать";
      processButton.disabled = true;
      processButton.hidden = true;
    }

    downloadButton.addEventListener("click", (buttonEvent) => {
      buttonEvent.stopPropagation();
      startDownload(
        scene,
        downloadButton,
        processButton,
        archiveButton,
        downloadMeta,
      );
    });
    processButton?.addEventListener("click", (buttonEvent) => {
      buttonEvent.stopPropagation();
      showScene(scene, index, false);
      if (state.analysisMode === "desertification") {
        toggleLandScene(
          scene,
          processButton.dataset.filename || "",
          processButton,
        );
      } else {
        selectSceneForProcessing(
          scene,
          processButton.dataset.filename || "",
          "",
        );
      }
    });
    archiveButton.addEventListener("click", (buttonEvent) => {
      buttonEvent.stopPropagation();
      void startArchiveSafe(
        scene,
        archiveButton.dataset.filename || "",
        downloadButton,
        processButton,
        archiveButton,
        downloadMeta,
      );
    });

    actionGroup.append(downloadButton);
    processButton && actionGroup.append(processButton);
    actionGroup.append(archiveButton);
    downloadPanel.append(downloadMeta, actionGroup);
    actionCell.appendChild(downloadPanel);
    row.appendChild(actionCell);

    elements.sceneRows.appendChild(row);
    if (scene.local_exists) {
      markSceneLocal(
        scene,
        downloadButton,
        processButton,
        archiveButton,
        downloadMeta,
        {
          filename: scene.local_filename || scene.name || "",
          sizeBytes:
            scene.local_size_bytes || scene.size_bytes || 0,
          reused: true,
        },
      );
    } else {
      if (scene.storage_exists) {
        downloadButton.textContent = "Получить на сервер";
        downloadMeta.textContent = `Размер: ${formatBytes(scene.storage_size_bytes || scene.size_bytes)}`;
      }
      sizeTasks.push({
        scene,
        downloadMeta,
        downloadButton,
        processButton,
        archiveButton,
      });
    }
  });

  syncLandSceneButtons();
  renderSceneOutlines();
  void loadDownloadSizes(sizeTasks, searchGeneration);
  setSearchResultsVisibility(reveal);
}

function renderLandTileGroups(regionGeometry) {
  const groups = new Map();
  for (const scene of state.scenes) {
    const tile = sentinel2SceneTile(scene);
    if (!tile) continue;
    const group = groups.get(tile) || [];
    group.push(scene);
    groups.set(tile, group);
  }
  const ordered = [...groups.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  );
  elements.sceneCount.textContent = String(ordered.length);
  elements.sceneCountNote.textContent = `${state.scenes.length} сцен сгруппированы по тайлам`;
  elements.resultsSourceLabel.textContent = "Тайлы Sentinel-2";

  for (const [tile, scenes] of ordered) {
    scenes.sort((left, right) =>
      String(right.datetime || "").localeCompare(String(left.datetime || "")),
    );
    const representative = scenes[0];
    const dates = new Set(scenes.map(sentinel2SceneDate).filter(Boolean));
    const platforms = new Set(scenes.map((scene) => formatPlatform(scene.platform)));
    const row = document.createElement("tr");
    row.className = "tile-group-row";
    row.appendChild(scenePreviewCell(representative.geometry, regionGeometry));
    row.appendChild(
      cellWithNote(formatCompactDate(representative.datetime), "Последняя доступная дата"),
    );
    row.appendChild(cellWithNote(tile, `${dates.size} ${pluralDates(dates.size)}`));
    row.appendChild(cellWithNote([...platforms].join(" / "), "Sentinel-2 L2A"));
    row.appendChild(cellWithNote(`${scenes.length} сцен`, "Выберите тайл, затем дату"));
    const actionCell = document.createElement("td");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "button download-button";
    button.textContent = "Выбрать даты";
    const chooseDates = async (event) => {
      event?.stopPropagation();
      button.disabled = true;
      button.textContent = "Поиск дат…";
      const opened = await searchLandTileDates(representative);
      if (!opened && button.isConnected) {
        button.disabled = false;
        button.textContent = "Выбрать даты";
      }
    };
    button.addEventListener("click", chooseDates);
    actionCell.appendChild(button);
    row.appendChild(actionCell);
    row.addEventListener("click", chooseDates);
    elements.sceneRows.appendChild(row);
  }
  renderSceneOutlines();
}

function showLandTileGroups() {
  state.landTileSearchController?.abort();
  state.landTileSearchController = null;
  state.activeLandTile = "";
  state.scenes = state.landCatalogueScenes.slice();
  state.selectedSceneIndex = -1;
  elements.requestState.textContent = `${new Set(state.scenes.map(sentinel2SceneTile).filter(Boolean)).size} тайлов`;
  elements.requestState.className = "request-state success";
  renderScenes();
}

function scenePreviewCell(sceneGeometry, regionGeometry) {
  const cell = document.createElement("td");
  cell.className = "scene-preview-cell";

  const preview = document.createElement("div");
  preview.className = "scene-preview";
  preview.title = sceneGeometry
    ? "Контур покрытия сцены. Красным показана область анализа."
    : "Контур покрытия отсутствует в каталоге.";

  const sceneRings = geometryRings(sceneGeometry);
  const regionRings = geometryRings(regionGeometry);
  if (sceneRings.length === 0) {
    const empty = document.createElement("span");
    empty.className = "scene-preview-empty";
    empty.textContent = "Нет контура";
    preview.appendChild(empty);
    cell.appendChild(preview);
    return cell;
  }

  const svgNamespace = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNamespace, "svg");
  svg.setAttribute("viewBox", "0 0 108 68");
  svg.setAttribute("role", "img");
  svg.setAttribute(
    "aria-label",
    "Предпросмотр границы покрытия спутниковой сцены",
  );

  const title = document.createElementNS(svgNamespace, "title");
  title.textContent =
    "Граница сцены; красным показана область анализа";
  svg.appendChild(title);

  const projected = projectPreviewGeometries(sceneRings, regionRings);
  if (projected.region.length > 0) {
    const regionPath = document.createElementNS(svgNamespace, "path");
    regionPath.setAttribute("class", "scene-preview-region");
    regionPath.setAttribute("d", ringsToSvgPath(projected.region));
    svg.appendChild(regionPath);
  }

  const scenePath = document.createElementNS(svgNamespace, "path");
  scenePath.setAttribute("class", "scene-preview-footprint");
  scenePath.setAttribute("d", ringsToSvgPath(projected.scene));
  svg.appendChild(scenePath);

  preview.appendChild(svg);
  cell.appendChild(preview);
  return cell;
}

function geometryRings(geometry) {
  if (!geometry || !Array.isArray(geometry.coordinates)) {
    return [];
  }
  if (geometry.type === "Polygon") {
    return geometry.coordinates.filter(Array.isArray);
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.flatMap((polygon) =>
      Array.isArray(polygon) ? polygon.filter(Array.isArray) : [],
    );
  }
  return [];
}

function projectPreviewGeometries(sceneRings, regionRings) {
  const scenePoints = sceneRings.flat();
  const longitudeReference = previewLongitudeReference(scenePoints);

  const projectRing = (ring) =>
    ring
      .filter(
        (point) =>
          Array.isArray(point) &&
          Number.isFinite(Number(point[0])) &&
          Number.isFinite(Number(point[1])),
      )
      .map((point) =>
        previewMercatorPoint(point, longitudeReference),
      );

  const projectedScene = sceneRings.map(projectRing).filter(
    (ring) => ring.length >= 3,
  );
  const projectedRegion = regionRings.map(projectRing).filter(
    (ring) => ring.length >= 3,
  );
  const projectedPoints = projectedScene.flat();

  if (projectedPoints.length === 0) {
    return { scene: [], region: [] };
  }

  const xs = projectedPoints.map((point) => point[0]);
  const ys = projectedPoints.map((point) => point[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = Math.max(maxX - minX, 1e-9);
  const height = Math.max(maxY - minY, 1e-9);
  const padding = 6;
  const contentWidth = 108 - padding * 2;
  const contentHeight = 68 - padding * 2;
  const scale = Math.min(contentWidth / width, contentHeight / height);
  const offsetX = padding + (contentWidth - width * scale) / 2;
  const offsetY = padding + (contentHeight - height * scale) / 2;

  const fitRing = (ring) =>
    ring.map(([x, y]) => [
      offsetX + (x - minX) * scale,
      offsetY + (maxY - y) * scale,
    ]);

  return {
    scene: projectedScene.map(fitRing),
    region: projectedRegion.map(fitRing),
  };
}

function previewLongitudeReference(points) {
  const validLongitudes = points
    .filter(
      (point) =>
        Array.isArray(point) && Number.isFinite(Number(point[0])),
    )
    .map((point) => (Number(point[0]) * Math.PI) / 180);
  if (validLongitudes.length === 0) return 0;

  const sine = validLongitudes.reduce(
    (sum, longitude) => sum + Math.sin(longitude),
    0,
  );
  const cosine = validLongitudes.reduce(
    (sum, longitude) => sum + Math.cos(longitude),
    0,
  );
  if (Math.abs(sine) < 1e-9 && Math.abs(cosine) < 1e-9) {
    return (validLongitudes[0] * 180) / Math.PI;
  }
  return (Math.atan2(sine, cosine) * 180) / Math.PI;
}

function previewMercatorPoint(point, longitudeReference) {
  let longitude = Number(point[0]);
  while (longitude - longitudeReference > 180) longitude -= 360;
  while (longitude - longitudeReference < -180) longitude += 360;

  const latitude = Math.max(-85, Math.min(85, Number(point[1])));
  const latitudeRadians = (latitude * Math.PI) / 180;
  const mercatorY =
    (Math.log(Math.tan(Math.PI / 4 + latitudeRadians / 2)) * 180) /
    Math.PI;
  return [longitude, mercatorY];
}

function ringsToSvgPath(rings) {
  return rings
    .map((ring) =>
      ring
        .map(
          ([x, y], index) =>
            `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`,
        )
        .join(" ")
        .concat(" Z"),
    )
    .join(" ");
}

async function loadDownloadSizes(tasks, searchGeneration) {
  let nextTask = 0;
  const workerCount = Math.min(3, tasks.length);

  async function worker() {
    while (nextTask < tasks.length) {
      const task = tasks[nextTask];
      nextTask += 1;

      try {
        const info = await fetchJSON(apiUrl("/api/download/info"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scene: task.scene }),
        });
        if (searchGeneration !== state.searchGeneration) return;

        task.scene.downloadInfo = info;
        if (task.scene.downloadStarted) continue;
        const sizeBytes =
          Number(info.storage_size_bytes) > 0
            ? Number(info.storage_size_bytes)
            : Number(info.size_bytes);
        task.downloadMeta.textContent = Number(sizeBytes) > 0
          ? `Размер: ${formatBytes(sizeBytes)}`
          : "Размер: нет данных";
        task.downloadMeta.title = info.filename || "";
        if (info.local_exists) {
          markSceneLocal(
            task.scene,
            task.downloadButton,
            task.processButton,
            task.archiveButton,
            task.downloadMeta,
            {
              filename: info.filename,
              sizeBytes,
              reused: true,
            },
          );
        } else if (info.storage_exists) {
          task.downloadButton.textContent = "Получить на сервер";
          task.downloadButton.title = "SAFE находится в Object Storage";
          task.downloadMeta.textContent = `Размер: ${formatBytes(sizeBytes)} · архив`;
        }
      } catch (error) {
        if (searchGeneration !== state.searchGeneration) return;
        if (task.scene.downloadStarted) continue;
        task.downloadMeta.textContent = "Размер: недоступен";
        task.downloadMeta.title = error.message;
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
}

function markSceneLocal(
  scene,
  downloadButton,
  processButton,
  archiveButton,
  downloadMeta,
  {
    filename = "",
    sizeBytes = 0,
    reused = false,
  } = {},
) {
  scene.localReady = true;
  scene.local_exists = true;
  scene.local_filename = filename;
  registerTimelineScene(scene);
  downloadButton.className = "button download-button completed";
  downloadButton.textContent = "На сервере";
  downloadButton.title = filename;
  downloadButton.disabled = true;

  if (Number(sizeBytes) > 0) {
    downloadMeta.textContent =
      `Размер: ${formatBytes(sizeBytes)} · локально`;
  }
  downloadMeta.title = filename;
  archiveButton.hidden = false;
  archiveButton.disabled = !state.objectStorageConfigured;
  archiveButton.title = state.objectStorageConfigured
    ? "Выгрузить архив и освободить место на сервере"
    : "Сначала настройте Object Storage";
  archiveButton.dataset.filename = filename;

  if (
    scene.collection === "sentinel-1-grd" &&
    processButton &&
    filename
  ) {
    processButton.hidden = false;
    processButton.disabled = !state.snapAvailable;
    processButton.dataset.filename = filename || "";
    processButton.textContent = "Обработать";
  }

  if (
    state.analysisMode === "desertification" &&
    scene.collection === "sentinel-2-l2a" &&
    processButton &&
    filename
  ) {
    processButton.hidden = false;
    processButton.disabled = !state.desertificationModelAvailable;
    processButton.dataset.filename = filename || "";
    processButton.textContent = "Добавить к обработке";
  }

  if (reused) {
    scene.downloadInfo = {
      ...(scene.downloadInfo || {}),
      local_exists: true,
      local_filename: filename,
      local_size_bytes: sizeBytes,
    };
  }
}

function cellWithNote(mainText, noteText) {
  const cell = document.createElement("td");
  const main = document.createElement("span");
  main.textContent = mainText;
  cell.appendChild(main);
  const note = document.createElement("span");
  note.className = "cell-note";
  note.textContent = noteText;
  cell.appendChild(note);
  return cell;
}

function renderSceneOutlines() {
  const combinedBounds = L.latLngBounds([]);
  state.sceneLayers = state.scenes.map((scene, index) => {
    if (!scene.geometry) return null;

    const layer = L.geoJSON(scene.geometry, {
      style: sceneOverviewStyle,
    }).addTo(state.map);
    const bounds = layer.getBounds();
    if (bounds.isValid()) {
      combinedBounds.extend(bounds);
    }
    layer.on("click", (event) => {
      if (event.originalEvent) {
        L.DomEvent.stopPropagation(event.originalEvent);
      }
      showScene(scene, index, false);
    });
    return layer;
  });

  if (combinedBounds.isValid()) {
    state.map.fitBounds(combinedBounds, { padding: [30, 30] });
  }
}

function showScene(scene, index, fitBounds = false) {
  if (!scene.geometry) {
    showToast("У этой сцены нет геометрии в ответе каталога.", true);
    return;
  }

  state.selectedSceneIndex = index;
  refreshSceneOutlineStyles();
  const selectedLayer = state.sceneLayers[index];
  selectedLayer?.bringToFront();
  updateSelectedSceneRow();
  showOpticalScene(scene);

  if (
    state.analysisMode === "desertification" &&
    scene.collection === "sentinel-2-l2a"
  ) {
    void searchLandTileDates(scene);
  }

  const bounds = selectedLayer?.getBounds();
  if (fitBounds && bounds?.isValid()) {
    state.map.fitBounds(bounds, { padding: [36, 36] });
  }
}

function showOpticalScene(scene) {
  clearOpticalScene();
  if (
    scene.collection !== "sentinel-2-l2a" ||
    !scene.thumbnail_url ||
    !Array.isArray(scene.bbox) ||
    scene.bbox.length < 4
  ) {
    return;
  }

  const [west, south, east, north] = scene.bbox.map(Number);
  if (![west, south, east, north].every(Number.isFinite)) return;

  state.opticalLayer = L.imageOverlay(
    scene.thumbnail_url,
    [[south, west], [north, east]],
    {
      pane: "opticalPreviewPane",
      opacity: 0.82,
      interactive: false,
      crossOrigin: true,
    },
  ).addTo(state.map);
}

function clearOpticalScene() {
  if (state.opticalLayer && state.map.hasLayer(state.opticalLayer)) {
    state.map.removeLayer(state.opticalLayer);
  }
  state.opticalLayer = null;
}

function refreshSceneOutlineStyles() {
  if (!state.map || state.sceneLayers.length === 0) return;

  state.sceneLayers.forEach((layer, index) => {
    if (!layer) return;
    layer.setStyle(
      index === state.selectedSceneIndex
        ? sceneStyle()
        : sceneOverviewStyle(),
    );
  });
}

function updateSelectedSceneRow() {
  for (const row of elements.sceneRows.querySelectorAll("tr")) {
    const isSelected =
      Number(row.dataset.sceneIndex) === state.selectedSceneIndex;
    row.classList.toggle("scene-row-selected", isSelected);
    row.setAttribute("aria-selected", String(isSelected));
  }
}

function clearSceneOutlines() {
  clearOpticalScene();
  for (const layer of state.sceneLayers) {
    if (layer && state.map.hasLayer(layer)) {
      state.map.removeLayer(layer);
    }
  }
  state.sceneLayers = [];
  state.selectedSceneIndex = -1;
  updateSelectedSceneRow();
}

async function startDownload(
  scene,
  button,
  processButton,
  archiveButton,
  downloadMeta,
) {
  if (
    state.analysisMode === "desertification" &&
    state.safeCacheMode !== "local-first-v1"
  ) {
    showToast(
      "Запущена предыдущая версия backend. Перезапустите NatObserve, чтобы SAFE сохранялся на сервере и стал доступен для обработки.",
      true,
    );
    return;
  }

  if (
    !state.credentialsConfigured &&
    !state.objectStorageConfigured
  ) {
    showToast(
      "Добавьте CDSE_USERNAME и CDSE_PASSWORD в .env и перезапустите приложение.",
      true,
    );
    return;
  }

  scene.downloadStarted = true;
  button.disabled = true;
  button.className = "button download-button running";
  button.textContent = "В очереди…";

  try {
    const result = await fetchJSON(apiUrl("/api/download"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scene }),
    });
    await pollDownload(
      result.job_id,
      scene,
      button,
      processButton,
      archiveButton,
      downloadMeta,
    );
  } catch (error) {
    setDownloadFailed(button, error.message);
  }
}

async function pollDownload(
  jobId,
  scene,
  button,
  processButton,
  archiveButton,
  downloadMeta,
) {
  const startedAt = Date.now();
  const maximumWait = 6 * 60 * 60 * 1000;

  while (Date.now() - startedAt < maximumWait) {
    let job;
    try {
      job = await fetchJSON(
        apiUrl(`/api/download/status?id=${encodeURIComponent(jobId)}`),
      );
    } catch (error) {
      setDownloadFailed(button, error.message);
      return;
    }

    updateDownloadProgress(job, button, downloadMeta);

    if (job.status === "completed") {
      if (job.local_ready) {
        markSceneLocal(
          scene,
          button,
          processButton,
          archiveButton,
          downloadMeta,
          {
            filename: job.filename,
            sizeBytes: job.total_bytes,
            reused: Boolean(job.local_reused),
          },
        );
      } else {
        await reconcileCompletedDownload(
          scene,
          job,
          button,
          processButton,
          archiveButton,
          downloadMeta,
        );
      }
      if (job.local_ready) {
        showToast(job.local_reused
          ? "SAFE уже находится в локальном кэше сервера."
          : `SAFE готов к обработке на сервере: ${job.filename}`);
      }
      if (job.cache) updateSafeCacheStatus(job.cache);
      return;
    }

    if (job.status === "failed") {
      setDownloadFailed(
        button,
        job.message || "Ошибка загрузки.",
      );
      return;
    }

    await delay(1000);
  }

  setDownloadFailed(
    button,
    "Превышено время ожидания статуса загрузки.",
  );
}

async function reconcileCompletedDownload(
  scene,
  job,
  button,
  processButton,
  archiveButton,
  downloadMeta,
) {
  scene.storage_exists = Boolean(job.storage_uploaded || job.storage_reused);
  scene.storage_key = job.storage_key || scene.storage_key || "";

  try {
    const info = await fetchJSON(apiUrl("/api/download/info"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scene }),
    });
    scene.downloadInfo = info;

    if (info.local_exists) {
      markSceneLocal(
        scene,
        button,
        processButton,
        archiveButton,
        downloadMeta,
        {
          filename: info.local_filename || info.filename,
          sizeBytes: info.local_size_bytes || info.size_bytes,
          reused: true,
        },
      );
      showToast("SAFE найден в локальном кэше и доступен для обработки.");
      return;
    }

    if (info.storage_exists || scene.storage_exists) {
      scene.storage_exists = true;
      scene.storage_key = info.storage_key || scene.storage_key;
      button.className = "button download-button";
      button.textContent = state.safeCacheMode === "local-first-v1"
        ? "Получить на сервер"
        : "Нужен перезапуск";
      button.title = state.safeCacheMode === "local-first-v1"
        ? "SAFE находится в Object Storage — получить в локальный кэш"
        : "Перезапустите backend для включения локального SAFE-кэша";
      button.disabled = state.safeCacheMode !== "local-first-v1";
      downloadMeta.textContent =
        `Размер: ${formatBytes(info.storage_size_bytes || info.size_bytes || job.total_bytes)} · архив`;
      showToast(
        state.safeCacheMode === "local-first-v1"
          ? "SAFE сохранён в архиве. Нажмите «Получить на сервер», затем добавьте сцену к обработке."
          : "SAFE сохранён в архиве, но запущена предыдущая версия backend. Перезапустите NatObserve.",
        state.safeCacheMode !== "local-first-v1",
      );
      return;
    }
  } catch (error) {
    button.title = error.message;
  }

  setDownloadFailed(
    button,
    "Передача завершилась, но SAFE не найден ни на сервере, ни в Object Storage.",
  );
}

function updateDownloadProgress(
  job,
  button,
  downloadMeta,
) {
  const downloadedBytes = Number(job.downloaded_bytes) || 0;
  const totalBytes = Number(job.total_bytes) || 0;
  const percent =
    totalBytes > 0
      ? Math.min(
          100,
          Math.max(0, Number(job.progress_percent) || 0),
        )
      : 0;

  if (totalBytes > 0) {
    downloadMeta.textContent =
      downloadedBytes > 0
        ? `Размер: ${formatBytes(totalBytes)} · ${Math.round(percent)}%`
        : `Размер: ${formatBytes(totalBytes)} · 0%`;
  } else if (downloadedBytes > 0) {
    downloadMeta.textContent = `Скачано: ${formatBytes(downloadedBytes)}`;
  }

  button.textContent =
    job.status === "queued"
      ? "В очереди…"
      : job.phase === "storage"
        ? "Выгрузка в Storage…"
      : job.phase === "storage-download"
        ? "Получение из Storage…"
      : totalBytes > 0
        ? "Загрузка…"
        : "Загрузка…";
}

function updateSafeCacheStatus(cache) {
  if (!cache) return;
  state.safeCache = cache;
  elements.storageStatus.textContent =
    `SAFE на сервере: ${formatBytes(cache.used_bytes)} из ${formatBytes(cache.limit_bytes)}`;
}

async function startArchiveSafe(
  scene,
  filename,
  downloadButton,
  processButton,
  archiveButton,
  downloadMeta,
) {
  if (!filename) return;
  archiveButton.disabled = true;
  archiveButton.textContent = "Выгрузка…";
  try {
    const queued = await fetchJSON(apiUrl("/api/cache/archive"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename }),
    });
    const startedAt = Date.now();
    while (Date.now() - startedAt < 6 * 60 * 60 * 1000) {
      await delay(1000);
      const job = await fetchJSON(
        apiUrl(`/api/download/status?id=${encodeURIComponent(queued.job_id)}`),
      );
      archiveButton.textContent = job.phase === "storage"
        ? "Выгрузка в Storage…"
        : "В очереди…";
      if (job.status === "completed") {
        scene.local_exists = false;
        scene.localReady = false;
        scene.storage_exists = true;
        scene.storage_key = job.storage_key || "";
        state.selectedLandScenes = state.selectedLandScenes.filter(
          (item) => item.local_filename !== filename,
        );
        updateLandSelection();
        removeTimelineScene(filename);
        archiveButton.hidden = true;
        processButton && (processButton.hidden = true);
        downloadButton.disabled = false;
        downloadButton.className = "button download-button";
        downloadButton.textContent = "Получить на сервер";
        downloadMeta.textContent = `Размер: ${formatBytes(job.total_bytes)} · архив`;
        updateSafeCacheStatus(job.cache);
        showToast("SAFE выгружен в Object Storage и удалён с сервера.");
        return;
      }
      if (job.status === "failed") throw new Error(job.message || "Ошибка выгрузки SAFE.");
    }
    throw new Error("Превышено время ожидания выгрузки SAFE.");
  } catch (error) {
    archiveButton.disabled = false;
    archiveButton.textContent = "Выгрузить SAFE и удалить";
    showToast(error.message, true);
  }
}

function toggleLandScene(scene, localFilename, button = null) {
  if (scene.collection !== "sentinel-2-l2a") {
    showToast("GeoIntellect принимает только Sentinel-2 L2A.", true);
    return;
  }
  if (!localFilename) {
    showToast("Сначала загрузите Sentinel-2 SAFE на сервер.", true);
    return;
  }
  const existingIndex = state.selectedLandScenes.findIndex(
    (item) => item.local_filename === localFilename,
  );
  if (existingIndex >= 0) {
    state.selectedLandScenes.splice(existingIndex, 1);
  } else {
    const selectedOtherTile = state.selectedLandScenes.some(
      (item) => sentinel2SceneTile(item) !== sentinel2SceneTile(scene),
    );
    if (selectedOtherTile) {
      state.selectedLandScenes = [];
      showToast(
        `Временная серия переключена на тайл ${sentinel2SceneTile(scene)}.`,
      );
    }
    state.selectedLandScenes.push({
      ...scene,
      local_filename: localFilename,
    });
  }
  button?.classList.toggle("scene-series-selected", existingIndex < 0);
  if (button) {
    button.textContent = existingIndex < 0
      ? "Выбрано"
      : "Добавить к обработке";
  }
  updateLandSelection();
}

function sentinel2SceneTile(scene) {
  const explicitTile = String(scene.tile_id || "").toUpperCase();
  const normalisedExplicit = explicitTile.match(/T?\d{2}[A-Z]{3}/)?.[0] || "";
  if (normalisedExplicit) {
    return normalisedExplicit.startsWith("T")
      ? normalisedExplicit
      : `T${normalisedExplicit}`;
  }
  const identity = [scene.name, scene.stac_item_id, scene.storage_key]
    .concat(scene.local_filename || "")
    .filter(Boolean)
    .join(" ")
    .toUpperCase();
  return identity.match(/T\d{2}[A-Z]{3}/)?.[0] || "";
}

function resetLandTileSearch() {
  state.landTileSearchController?.abort();
  state.landTileSearchController = null;
  state.activeLandTile = "";
  if (elements.backToTilesButton) elements.backToTilesButton.hidden = true;
  state.landTileSearchGeneration += 1;
}

function sceneIsStored(scene) {
  return Boolean(
    scene.local_exists ||
    scene.localReady ||
    scene.local_filename ||
    scene.downloadInfo?.local_exists ||
    scene.storage_exists ||
    scene.storageReady ||
    scene.storage_key ||
    scene.downloadInfo?.storage_exists,
  );
}

function preferredSceneForDate(current, candidate) {
  if (!current) return candidate;
  if (sceneIsStored(candidate) !== sceneIsStored(current)) {
    return sceneIsStored(candidate) ? candidate : current;
  }
  const currentCloud = Number(current.cloud_cover);
  const candidateCloud = Number(candidate.cloud_cover);
  if (Number.isFinite(candidateCloud) && !Number.isFinite(currentCloud)) {
    return candidate;
  }
  if (
    Number.isFinite(candidateCloud) &&
    Number.isFinite(currentCloud) &&
    candidateCloud < currentCloud
  ) {
    return candidate;
  }
  return current;
}

function tileScenesByDistinctDate(tile, anchorScene, candidates) {
  const scenesByDate = new Map();
  for (const scene of [anchorScene, ...candidates]) {
    if (sentinel2SceneTile(scene) !== tile) continue;
    const date = sentinel2SceneDate(scene);
    if (!date) continue;
    scenesByDate.set(
      date,
      preferredSceneForDate(scenesByDate.get(date), scene),
    );
  }
  return [...scenesByDate.values()].sort((left, right) =>
    String(right.datetime || "").localeCompare(String(left.datetime || "")),
  );
}

async function searchLandTileDates(anchorScene) {
  if (IS_STATIC_DEMO) {
    showToast("Для поиска дат тайла подключите backend-сервер.", true);
    return false;
  }
  const tile = sentinel2SceneTile(anchorScene);
  if (!tile) {
    showToast("Не удалось определить номер тайла Sentinel-2.", true);
    return false;
  }
  if (state.activeLandTile === tile) return true;

  state.landTileSearchController?.abort();
  const controller = new AbortController();
  state.landTileSearchController = controller;
  state.activeLandTile = tile;
  const generation = ++state.landTileSearchGeneration;
  const previousScenes = state.landCatalogueScenes.length
    ? state.landCatalogueScenes.slice()
    : state.scenes.slice();

  elements.resultsSourceLabel.textContent = `Тайл ${tile} · поиск других дат`;
  elements.requestState.textContent = `Ищем временной ряд ${tile}…`;
  elements.requestState.className = "request-state loading";

  let geometry = anchorScene.geometry;
  if (!geometry) {
    try {
      geometry = geometryFromMap();
    } catch (error) {
      state.activeLandTile = "";
      showToast(error.message, true);
      return false;
    }
  }

  try {
    const result = await fetchJSON(apiUrl("/api/search"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        collection: "sentinel-2-l2a",
        date_from: elements.dateFrom.value,
        date_to: elements.dateTo.value,
        cloud_cover: Number(elements.cloudCover.value),
        limit: Math.max(
          3,
          Math.min(100, Number(elements.resultLimit.value) || 30),
        ),
        geometry,
        tile_id: tile,
      }),
    });
    if (generation !== state.landTileSearchGeneration) return;

    state.scenes = tileScenesByDistinctDate(tile, anchorScene, [
      ...previousScenes,
      ...(result.scenes || []),
      ...state.selectedLandScenes,
    ]);
    renderScenes();
    const dateCount = state.scenes.length;
    elements.resultsSourceLabel.textContent = `Тайл ${tile} · разные даты`;
    elements.requestState.textContent = `${tile}: ${dateCount} ${pluralDates(dateCount)}`;
    elements.requestState.className = "request-state success";
    if (dateCount < 2) {
      showToast(
        `Для ${tile} в выбранном диапазоне снимков за другие даты не найдено.`,
        true,
      );
    }
    return true;
  } catch (error) {
    if (error.name === "AbortError") return false;
    if (generation !== state.landTileSearchGeneration) return false;
    state.activeLandTile = "";
    elements.resultsSourceLabel.textContent = "Каталог Copernicus";
    elements.requestState.textContent = "Не удалось найти другие даты";
    elements.requestState.className = "request-state error";
    showToast(error.message, true);
    return false;
  } finally {
    if (generation === state.landTileSearchGeneration) {
      state.landTileSearchController = null;
    }
  }
}

function sentinel2SceneDate(scene) {
  const datetime = String(scene.datetime || "");
  const isoDate = datetime.match(/20\d{2}-\d{2}-\d{2}/)?.[0];
  if (isoDate) return isoDate;
  const identity = [scene.name, scene.stac_item_id, scene.storage_key]
    .filter(Boolean)
    .join(" ");
  const compact = identity.match(/20\d{6}/)?.[0] || "";
  return compact
    ? `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`
    : "";
}

function landTemporalCoverage() {
  const required = Math.max(
    2,
    Math.min(60, Math.round(Number(elements.landMinObservations.value) || 3)),
  );
  const groups = new Map();
  for (const scene of state.selectedLandScenes) {
    const tile = sentinel2SceneTile(scene);
    const date = sentinel2SceneDate(scene);
    if (!tile || !date) continue;
    if (!groups.has(tile)) groups.set(tile, new Set());
    groups.get(tile).add(date);
  }
  const ranked = [...groups.entries()]
    .map(([tile, dates]) => ({ tile, count: dates.size }))
    .sort((left, right) => right.count - left.count || left.tile.localeCompare(right.tile));
  return {
    required,
    best: ranked[0] || { tile: "", count: 0 },
    qualifiedTiles: new Set(
      ranked.filter((item) => item.count >= required).map((item) => item.tile),
    ),
  };
}

function updateLandSelection() {
  if (!elements.landSelectedCount) return;
  const count = state.selectedLandScenes.length;
  elements.landSelectedCount.textContent = count === 1
    ? "Выбрана 1 сцена"
    : `Выбрано ${count} ${pluralScenes(count)}`;
  elements.landSelectedList.replaceChildren();
  state.selectedLandScenes.forEach((scene) => {
    const chip = document.createElement("span");
    chip.className = "land-selected-chip";
    const label = document.createElement("span");
    const tile = sentinel2SceneTile(scene);
    label.textContent = [
      formatCompactDate(scene.datetime),
      formatPlatform(scene.platform),
      tile,
    ].filter(Boolean).join(" · ");
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", "Удалить сцену из серии");
    remove.addEventListener("click", () => {
      const index = state.selectedLandScenes.findIndex(
        (item) => item.local_filename === scene.local_filename,
      );
      if (index >= 0) state.selectedLandScenes.splice(index, 1);
      updateLandSelection();
      syncLandSceneButtons();
    });
    chip.append(label, remove);
    elements.landSelectedList.appendChild(chip);
  });

  const coverage = landTemporalCoverage();
  const ready =
    coverage.qualifiedTiles.size > 0 &&
    state.desertificationModelAvailable &&
    !IS_STATIC_DEMO;
  elements.processLandButton.disabled = !ready;
  elements.landProcessingState.textContent = count === 0
    ? `Выберите ${coverage.required} сцен одного тайла`
    : coverage.qualifiedTiles.size === 0
      ? `${coverage.best.tile || "Один тайл"}: ${coverage.best.count}/${coverage.required} дат`
      : ready
        ? "Можно запускать обработку"
        : "Обработка недоступна: проверьте GeoIntellect";
  elements.landProcessingState.className = ready
    ? "request-state success"
    : "request-state";
}

function syncLandSceneButtons() {
  for (const button of elements.sceneRows.querySelectorAll(
    ".process-scene-button",
  )) {
    const selected = state.selectedLandScenes.some(
      (scene) => scene.local_filename === button.dataset.filename,
    );
    button.classList.toggle("scene-series-selected", selected);
    button.textContent = selected ? "Выбрано" : "Добавить к обработке";
  }
}

function pluralScenes(count) {
  const value = Math.abs(Number(count)) % 100;
  const last = value % 10;
  if (value > 10 && value < 20) return "сцен";
  if (last === 1) return "сцена";
  if (last >= 2 && last <= 4) return "сцены";
  return "сцен";
}

function pluralDates(count) {
  const value = Math.abs(Number(count)) % 100;
  const last = value % 10;
  if (value > 10 && value < 20) return "дат";
  if (last === 1) return "дата";
  if (last >= 2 && last <= 4) return "даты";
  return "дат";
}

async function handleLandProcessing(event) {
  event.preventDefault();
  if (IS_STATIC_DEMO) {
    showToast("Для реальной обработки подключите backend NatObserve.", true);
    return;
  }
  if (!state.desertificationModelAvailable) {
    showToast("Модель GeoIntellect не найдена на сервере.", true);
    return;
  }
  const coverage = landTemporalCoverage();
  if (coverage.qualifiedTiles.size === 0) {
    showToast(
      `Выберите минимум ${coverage.required} снимков одного тайла Sentinel-2 за разные даты.`,
      true,
    );
    return;
  }

  let geometry;
  try {
    geometry = geometryFromMap();
  } catch (error) {
    showToast(error.message, true);
    return;
  }

  const payload = {
    geometry,
    scenes: state.selectedLandScenes
      .filter((scene) => coverage.qualifiedTiles.has(sentinel2SceneTile(scene)))
      .map((scene) => ({
      collection: "sentinel-2-l2a",
      local_filename: scene.local_filename,
      name: scene.name || scene.stac_item_id || "",
      datetime: scene.datetime || "",
      platform: scene.platform || "",
      })),
    bare_threshold: Number(elements.landBareThreshold.value),
    min_trend_observations: Number(elements.landMinObservations.value),
  };
  setLandProcessingLoading(true, "Задание поставлено в очередь");
  try {
    const result = await fetchJSON(
      apiUrl("/api/desertification/process/local"),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    await pollLandProcessing(result.job_id);
  } catch (error) {
    setLandProcessingLoading(false, "Ошибка обработки", true);
    showToast(error.message, true);
  }
}

async function pollLandProcessing(jobId) {
  const startedAt = Date.now();
  const maximumWait = 24 * 60 * 60 * 1000;
  while (Date.now() - startedAt < maximumWait) {
    await delay(2500);
    let job;
    try {
      job = await fetchJSON(
        apiUrl(`/api/process/status?id=${encodeURIComponent(jobId)}`),
      );
    } catch (error) {
      setLandProcessingLoading(false, "Сервер недоступен", true);
      showToast(error.message, true);
      return;
    }
    elements.landProcessingState.textContent = job.message || "Обработка…";
    elements.landProcessingState.className = "request-state loading";
    const label = elements.processLandButton.querySelector("span");
    label.textContent = job.phase === "extracting"
        ? "Распаковка SAFE…"
        : job.phase === "model"
          ? "GeoIntellect выполняет модель…"
          : job.phase === "storage"
            ? "Сохранение результатов…"
            : "Подготовка отчётов…";

    if (job.status === "completed") {
      renderLandProcessingResult(job.result || {});
      setLandProcessingLoading(false, "Готово");
      showToast("Анализ опустынивания завершён; SAFE оставлены на сервере.");
      return;
    }
    if (job.status === "failed") {
      setLandProcessingLoading(false, "Ошибка обработки", true);
      showToast(job.message || "Ошибка GeoIntellect.", true);
      return;
    }
  }
  setLandProcessingLoading(false, "Превышено время ожидания", true);
}

function setLandProcessingLoading(isLoading, message, isError = false) {
  elements.processLandButton.disabled = isLoading;
  elements.landBareThreshold.disabled = isLoading;
  elements.landMinObservations.disabled = isLoading;
  elements.landProcessingState.textContent = message;
  elements.landProcessingState.className = isError
    ? "request-state error"
    : isLoading
      ? "request-state loading"
      : "request-state success";
  elements.processLandButton.querySelector("span").textContent = isLoading
    ? "Сервер выполняет задание…"
    : "Обработать выбранные сцены";
  if (!isLoading) updateLandSelection();
}

function renderLandProcessingResult(result) {
  const metrics = result.metrics || {};
  const series = Array.isArray(metrics.timeseries) ? metrics.timeseries : [];
  elements.landDemoBanner.textContent =
    `Реальный результат GeoIntellect · ${Number(metrics.scene_count) || 0} Sentinel-2 SAFE` +
    (metrics.statistics_provisional ? " · предварительная статистика" : "");
  elements.landDemoBanner.className = metrics.statistics_provisional
    ? "demo-data-banner request-state loading"
    : "demo-data-banner request-state success";
  const dates = series.map((item) => String(item.date || item.year || "")).filter(Boolean);
  elements.landMetricPeriod.textContent = dates.length
    ? `${formatCompactDate(dates[0])}–${formatCompactDate(dates.at(-1))}`
    : "—";
  elements.landMetricZones.textContent = String(
    Number(metrics.problem_zone_count) || 0,
  );
  elements.landMetricStrong.textContent =
    `${formatArea(metrics.strong_desertification_area_km2)} км²`;
  const priorityText = metrics.priority_score_available
    ? formatDecimal(metrics.maximum_priority_score, 1)
    : "—";
  elements.landMetricPriority.textContent = priorityText;
  elements.summaryConcentration.textContent = priorityText;
  elements.summaryConcentrationNote.textContent =
    metrics.priority_score_available
      ? `${Number(metrics.problem_zone_count) || 0} проблемных зон` +
        (metrics.temporal_validation_passed ? "" : " · предварительно")
      : "Проблемные зоны не выделены";
  elements.landTrendCaption.textContent = metrics.trend_available
    ? "Динамика индексов проблемной зоны №1"
    : "Наблюдения проблемной зоны №1 · для многолетнего тренда нужны разные годы";
  renderLandTrendChart(series);
  elements.landResult.hidden = false;
  elements.landResultWarning.textContent = result.warning || "";

  const downloads = result.downloads || {};
  setDownloadLink(elements.downloadDesertificationMap, downloads.desertification_geotiff);
  setDownloadLink(elements.downloadPastureMap, downloads.pasture_geotiff);
  setDownloadLink(elements.downloadProblemZones, downloads.problem_zones);
  setDownloadLink(elements.downloadLandReport, downloads.report);
  setDownloadLink(elements.downloadLandTimeseries, downloads.timeseries);
  setDownloadLink(elements.downloadLandMetadata, downloads.metadata);
  setDownloadLink(elements.downloadLandLog, downloads.model_log);
  if (result.image_url && Array.isArray(result.bounds)) {
    addResultOverlay(
      { image_url: result.image_url, bounds: result.bounds },
      { fit: true, persist: true },
    );
  }
}

async function restoreLandProcessingResult() {
  if (IS_STATIC_DEMO || state.analysisMode !== "desertification") return;
  const record = [...state.resultOverlayRecords].reverse().find(
    (item) => String(item.image_url || "").includes("kind=overlay"),
  );
  const jobId = String(record?.image_url || "").match(/[?&]id=([0-9a-fA-F-]{20,64})/)?.[1];
  if (!jobId) return;
  try {
    const result = await fetchJSON(
      apiUrl(`/api/desertification/result?id=${encodeURIComponent(jobId)}`),
    );
    elements.landProcessingPanel.hidden = false;
    renderLandProcessingResult(result);
  } catch {
    // Карта остаётся доступной, даже если старый отчёт уже удалён с сервера.
  }
}

function initialiseLandDemoDashboard() {
  if (state.analysisMode !== "desertification") return;
  renderLandTrendChart([
    { year: 2020, ndvi: 0.272, ndmi: -0.062, bsi: 0.171 },
    { year: 2021, ndvi: 0.264, ndmi: -0.07, bsi: 0.179 },
    { year: 2022, ndvi: 0.256, ndmi: -0.077, bsi: 0.187 },
    { year: 2023, ndvi: 0.248, ndmi: -0.084, bsi: 0.195 },
    { year: 2024, ndvi: 0.241, ndmi: -0.091, bsi: 0.203 },
    { year: 2025, ndvi: 0.232, ndmi: -0.098, bsi: 0.211 },
  ]);
}

function renderLandTrendChart(series) {
  elements.landTrendChart.replaceChildren();
  if (!Array.isArray(series) || series.length === 0) return;
  const width = 720;
  const height = 150;
  const padding = 12;
  const minValue = -0.15;
  const maxValue = 0.35;
  const x = (index) => series.length === 1
    ? width / 2
    : padding + (index * (width - padding * 2)) / (series.length - 1);
  const y = (value) => padding +
    ((maxValue - Number(value)) * (height - padding * 2)) /
      (maxValue - minValue);
  const svgNamespace = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNamespace, "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  const definitions = [
    ["ndvi", "#20a45b"],
    ["ndmi", "#1875d1"],
    ["bsi", "#e98400"],
  ];
  for (const [key, color] of definitions) {
    const line = document.createElementNS(svgNamespace, "polyline");
    line.setAttribute(
      "points",
      series.map((item, index) => `${x(index)},${y(item[key])}`).join(" "),
    );
    line.setAttribute("fill", "none");
    line.setAttribute("stroke", color);
    line.setAttribute("stroke-width", "3");
    line.setAttribute("stroke-linecap", "round");
    line.setAttribute("stroke-linejoin", "round");
    svg.appendChild(line);
    series.forEach((item, index) => {
      const point = document.createElementNS(svgNamespace, "circle");
      point.setAttribute("cx", String(x(index)));
      point.setAttribute("cy", String(y(item[key])));
      point.setAttribute("r", "4");
      point.setAttribute("fill", color);
      const title = document.createElementNS(svgNamespace, "title");
      title.textContent = `${item.date || item.year}: ${key.toUpperCase()} ${formatDecimal(item[key], 3)}`;
      point.appendChild(title);
      svg.appendChild(point);
    });
  }
  elements.landTrendChart.appendChild(svg);
}

function formatDecimal(value, digits = 1) {
  const number = Number(value);
  return Number.isFinite(number)
    ? number.toLocaleString("ru-RU", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })
    : "—";
}

function selectSceneForProcessing(scene, filename, storageKey) {
  if (scene.collection !== "sentinel-1-grd") {
    showToast("Модуль ледовой карты принимает только Sentinel-1 GRD.", true);
    return;
  }
  if (!filename) {
    showToast("Сначала загрузите SAFE на сервер.", true);
    return;
  }
  state.selectedProcessingScene = scene;
  state.selectedProcessingFilename = filename;
  state.selectedProcessingStorageKey = "";
  resetDeleteSourceState();
  elements.selectedProduct.textContent =
    scene.name || scene.stac_item_id || filename;
  elements.selectedProduct.title = elements.selectedProduct.textContent;
  elements.selectedProductNote.textContent =
    `${formatPlatform(scene.platform)} · SAFE в локальном кэше сервера`;
  elements.processingState.textContent = "Сцена готова";
  elements.processingState.className = "request-state success";

  const available = scene.polarizations || [];
  elements.processingPolarization.value = "AUTO";
  elements.processingPolarization.title = available.length
    ? `Доступно: ${available.join(", ")}`
    : "Каналы будут определены по имени продукта";
  updateProcessButtonState();
  showProcessingPanel();
}

function showProcessingPanel({ scroll = true } = {}) {
  elements.processingPanel.hidden = false;
  if (!scroll) return;
  elements.processingPanel.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

function updateProcessButtonState() {
  const ready = Boolean(
    state.snapAvailable &&
      state.selectedProcessingScene &&
      state.selectedProcessingScene.collection === "sentinel-1-grd" &&
      state.selectedProcessingFilename,
  );
  elements.processButton.disabled = !ready;
  elements.processButton.querySelector("span").textContent = "Обработать";
}

function updateDeleteSourceButtonState() {
  const ready = Boolean(
    state.completedProcessingJobId &&
      state.completedProcessingSourceFilename &&
      state.objectStorageConfigured,
  );
  elements.deleteSourceButton.disabled = !ready;
  if (ready) {
    elements.deleteSourceButton.textContent = "Выгрузить SAFE и удалить";
  }
}

function resetDeleteSourceState() {
  state.completedProcessingJobId = "";
  state.completedProcessingSourceFilename = "";
  state.completedProcessingMode = "";
  elements.deleteSourceButton.disabled = true;
  elements.deleteSourceButton.textContent = "Выгрузить SAFE и удалить";
}

function clearProcessingSelection(note = "Сцена не выбрана") {
  state.selectedProcessingScene = null;
  state.selectedProcessingFilename = "";
  state.selectedProcessingStorageKey = "";
  elements.selectedProduct.textContent = "Сцена не выбрана";
  elements.selectedProduct.title = "";
  elements.selectedProductNote.textContent = note;
  elements.processingPolarization.value = "AUTO";
  updateProcessButtonState();
}

async function handleProcessing(event) {
  event.preventDefault();
  if (!state.snapAvailable) {
    showToast(
      "Установите ESA SNAP, добавьте SNAP_GPT_PATH в .env и перезапустите сервер.",
      true,
    );
    return;
  }
  if (!state.selectedProcessingScene) {
    showToast("Выберите Sentinel-1 сцену из таблицы.", true);
    return;
  }
  if (!state.selectedProcessingFilename) {
    showToast("Сначала загрузите SAFE на сервер.", true);
    return;
  }

  let geometry;
  try {
    geometry = geometryFromMap();
  } catch (error) {
    showToast(error.message, true);
    return;
  }

  const payload = {
    scene: state.selectedProcessingScene,
    geometry,
    polarization: elements.processingPolarization.value,
    threshold_db: Number(elements.processingThreshold.value),
    uncertainty_db: Number(elements.processingUncertainty.value),
    pixel_spacing_m: Number(elements.processingPixelSize.value),
    filename: state.selectedProcessingFilename,
  };

  resetDeleteSourceState();
  setProcessingLoading(true, "Обработка поставлена в очередь");

  try {
    const result = await fetchJSON(apiUrl("/api/process"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    rememberProcessingJob(result.job_id);
    await pollProcessing(result.job_id);
  } catch (error) {
    setProcessingFailed(error.message);
  }
}

async function pollProcessing(jobId) {
  const startedAt = Date.now();
  const maximumWait = 12 * 60 * 60 * 1000;

  while (Date.now() - startedAt < maximumWait) {
    await delay(2500);
    let job;
    try {
      job = await fetchJSON(
        apiUrl(`/api/process/status?id=${encodeURIComponent(jobId)}`),
      );
    } catch (error) {
      forgetProcessingJob();
      setProcessingFailed(error.message);
      return;
    }

    elements.processingState.textContent = job.message || "Обработка…";
    elements.processingState.className = "request-state loading";
    updateProcessingButtonProgress(job);

    if (job.status === "completed") {
      forgetProcessingJob();
      state.completedProcessingMode = job.processing_mode || "persistent";
      state.completedProcessingJobId = jobId;
      state.completedProcessingSourceFilename =
        job.source_filename || state.selectedProcessingFilename;
      renderProcessingResult(job.result);
      setProcessingLoading(false, "Готово");
      elements.processingState.className = "request-state success";
      elements.selectedProductNote.textContent =
        "Обработка завершена; исходный SAFE оставлен на сервере.";
      showToast("Ледовая карта построена. SAFE можно выгрузить отдельной кнопкой.");
      return;
    }

    if (job.status === "failed") {
      forgetProcessingJob();
      setProcessingFailed(job.message || "Ошибка обработки Sentinel-1.");
      return;
    }
  }

  forgetProcessingJob();
  setProcessingFailed("Превышено время ожидания результата обработки.");
}

function updateProcessingButtonProgress(job) {
  const buttonLabel = elements.processButton.querySelector("span");
  if (job.phase === "download" || job.phase === "storage-download") {
    const percent = Number(job.progress_percent);
    buttonLabel.textContent = Number.isFinite(percent)
      ? `Получение SAFE — ${Math.round(percent)}%`
      : "Получение SAFE…";
    return;
  }
  if (job.phase === "storage") {
    buttonLabel.textContent = "Сохранение в Object Storage…";
    return;
  }
  buttonLabel.textContent =
    job.phase === "classification"
      ? "Julia строит ледовую карту…"
      : "SNAP обрабатывает сцену…";
}

function rememberProcessingJob(jobId) {
  if (!jobId) return;
  try {
    localStorage.setItem(PROCESSING_JOB_STORAGE_KEY, jobId);
  } catch {
    // Работа приложения не должна зависеть от доступности localStorage.
  }
}

function forgetProcessingJob() {
  try {
    localStorage.removeItem(PROCESSING_JOB_STORAGE_KEY);
  } catch {
    // Работа приложения не должна зависеть от доступности localStorage.
  }
}

function resumeProcessingJob() {
  let jobId = "";
  try {
    jobId = localStorage.getItem(PROCESSING_JOB_STORAGE_KEY) || "";
  } catch {
    return;
  }
  if (!jobId) return;

  showProcessingPanel({ scroll: false });
  setProcessingLoading(true, "Восстановление статуса обработки…");
  pollProcessing(jobId);
}

function setProcessingLoading(isLoading, message) {
  elements.processButton.disabled = isLoading;
  elements.deleteSourceButton.disabled = isLoading;
  elements.clearMapResultsButton.disabled = isLoading;
  elements.processButton.querySelector("span").textContent = isLoading
    ? "Сервер выполняет задание…"
    : "Обработать сцену";
  elements.processingState.textContent = message;
  elements.processingState.className = isLoading
    ? "request-state loading"
    : "request-state success";

  for (const input of elements.processingForm.querySelectorAll(
    "input, select",
  )) {
    input.disabled = isLoading;
  }
  if (!isLoading) {
    updateProcessButtonState();
    updateDeleteSourceButtonState();
    updateResultMapControls();
  }
}

async function handleDeleteDownloadedProduct() {
  if (
    !state.completedProcessingJobId ||
    !state.completedProcessingSourceFilename
  ) {
    showToast(
      "Удаление доступно только после успешной обработки сцены.",
      true,
    );
    return;
  }

  const filename = state.completedProcessingSourceFilename;
  const confirmed = window.confirm(
    `Выгрузить ${filename} в Object Storage и удалить локальную копию? ` +
      "Файл будет удалён только после проверки полного размера архива.",
  );
  if (!confirmed) return;

  elements.deleteSourceButton.disabled = true;
  elements.deleteSourceButton.textContent = "Выгрузка…";

  try {
    const queued = await fetchJSON(apiUrl("/api/cache/archive"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename }),
    });
    let result = null;
    const startedAt = Date.now();
    while (Date.now() - startedAt < 6 * 60 * 60 * 1000) {
      await delay(1000);
      result = await fetchJSON(
        apiUrl(`/api/download/status?id=${encodeURIComponent(queued.job_id)}`),
      );
      if (result.status === "completed") break;
      if (result.status === "failed") throw new Error(result.message || "Ошибка выгрузки SAFE.");
    }
    if (!result || result.status !== "completed") {
      throw new Error("Превышено время ожидания выгрузки SAFE.");
    }

    markDownloadedProductDeleted(filename);
    updateSafeCacheStatus(result.cache);
    resetDeleteSourceState();
    clearProcessingSelection(
      "Исходный SAFE выгружен в Object Storage и удалён с сервера; результаты сохранены.",
    );
    elements.selectedProduct.textContent = "SAFE выгружен";
    elements.deleteSourceButton.textContent = "SAFE выгружен и удалён";
    elements.processingState.textContent = "Готово · SAFE выгружен";
    elements.processingState.className = "request-state success";
    showToast(`SAFE ${filename} выгружен и удалён с сервера.`);
  } catch (error) {
    elements.deleteSourceButton.disabled = false;
    elements.deleteSourceButton.textContent = "Повторить выгрузку";
    showToast(error.message, true);
  }
}

function markDownloadedProductDeleted(filename) {
  for (const processButton of elements.sceneRows.querySelectorAll(
    ".process-scene-button",
  )) {
    if (processButton.dataset.filename !== filename) continue;

    processButton.disabled = true;
    delete processButton.dataset.filename;
    const actionGroup = processButton.closest(".scene-actions");
    const downloadButton = actionGroup?.querySelector(".download-button");
    if (downloadButton) {
      downloadButton.disabled = false;
      downloadButton.className = "button download-button";
      downloadButton.textContent = "Сохранить снова";
    }
    processButton.disabled = !state.snapAvailable || !state.credentialsConfigured;
    processButton.hidden = true;
    processButton.textContent = "Обработать";
  }
}

function setProcessingFailed(message) {
  setProcessingLoading(false, "Ошибка обработки");
  elements.processingState.className = "request-state error";
  if (message.includes("не пересекает текущий регион")) {
    clearProcessingSelection(
      "Эта сцена не покрывает регион. Выберите другую.",
    );
  }
  showToast(message, true);
}

function renderProcessingResult(result) {
  const metrics = result.metrics || {};
  elements.processingEmpty.hidden = true;
  elements.processingMetrics.hidden = false;

  elements.iceArea.textContent = formatArea(metrics.ice_area_km2);
  elements.waterArea.textContent = formatArea(metrics.water_area_km2);
  elements.uncertainArea.textContent = formatArea(
    metrics.uncertain_area_km2,
  );
  elements.iceConcentration.textContent = formatPercent(
    metrics.ice_concentration_percent,
  );
  elements.regionCoverage.textContent = formatPercent(
    metrics.scene_coverage_percent,
  );
  elements.summaryConcentration.textContent =
    `${formatPercent(metrics.ice_concentration_percent)}%`;
  const coverage = formatPercent(metrics.scene_coverage_percent);
  elements.summaryConcentrationNote.textContent = coverage === "—"
    ? `${result.polarization} · порог ${result.threshold_db} dB`
    : `${result.polarization} · покрытие региона ${coverage}%`;
  elements.resultWarning.textContent = result.warning || "";

  const downloads = result.downloads || {};
  setDownloadLink(elements.downloadAreaMask, downloads.area_mask);
  setDownloadLink(elements.downloadMapMask, downloads.map_mask);
  setDownloadLink(elements.downloadReport, downloads.report);
  setDownloadLink(elements.downloadMetadata, downloads.metadata);
  setDownloadLink(elements.downloadSnapLog, downloads.snap_log);

  if (result.image_url && Array.isArray(result.bounds)) {
    addResultOverlay(
      {
        image_url: result.image_url,
        bounds: result.bounds,
      },
      { fit: true, persist: true },
    );
  }
}

function setDownloadLink(element, href) {
  element.href = href ? backendUrl(href) : "#";
  element.toggleAttribute("aria-disabled", !href);
}

function addResultOverlay(record, { fit = false, persist = false } = {}) {
  const imageUrl = String(record?.image_url || "");
  const bounds = record?.bounds;
  if (!imageUrl || !Array.isArray(bounds)) return;

  const existing = state.resultLayers.find(
    (item) => item.imageUrl === imageUrl,
  );
  if (existing) {
    existing.layer.bringToFront();
    fit && state.map.fitBounds(bounds, { padding: [32, 32] });
    return;
  }
  if (state.pendingResultOverlays.has(imageUrl)) return;

  const separator = imageUrl.includes("?") ? "&" : "?";
  const resolvedUrl = `${backendUrl(imageUrl)}${separator}v=${Date.now()}`;
  state.pendingResultOverlays.add(imageUrl);
  const probe = new Image();
  probe.onload = () => {
    state.pendingResultOverlays.delete(imageUrl);
    const layer = L.imageOverlay(resolvedUrl, bounds, {
      opacity: Number(elements.overlayOpacity.value),
      interactive: false,
      zIndex: 450 + state.resultLayers.length,
    }).addTo(state.map);
    state.resultLayers.push({ imageUrl, bounds, layer });
    if (persist && !state.resultOverlayRecords.some((item) => item.image_url === imageUrl)) {
      state.resultOverlayRecords.push({ image_url: imageUrl, bounds });
      persistResultOverlays();
    }
    updateResultMapControls();
    fit && state.map.fitBounds(bounds, { padding: [32, 32] });
  };
  probe.onerror = () => {
    state.pendingResultOverlays.delete(imageUrl);
    state.resultOverlayRecords = state.resultOverlayRecords.filter(
      (item) => item.image_url !== imageUrl,
    );
    persistResultOverlays();
    updateResultMapControls();
    if (persist) showToast("Растровый слой результата недоступен и не был добавлен на карту.", true);
  };
  probe.src = resolvedUrl;
}

function updateOverlayOpacity() {
  const opacity = Number(elements.overlayOpacity.value);
  for (const item of state.resultLayers) {
    item.layer.setOpacity(opacity);
  }
}

function updateResultMapControls() {
  const hasResults = state.resultLayers.length > 0;
  elements.mapOpacityControl.hidden = !hasResults;
  elements.clearMapResultsButton.hidden = !hasResults;
  if (hasResults) {
    elements.clearMapResultsButton.disabled = false;
  }
}

function persistResultOverlays() {
  try {
    localStorage.setItem(
      RESULT_OVERLAYS_STORAGE_KEY,
      JSON.stringify(state.resultOverlayRecords),
    );
  } catch {
    // Слои продолжают работать до перезагрузки, если storage недоступен.
  }
}

function restoreResultOverlays() {
  let records = [];
  try {
    records = JSON.parse(
      localStorage.getItem(RESULT_OVERLAYS_STORAGE_KEY) || "[]",
    );
  } catch {
    records = [];
  }
  if (!Array.isArray(records)) return;

  state.resultOverlayRecords = [];
  for (const record of records) {
    if (!record?.image_url || !Array.isArray(record.bounds)) continue;
    state.resultOverlayRecords.push({
      image_url: String(record.image_url),
      bounds: record.bounds,
    });
    addResultOverlay(record);
  }
  if (state.resultOverlayRecords.length !== records.length) {
    persistResultOverlays();
  }
}

function clearProcessedMap() {
  for (const item of state.resultLayers) {
    state.map.removeLayer(item.layer);
  }
  state.resultLayers = [];
  state.resultOverlayRecords = [];
  try {
    localStorage.removeItem(RESULT_OVERLAYS_STORAGE_KEY);
  } catch {
    // Очистка текущей карты не зависит от доступности localStorage.
  }

  updateResultMapControls();
  clearProcessingSelection(
    "Обработанные снимки удалены с карты. Выберите сцену заново.",
  );
  resetDeleteSourceState();
  elements.processingEmpty.hidden = false;
  elements.processingMetrics.hidden = true;
  elements.processingState.textContent = "Ожидание сцены";
  elements.processingState.className = "request-state";
  elements.summaryConcentration.textContent = "—";
  elements.summaryConcentrationNote.textContent =
    "Обработайте Sentinel-1 GRD";
  elements.processingPanel.hidden = true;
  showToast("Обработанные снимки удалены с карты.");
}

function formatArea(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: number < 10 ? 2 : 1,
  }).format(number);
}

function formatBytes(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";

  const units = ["Б", "КБ", "МБ", "ГБ", "ТБ"];
  const unitIndex = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const amount = bytes / 1024 ** unitIndex;
  return `${new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: amount < 10 ? 2 : 1,
  }).format(amount)} ${units[unitIndex]}`;
}

function formatPercent(value) {
  if (value === null || value === undefined || value === "") return "—";
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(number);
}

function setDownloadFailed(button, message) {
  button.disabled = false;
  button.className = "button download-button failed";
  button.textContent = "Повторить";
  showToast(message, true);
}

function translateOrbit(value) {
  const normalised = String(value).toLowerCase();
  if (normalised === "ascending") return "восходящая";
  if (normalised === "descending") return "нисходящая";
  return value;
}

function formatPlatform(value) {
  if (!value) return "Не указан";
  const normalised = String(value).trim().toLowerCase().replaceAll("_", "-");
  const knownPlatforms = {
    "sentinel-1a": "Sentinel‑1A",
    "sentinel-1b": "Sentinel‑1B",
    "sentinel-1c": "Sentinel‑1C",
    "sentinel-2a": "Sentinel‑2A",
    "sentinel-2b": "Sentinel‑2B",
    "sentinel-2c": "Sentinel‑2C",
  };
  return knownPlatforms[normalised] || String(value);
}

function formatCollection(value) {
  const labels = {
    "sentinel-1-grd": "Sentinel‑1 GRD",
    "sentinel-2-l2a": "Sentinel‑2 L2A",
  };
  return labels[value] || value || "Каталог STAC";
}

function formatDateTime(value) {
  if (!value) return "Дата не указана";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(date);
}

function formatCompactDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

async function fetchJSON(url, options = undefined) {
  const response = await fetch(url, options);
  const contentType = response.headers.get("content-type") || "";
  let data;
  if (contentType.includes("application/json")) {
    data = await response.json();
  } else {
    const responseText = (await response.text()).trim();
    const isHTML =
      contentType.includes("text/html") ||
      /^<!doctype\s+html|^<html/i.test(responseText);
    data = {
      error: isHTML ? "" : responseText.slice(0, 300),
    };
  }

  if (!response.ok) {
    throw new Error(data.error || `Ошибка HTTP ${response.status}`);
  }
  return data;
}

function apiUrl(path) {
  return `${API_BASE_URL}${path}`;
}

function backendUrl(url) {
  if (!url || /^(?:https?:)?\/\//.test(url)) return url;
  return apiUrl(url.startsWith("/") ? url : `/${url}`);
}

function delay(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function showToast(message, isError = false) {
  window.clearTimeout(state.toastTimer);
  elements.toast.textContent = message;
  elements.toast.className = isError ? "toast visible error" : "toast visible";
  state.toastTimer = window.setTimeout(() => {
    elements.toast.className = "toast";
  }, 6000);
}
