"use strict";

const PROCESSING_JOB_STORAGE_KEY = "iceSeaMonitor.processingJobId";
const THEME_STORAGE_KEY = "iceSeaMonitor.theme";
const API_BASE_URL = (
  document.querySelector('meta[name="ice-api-base"]')?.content || ""
).replace(/\/$/, "");
const IS_STATIC_DEMO =
  !API_BASE_URL && window.location.hostname.endsWith(".github.io");

const state = {
  map: null,
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
  resultLayer: null,
  toastTimer: null,
  searchGeneration: 0,
};

const elements = {};

document.addEventListener("DOMContentLoaded", initialise);

async function initialise() {
  cacheElements();
  initialiseTheme();
  initialiseDates();
  initialiseMap();
  bindEvents();
  updateSourceControls();

  await Promise.all([loadDefaultRegion(), loadServerConfig()]);
  resumeProcessingJob();
}

function cacheElements() {
  const ids = [
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
    "regionStatus",
    "regionReady",
    "defaultRegion",
    "loadGeoJSON",
    "saveGeoJSON",
    "geoJSONFile",
    "searchButton",
    "mapOpacityControl",
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
    "overlayOpacity",
    "resultWarning",
    "downloadAreaMask",
    "downloadMapMask",
    "downloadReport",
    "downloadMetadata",
    "downloadSnapLog",
    "toast",
  ];

  for (const id of ids) {
    elements[id] = document.getElementById(id);
  }
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
  elements.dateFrom.value = "2026-06-27";
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
  state.map = L.map("map", {
    center: [75.2, 34],
    zoom: 4,
    minZoom: 2,
    zoomControl: true,
  });

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap",
    maxZoom: 19,
  }).addTo(state.map);

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

function bindEvents() {
  elements.collection.addEventListener("change", updateSourceControls);
  elements.searchForm.addEventListener("submit", handleSearch);
  elements.defaultRegion.addEventListener("click", loadDefaultRegion);
  elements.loadGeoJSON.addEventListener("click", () =>
    elements.geoJSONFile.click(),
  );
  elements.geoJSONFile.addEventListener("change", handleGeoJSONFile);
  elements.saveGeoJSON.addEventListener("click", saveRegion);
  elements.processingForm.addEventListener("submit", handleProcessing);
  elements.deleteSourceButton.addEventListener(
    "click",
    handleDeleteDownloadedProduct,
  );
  elements.overlayOpacity.addEventListener("input", updateOverlayOpacity);
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
    elements.credentialStatus.textContent = state.credentialsConfigured
      ? "CDSE: загрузка настроена"
      : "CDSE: добавьте данные в .env";
    elements.snapStatus.textContent = state.snapAvailable
      ? "SNAP: готов"
      : "SNAP: задайте путь в .env";
    elements.storageStatus.textContent = state.objectStorageConfigured
      ? `Storage: ${config.object_storage_bucket}`
      : "Storage: добавьте ключи в .env";
    updateProcessButtonState();
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
    let response = IS_STATIC_DEMO
      ? await fetch("assets/barents_sea.geojson")
      : await fetch(apiUrl("/api/region/default"));
    if (!response.ok) {
      response = await fetch("assets/barents_sea.geojson");
    }
    if (!response.ok) {
      throw new Error("Не удалось загрузить регион по умолчанию.");
    }
    const geojson = await response.json();
    setRegionGeoJSON(geojson);
    elements.regionStatus.textContent = "Баренцево море · EPSG:4326";
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
    throw new Error("Нарисуйте регион мониторинга на карте.");
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
  const count = state.drawnItems.getLayers().length;
  elements.regionReady.textContent =
    count === 0
      ? "Полигон не задан"
      : count === 1
        ? "Полигон задан"
        : `Полигонов: ${count}`;
  elements.regionReady.classList.toggle("missing", count === 0);
  if (state.selectedProcessingScene) {
    clearProcessingSelection(
      "Регион изменён. Выберите подходящую сцену заново.",
    );
  }
}

function updateSourceControls() {
  const isSentinel2 = elements.collection.value === "sentinel-2-l2a";
  elements.cloudCover.disabled = !isSentinel2;
  elements.cloudField.style.opacity = isSentinel2 ? "1" : "0.56";
  elements.sourceHint.textContent = isSentinel2
    ? "Оптическое уточнение при достаточном освещении и малой облачности."
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

  setSearchLoading(true);
  setSearchResultsVisibility(false);
  clearSceneOutlines();
  clearProcessingSelection(
    "Выберите сцену из нового результата поиска.",
  );

  try {
    const result = await fetchJSON(apiUrl("/api/search"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    state.scenes = result.scenes || [];
    renderScenes();
    elements.requestState.textContent = `Получено: ${state.scenes.length}`;
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

function setSearchLoading(isLoading) {
  elements.searchButton.disabled = isLoading;
  elements.searchButton.querySelector("span").textContent = isLoading
    ? "Поиск в каталоге…"
    : "Найти снимки";

  if (isLoading) {
    elements.requestState.textContent = "Запрос выполняется";
    elements.requestState.className = "request-state loading";
  }
}

function setSearchResultsVisibility(visible) {
  elements.summaryGrid.hidden = !visible;
  elements.resultsPanel.hidden = !visible;
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

  state.scenes.forEach((scene, index) => {
    const row = document.createElement("tr");
    row.dataset.sceneIndex = String(index);
    row.addEventListener("click", () => showScene(scene, index, false));

    row.appendChild(scenePreviewCell(scene.geometry, regionGeometry));

    row.appendChild(
      cellWithNote(
        formatDateTime(scene.datetime),
        scene.orbit_direction
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
    collection.textContent =
      scene.download_product_type === "original-safe"
        ? `${scene.collection} · SAFE обрабатывается временно на сервере`
        : scene.collection || "STAC";
    productCell.appendChild(collection);
    row.appendChild(productCell);

    row.appendChild(
      cellWithNote(
        formatPlatform(scene.platform),
        scene.polarizations?.length
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
    if (scene.collection === "sentinel-1-grd") {
      processButton = document.createElement("button");
      processButton.type = "button";
      processButton.className = "button process-scene-button";
      processButton.textContent = "Обработать";
      processButton.disabled = true;
      processButton.hidden = true;
    }

    downloadButton.addEventListener("click", (buttonEvent) => {
      buttonEvent.stopPropagation();
      startDownload(
        scene,
        downloadButton,
        processButton,
        downloadMeta,
      );
    });
    processButton?.addEventListener("click", (buttonEvent) => {
      buttonEvent.stopPropagation();
      showScene(scene, index, false);
      selectSceneForProcessing(
        scene,
        processButton.dataset.filename || "",
        processButton.dataset.storageKey || "",
      );
    });

    actionGroup.append(downloadButton);
    processButton && actionGroup.append(processButton);
    downloadPanel.append(downloadMeta, actionGroup);
    actionCell.appendChild(downloadPanel);
    row.appendChild(actionCell);

    elements.sceneRows.appendChild(row);
    sizeTasks.push({ scene, downloadMeta });
  });

  renderSceneOutlines();
  void loadDownloadSizes(sizeTasks, searchGeneration);
  setSearchResultsVisibility(reveal);
}

function scenePreviewCell(sceneGeometry, regionGeometry) {
  const cell = document.createElement("td");
  cell.className = "scene-preview-cell";

  const preview = document.createElement("div");
  preview.className = "scene-preview";
  preview.title = sceneGeometry
    ? "Контур покрытия сцены. Красным показан регион мониторинга."
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
    "Граница сцены; красным показан регион мониторинга";
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
        task.downloadMeta.textContent =
          Number(info.size_bytes) > 0
            ? `Размер: ${formatBytes(info.size_bytes)}`
            : "Размер: нет данных";
        task.downloadMeta.title = info.filename || "";
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
  downloadMeta,
) {
  if (!state.credentialsConfigured) {
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
      button.className = "button download-button completed";
      button.textContent = "Скачано";
      button.title = job.storage_key || job.filename || "";
      button.disabled = true;
      if (
        scene.collection === "sentinel-1-grd" &&
        job.storage_uploaded &&
        processButton
      ) {
        processButton.hidden = false;
        processButton.disabled =
          !state.snapAvailable || !state.objectStorageConfigured;
        processButton.dataset.filename = job.filename || "";
        processButton.dataset.storageKey = job.storage_key || "";
        processButton.textContent = "Обработать";
      }
      showToast(job.storage_uploaded
        ? `SAFE сохранён в ${job.storage_bucket}/${job.storage_key}. ` +
          "Временная копия с ноутбука удалена."
        : `SAFE сохранён локально в data/raw: ${job.filename}`);
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
      : totalBytes > 0
        ? "Загрузка…"
        : "Загрузка…";
}

function selectSceneForProcessing(scene, filename, storageKey) {
  if (scene.collection !== "sentinel-1-grd") {
    showToast("Модуль ледовой карты принимает только Sentinel-1 GRD.", true);
    return;
  }
  if (!storageKey) {
    showToast("Сначала скачайте SAFE в Object Storage.", true);
    return;
  }
  state.selectedProcessingScene = scene;
  state.selectedProcessingFilename = filename;
  state.selectedProcessingStorageKey = storageKey;
  resetDeleteSourceState();
  elements.selectedProduct.textContent =
    scene.name || scene.stac_item_id || filename;
  elements.selectedProduct.title = elements.selectedProduct.textContent;
  elements.selectedProductNote.textContent =
    `${formatPlatform(scene.platform)} · SAFE в Storage: ${storageKey}`;
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
      state.objectStorageConfigured &&
      state.selectedProcessingScene &&
      state.selectedProcessingScene.collection === "sentinel-1-grd" &&
      state.selectedProcessingStorageKey,
  );
  elements.processButton.disabled = !ready;
  elements.processButton.querySelector("span").textContent = "Обработать";
}

function updateDeleteSourceButtonState() {
  if (
    state.completedProcessingMode === "ephemeral" ||
    state.completedProcessingMode === "storage"
  ) {
    elements.deleteSourceButton.disabled = true;
    elements.deleteSourceButton.textContent =
      state.completedProcessingMode === "storage"
        ? "SAFE хранится в Storage"
        : "SAFE удалён автоматически";
    return;
  }

  const ready = Boolean(
    state.completedProcessingJobId &&
      state.completedProcessingSourceFilename,
  );
  elements.deleteSourceButton.disabled = !ready;
  if (ready) {
    elements.deleteSourceButton.textContent = "Удалить загруженный SAFE";
  }
}

function resetDeleteSourceState() {
  state.completedProcessingJobId = "";
  state.completedProcessingSourceFilename = "";
  state.completedProcessingMode = "";
  elements.deleteSourceButton.disabled = true;
  elements.deleteSourceButton.textContent =
    state.selectedProcessingStorageKey
      ? "SAFE хранится в Storage"
      : "Удалить загруженный SAFE";
}

function clearProcessingSelection(note = "Сцена не выбрана") {
  state.selectedProcessingScene = null;
  state.selectedProcessingFilename = "";
  state.selectedProcessingStorageKey = "";
  elements.selectedProduct.textContent = "Сцена не выбрана";
  elements.selectedProduct.title = "";
  elements.selectedProductNote.textContent = note;
  elements.processingPolarization.value = "AUTO";
  clearResultOverlay();
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
  if (!state.selectedProcessingStorageKey) {
    showToast("Сначала скачайте SAFE в Object Storage.", true);
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
    storage_key: state.selectedProcessingStorageKey,
  };

  resetDeleteSourceState();
  setProcessingLoading(true, "Обработка поставлена в очередь");
  clearResultOverlay();

  try {
    const result = await fetchJSON(apiUrl("/api/process/storage"), {
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
      state.completedProcessingJobId =
        state.completedProcessingMode === "persistent" ? jobId : "";
      state.completedProcessingSourceFilename =
        job.source_filename || state.selectedProcessingFilename;
      renderProcessingResult(job.result);
      setProcessingLoading(false, "Готово");
      elements.processingState.className = "request-state success";
      if (state.completedProcessingMode === "storage") {
        elements.selectedProductNote.textContent =
          "Обработка завершена; исходный SAFE сохранён в Object Storage.";
        showToast(job.result?.storage?.uploaded
          ? "Ледовая карта и исходный SAFE сохранены в Object Storage."
          : "Ледовая карта построена. Исходный SAFE сохранён в Object Storage.");
      } else if (state.completedProcessingMode === "ephemeral") {
        elements.selectedProductNote.textContent =
          "Обработка завершена; временный исходный SAFE удалён с сервера.";
        const storage = job.result?.storage;
        showToast(storage?.uploaded
          ? "Ледовая карта сохранена в Object Storage. Временный SAFE удалён."
          : "Ледовая карта построена. Временный SAFE удалён автоматически.");
      } else {
        showToast(job.result?.storage?.uploaded
          ? "Ледовая карта сохранена в Object Storage."
          : "Ледовая карта построена и добавлена на карту.");
      }
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
    `Удалить исходный файл ${filename} из data/raw? ` +
      "Ледовая карта и файлы результатов будут сохранены.",
  );
  if (!confirmed) return;

  elements.deleteSourceButton.disabled = true;
  elements.deleteSourceButton.textContent = "Удаление…";

  try {
    const result = await fetchJSON(apiUrl("/api/download/delete"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        job_id: state.completedProcessingJobId,
      }),
    });

    markDownloadedProductDeleted(result.filename || filename);
    resetDeleteSourceState();
    clearProcessingSelection(
      `Исходный SAFE удалён. Освобождено ${formatBytes(result.freed_bytes)}; ` +
        "результаты обработки сохранены.",
    );
    elements.selectedProduct.textContent = "Исходный SAFE удалён";
    elements.deleteSourceButton.textContent = "Файл удалён";
    elements.processingState.textContent = "Готово · исходный SAFE удалён";
    elements.processingState.className = "request-state success";
    showToast(
      `Удалён ${result.filename}; освобождено ${formatBytes(result.freed_bytes)}.`,
    );
  } catch (error) {
    elements.deleteSourceButton.disabled = false;
    elements.deleteSourceButton.textContent = "Повторить удаление";
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
    const imageUrl = `${backendUrl(result.image_url)}&v=${Date.now()}`;
    state.resultLayer = L.imageOverlay(imageUrl, result.bounds, {
      opacity: Number(elements.overlayOpacity.value),
      interactive: false,
      zIndex: 450,
    }).addTo(state.map);
    elements.mapOpacityControl.hidden = false;
    state.map.fitBounds(result.bounds, { padding: [32, 32] });
  }
}

function setDownloadLink(element, href) {
  element.href = href ? backendUrl(href) : "#";
  element.toggleAttribute("aria-disabled", !href);
}

function clearResultOverlay() {
  if (state.resultLayer) {
    state.map.removeLayer(state.resultLayer);
    state.resultLayer = null;
  }
  elements.mapOpacityControl.hidden = true;
}

function updateOverlayOpacity() {
  if (state.resultLayer) {
    state.resultLayer.setOpacity(Number(elements.overlayOpacity.value));
  }
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

async function handleGeoJSONFile(event) {
  const [file] = event.target.files;
  if (!file) {
    return;
  }

  try {
    const geojson = JSON.parse(await file.text());
    setRegionGeoJSON(geojson);
    elements.regionStatus.textContent = `${file.name} · EPSG:4326`;
    showToast("Регион загружен.");
  } catch (error) {
    showToast(`Не удалось прочитать GeoJSON: ${error.message}`, true);
  } finally {
    event.target.value = "";
  }
}

function saveRegion() {
  try {
    const geometry = geometryFromMap();
    const feature = {
      type: "Feature",
      properties: {
        name: "Регион мониторинга",
        crs: "EPSG:4326",
      },
      geometry,
    };
    const blob = new Blob([JSON.stringify(feature, null, 2)], {
      type: "application/geo+json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "monitoring_region.geojson";
    link.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    showToast(error.message, true);
  }
}

function translateOrbit(value) {
  const normalised = String(value).toLowerCase();
  if (normalised === "ascending") return "восходящая";
  if (normalised === "descending") return "нисходящая";
  return value;
}

function formatPlatform(value) {
  if (!value) return "Не указан";
  return String(value)
    .replace("sentinel-", "Sentinel-")
    .replace("sentinel_", "Sentinel-");
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
