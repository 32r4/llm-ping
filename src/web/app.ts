import { sendInvokeRequest, sendModelsRequest, sendProbeRequest } from "./api-client";

const storageKeys = {
  theme: "llm-ping:theme",
  form: "llm-ping:form",
  history: "llm-ping:history"
};

const apiModeOptions = [
  { value: "responses", label: "Responses API" },
  { value: "chat_completions", label: "Chat Completions API" }
];

const state = {
  models: [],
  selectedModel: "",
  activeModelId: "",
  activeApiMode: "",
  lastModelsResult: null,
  lastInvokeResult: null,
  lastInvokeEndpointPath: null,
  probeRows: [],
  probeRunning: false,
  probeCompleted: 0,
  probeTotal: 0
};

const query = (selector) => document.querySelector(selector);
const maybeQuery = (selector) => {
  try {
    return document.querySelector(selector);
  } catch {
    return null;
  }
};

const connectForm = query("#connect-form");
const invokeForm = query("#invoke-form");
const apiKeyInput = query("#apiKey");
const baseUrlInput = query("#baseUrl");
const apiModePicker = query("#api-mode-picker");
const apiModeInput = query("#api-mode-display");
const apiModeValue = query("#api-mode");
const apiModePanel = query("#api-mode-panel");
const apiModeList = query("#api-mode-list");
const probeDirectoryTrigger = query("#probe-directory-trigger");
const modelCombobox = query("#model-combobox");
const modelInput = query("#model");
const modelPanel = query("#model-panel");
const modelList = query("#model-list");
const promptInput = query("#prompt");
const historyList = query("#history-list");
const clearHistoryBtn = query("#clear-history-btn");
const themeToggle = query("#theme-toggle");
const themeIcon = query("[data-theme-icon]");
const historyTrigger = query("#history-trigger");
const historyCount = query("#history-count");
const historyModal = query("#history-modal");
const historyModalBackdrop = query("#history-modal-backdrop");
const historyModalClose = query("#history-modal-close");
const probeModal = query("#probe-modal");
const probeModalBackdrop = query("#probe-modal-backdrop");
const probeModalClose = query("#probe-modal-close");
const probeModalTitle = query("#probe-modal-title");
const probeProgress = query("#probe-progress");
const probeSelectAllBtn = query("#probe-select-all-btn");
const probeDeselectAllBtn = query("#probe-deselect-all-btn");
const probeSelectedBtn = query("#probe-selected-btn");
const probeTableBody = query("#probe-table-body");
const httpWarningModal = query("#http-warning-modal");
const httpWarningBackdrop = query("#http-warning-backdrop");
const httpWarningCancel = query("#http-warning-cancel");
const httpWarningConfirm = query("#http-warning-confirm");
const loadModelsBtn = query("#load-models-btn");
const invokeBtn = query("#invoke-btn");
const rawModelsTrigger = query("#raw-models-trigger");
const rawInvokeTrigger = query("#raw-invoke-trigger");
const rawModelsState = query("#raw-models-state");
const rawInvokeState = query("#raw-invoke-state");
const rawModelsTtfb = query("#raw-models-ttfb");
const rawModelsTotal = query("#raw-models-total");
const rawInvokeTtfb = query("#raw-invoke-ttfb");
const rawInvokeTotal = query("#raw-invoke-total");
const rawModal = query("#raw-modal");
const rawModalBackdrop = query("#raw-modal-backdrop");
const rawModalClose = query("#raw-modal-close");
const rawModalTitle = query("#raw-modal-title");
const rawModalJson = query("#raw-modal-json");
const toast = query("#toast");
const toastTitle = query("#toast-title");
const toastMessage = query("#toast-message");
const toastClose = query("#toast-close");
const appMain = maybeQuery("main");

const rawSignalMap = {
  models: {
    button: rawModelsTrigger,
    label: rawModelsState,
    ttfb: rawModelsTtfb,
    total: rawModelsTotal
  },
  invoke: {
    button: rawInvokeTrigger,
    label: rawInvokeState,
    ttfb: rawInvokeTtfb,
    total: rawInvokeTotal
  }
};

const getInvokeEndpointPath = (apiMode) =>
  apiMode === "responses" ? "/v1/responses" : "/v1/chat/completions";

const getApiModeSummaryLabel = (apiMode) => (apiMode === "responses" ? "Responses" : "Chat");

const getRawResponseTitle = (scope) =>
  scope === "models" ? "/v1/models" : state.lastInvokeEndpointPath || getInvokeEndpointPath(apiModeValue.value);

const modelPicker = {
  container: modelCombobox,
  input: modelInput,
  panel: modelPanel
};

const apiPicker = {
  container: apiModePicker,
  input: apiModeInput,
  panel: apiModePanel
};

const modalConfigs = {
  raw: {
    root: rawModal,
    dialog: rawModal,
    initialFocus: rawModalClose,
    fallbackFocus: rawModelsTrigger,
    returnFocus: null
  },
  history: {
    root: historyModal,
    dialog: historyModal,
    initialFocus: historyModalClose,
    fallbackFocus: historyTrigger,
    returnFocus: null
  },
  probe: {
    root: probeModal,
    dialog: probeModal,
    initialFocus: probeModalClose,
    fallbackFocus: probeDirectoryTrigger,
    returnFocus: null
  },
  httpWarning: {
    root: httpWarningModal,
    dialog: httpWarningModal,
    initialFocus: httpWarningCancel,
    fallbackFocus: loadModelsBtn,
    returnFocus: null
  }
};

let activeModal = null;
let acknowledgedInsecureBaseUrl = "";

const isFocusable = (element) => {
  if (!element || element.disabled) {
    return false;
  }

  const tagName = (element.tagName || "").toLowerCase();
  const type = (element.type || "").toLowerCase();
  const tabindex = element.getAttribute?.("tabindex");

  return (
    (tagName === "a" && element.getAttribute?.("href")) ||
    tagName === "button" ||
    (tagName === "input" && type !== "hidden") ||
    tagName === "select" ||
    tagName === "textarea" ||
    (tabindex != null && tabindex !== "-1")
  );
};

const walkFocusableElements = (element, items) => {
  if (isFocusable(element)) {
    items.push(element);
  }

  for (const child of element.children || []) {
    walkFocusableElements(child, items);
  }
};

const getFocusableElements = (container) => {
  const items = [];
  walkFocusableElements(container, items);
  return items;
};

const setBackgroundInert = (isInert) => {
  if (appMain) {
    appMain.inert = isInert;
  }

  toast.inert = isInert;
};

const focusModal = (config) => {
  const focusTarget =
    [config.initialFocus, ...getFocusableElements(config.dialog), config.dialog].find(
      (item) => item && !item.disabled
    ) || config.dialog;

  focusTarget.focus?.();
};

const openModal = (config, returnFocus) => {
  if (activeModal && activeModal !== config) {
    closeModal(activeModal, false);
  }

  config.returnFocus = returnFocus && returnFocus.isConnected !== false ? returnFocus : config.fallbackFocus;
  config.root.classList.remove("hidden");
  config.root.setAttribute("aria-hidden", "false");
  setBackgroundInert(true);
  activeModal = config;
  queueMicrotask(() => {
    focusModal(config);
  });
};

const closeModal = (config, restoreFocus = true) => {
  config.root.classList.add("hidden");
  config.root.setAttribute("aria-hidden", "true");

  if (activeModal !== config) {
    return;
  }

  activeModal = null;
  setBackgroundInert(false);

  const focusTarget =
    config.returnFocus && config.returnFocus.isConnected ? config.returnFocus : config.fallbackFocus;
  config.returnFocus = null;

  if (restoreFocus && focusTarget) {
    focusTarget.focus?.();
  }
};

const trapModalFocus = (event) => {
  if (event.key !== "Tab" || !activeModal) {
    return;
  }

  const focusable = getFocusableElements(activeModal.dialog);
  if (!focusable.length) {
    event.preventDefault();
    activeModal.dialog.focus?.();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!activeModal.dialog.contains(document.activeElement)) {
    event.preventDefault();
    first.focus?.();
    return;
  }

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus?.();
    return;
  }

  if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus?.();
  }
};

const setSignalState = (scope, stateName, summary) => {
  const mapping = rawSignalMap[scope];
  mapping.button.classList.remove("is-idle", "is-pending", "is-error", "is-ok");
  mapping.button.classList.add("is-" + stateName);
  mapping.label.textContent = summary;
};

const setSignalMetrics = (scope, timing) => {
  const mapping = rawSignalMap[scope];
  const hasTiming = timing?.ttfbMs != null || timing?.totalMs != null;
  mapping.ttfb.parentElement?.classList.toggle("is-hidden", !hasTiming);
  const ttfb = timing?.ttfbMs == null ? "--" : timing.ttfbMs + "ms";
  const total = timing?.totalMs == null ? "--" : timing.totalMs + "ms";
  mapping.ttfb.textContent = "ttfbms " + ttfb;
  mapping.total.textContent = "totalms " + total;
};

const ensureCompletedTiming = (payload, startedAt) => {
  if (!payload || payload.ok || !startedAt) {
    return payload;
  }

  const hasTiming = payload.timing?.ttfbMs != null || payload.timing?.totalMs != null;
  if (hasTiming) {
    return payload;
  }

  return {
    ...payload,
    timing: {
      ...(payload.timing ?? {}),
      ttfbMs: null,
      totalMs: Date.now() - startedAt
    }
  };
};

const getStored = (key, fallback) => {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
};

const setStored = (key, value) => {
  localStorage.setItem(key, JSON.stringify(value));
};

const escapeHtml = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const inferApiMode = (baseUrl) => {
  try {
    const url = new URL(baseUrl);
    return url.hostname === "api.openai.com" ? "responses" : "chat_completions";
  } catch {
    return "chat_completions";
  }
};

const getBaseUrlProtocol = (baseUrl) => {
  try {
    return new URL(baseUrl).protocol;
  } catch {
    return null;
  }
};

const shouldWarnForInsecureBaseUrl = (baseUrl) => getBaseUrlProtocol(baseUrl) === "http:";

const getStoredForm = () => getStored(storageKeys.form, {});

const saveForm = () => {
  setStored(storageKeys.form, {
    baseUrl: baseUrlInput.value.trim(),
    apiMode: apiModeValue.value
  });
};

const buildUpstreamView = (payload, scope) => {
  const title = getRawResponseTitle(scope);

  if (!payload) {
    return {
      title,
      content: "No successful response yet."
    };
  }

  if (payload.ok && payload.upstream) {
    return {
      title,
      content: JSON.stringify(
        {
          status: payload.upstream.status ?? null,
          bodyJson: payload.upstream.bodyJson ?? null,
          bodyText: payload.upstream.bodyText ?? ""
        },
        null,
        2
      )
    };
  }

  return {
    title,
    content: JSON.stringify(
      {
        ok: false,
        error: payload.error ?? { message: "No successful response yet." }
      },
      null,
      2
    )
  };
};

const getSignalDescriptor = (scope) => {
  const payload = scope === "models" ? state.lastModelsResult : state.lastInvokeResult;
  const isOk = Boolean(payload?.ok);
  const status = isOk ? "ok" : payload?.error?.message ? "error" : "idle";
  const summary = status === "ok" ? "Success" : status === "error" ? "Failed" : "Idle";

  return {
    status,
    summary,
    detail: buildUpstreamView(payload, scope)
  };
};

const renderRawSignals = () => {
  for (const scope of ["models", "invoke"]) {
    const descriptor = getSignalDescriptor(scope);
    setSignalState(scope, descriptor.status, descriptor.summary);
    const payload = scope === "models" ? state.lastModelsResult : state.lastInvokeResult;
    setSignalMetrics(scope, payload?.timing ?? null);
  }
};

const setInvokePending = (pending) => {
  setSignalState("invoke", pending ? "pending" : "idle", pending ? "Running" : "Idle");
  if (pending) {
    setSignalMetrics("invoke", null);
  }
};

const setModelsPending = (pending) => {
  setSignalState("models", pending ? "pending" : "idle", pending ? "Running" : "Idle");
  if (pending) {
    setSignalMetrics("models", null);
  }
};

const resetInvokeSignal = () => {
  state.lastInvokeResult = null;
  state.lastInvokeEndpointPath = null;
  setSignalState("invoke", "idle", "Idle");
  setSignalMetrics("invoke", null);
};

const closePicker = ({ container, input, panel }) => {
  panel.classList.add("hidden");
  panel.setAttribute("aria-hidden", "true");
  input.setAttribute("aria-expanded", "false");
  input.setAttribute("aria-activedescendant", "");
  container.classList.remove("is-open");
};

const openPicker = ({ container, input, panel, isDisabled, getVisibleOptions, syncActive, render }, preserveActive = false) => {
  if (isDisabled()) {
    return;
  }

  const visibleOptions = getVisibleOptions();
  syncActive(visibleOptions, preserveActive);
  render(visibleOptions);
  panel.classList.remove("hidden");
  panel.setAttribute("aria-hidden", "false");
  input.setAttribute("aria-expanded", "true");
  container.classList.add("is-open");
};

const movePickerActive = ({ getVisibleOptions, getOptionKey, getActiveValue, setActiveValue, render }, direction) => {
  const visibleOptions = getVisibleOptions();
  if (!visibleOptions.length) {
    setActiveValue("");
    render(visibleOptions);
    return;
  }

  const activeIndex = visibleOptions.findIndex((item) => getOptionKey(item) === getActiveValue());
  const nextIndex = activeIndex < 0 ? 0 : Math.min(Math.max(activeIndex + direction, 0), visibleOptions.length - 1);
  setActiveValue(getOptionKey(visibleOptions[nextIndex]));
  render(visibleOptions);
};

const handlePickerKeydown = (event, config, onSelect) => {
  if (event.key === "ArrowDown") {
    event.preventDefault();
    if (config.panel.classList.contains("hidden")) {
      openPicker(config, false);
      return;
    }

    movePickerActive(config, 1);
    return;
  }

  if (event.key === "ArrowUp") {
    event.preventDefault();
    if (config.panel.classList.contains("hidden")) {
      openPicker(config, false);
      return;
    }

    movePickerActive(config, -1);
    return;
  }

  if (event.key === "Enter" && !config.panel.classList.contains("hidden")) {
    const activeValue = config.getActiveValue();
    if (activeValue) {
      event.preventDefault();
      onSelect(activeValue);
      closePicker(config);
    }
    return;
  }

  if (event.key === "Escape") {
    closePicker(config);
    return;
  }

  if (event.key === "Tab") {
    closePicker(config);
  }
};

const getModelQuery = () => modelInput.value.trim().toLowerCase();

const getVisibleModels = () => {
  const queryText = getModelQuery();
  if (!queryText || (state.selectedModel && queryText === state.selectedModel.toLowerCase())) {
    return state.models;
  }

  return state.models.filter((item) => item.id.toLowerCase().includes(queryText));
};

const getModelOptionId = (modelId) => {
  const modelIndex = state.models.findIndex((item) => item.id === modelId);
  return "model-option-" + (modelIndex >= 0 ? modelIndex : "none");
};

const setActiveModel = (modelId) => {
  state.activeModelId = modelId || "";
  modelInput.setAttribute("aria-activedescendant", state.activeModelId ? getModelOptionId(state.activeModelId) : "");
};

const syncActiveModel = (visibleModels, preserveActive = false) => {
  if (!visibleModels.length) {
    setActiveModel("");
    return;
  }

  if (preserveActive && state.activeModelId && visibleModels.some((item) => item.id === state.activeModelId)) {
    setActiveModel(state.activeModelId);
    return;
  }

  if (state.selectedModel && visibleModels.some((item) => item.id === state.selectedModel)) {
    setActiveModel(state.selectedModel);
    return;
  }

  setActiveModel(visibleModels[0].id);
};

const renderModelPanel = (visibleModels = getVisibleModels()) => {
  modelList.innerHTML = "";

  if (!visibleModels.length) {
    modelList.innerHTML = '<div class="picker-empty">No matches found</div>';
    return;
  }

  for (const model of visibleModels) {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "picker-option";
    option.id = getModelOptionId(model.id);
    option.setAttribute("role", "option");
    option.setAttribute("aria-selected", model.id === state.selectedModel ? "true" : "false");
    option.textContent = model.id;
    if (model.id === state.selectedModel) {
      option.classList.add("is-selected");
    }
    if (model.id === state.activeModelId) {
      option.classList.add("is-active");
    }
    option.addEventListener("click", () => {
      applySelectedModel(model.id);
      closePicker(modelPickerConfig);
    });
    modelList.appendChild(option);
  }
};

const getExactModel = (value) => state.models.find((item) => item.id === value) ?? null;

const updateInvokeAvailability = () => {
  invokeBtn.disabled = !state.selectedModel;
};

const clearModelSelection = () => {
  state.models = [];
  state.selectedModel = "";
  setActiveModel("");
  resetInvokeSignal();
  modelInput.disabled = true;
  modelInput.setAttribute("aria-disabled", "true");
  modelCombobox.classList.add("is-disabled");
  modelInput.value = "";
  closePicker(modelPickerConfig);
  modelList.innerHTML = '<div class="picker-empty">No models available</div>';
  updateInvokeAvailability();
  resetProbeRows(true);
};

const applySelectedModel = (value) => {
  const exact = getExactModel(value.trim());
  state.selectedModel = exact ? exact.id : "";
  modelInput.value = exact ? exact.id : "";
  setActiveModel(exact ? exact.id : "");
  updateInvokeAvailability();
  saveForm();
};

const getApiModeOptionId = (value) => {
  const optionIndex = apiModeOptions.findIndex((item) => item.value === value);
  return "api-mode-option-" + (optionIndex >= 0 ? optionIndex : "none");
};

const setActiveApiMode = (value) => {
  state.activeApiMode = value || "";
  apiModeInput.setAttribute("aria-activedescendant", state.activeApiMode ? getApiModeOptionId(state.activeApiMode) : "");
};

const getVisibleApiModes = () => apiModeOptions;

const syncActiveApiMode = (visibleModes, preserveActive = false) => {
  if (!visibleModes.length) {
    setActiveApiMode("");
    return;
  }

  if (preserveActive && state.activeApiMode && visibleModes.some((item) => item.value === state.activeApiMode)) {
    setActiveApiMode(state.activeApiMode);
    return;
  }

  if (apiModeValue.value && visibleModes.some((item) => item.value === apiModeValue.value)) {
    setActiveApiMode(apiModeValue.value);
    return;
  }

  setActiveApiMode(visibleModes[0].value);
};

const renderApiModePanel = (visibleModes = getVisibleApiModes()) => {
  apiModeList.innerHTML = "";

  for (const mode of visibleModes) {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "picker-option";
    option.id = getApiModeOptionId(mode.value);
    option.setAttribute("role", "option");
    option.setAttribute("aria-selected", mode.value === apiModeValue.value ? "true" : "false");
    option.textContent = mode.label;
    if (mode.value === apiModeValue.value) {
      option.classList.add("is-selected");
    }
    if (mode.value === state.activeApiMode) {
      option.classList.add("is-active");
    }
    option.addEventListener("click", () => {
      applyApiMode(mode.value);
      closePicker(apiPickerConfig);
    });
    apiModeList.appendChild(option);
  }
};

const applyApiMode = (value, persist = true) => {
  const exact = apiModeOptions.find((item) => item.value === value) ?? apiModeOptions[0];
  apiModeValue.value = exact.value;
  apiModeInput.value = exact.label;
  setActiveApiMode(exact.value);
  if (persist) {
    saveForm();
  }
};

const modelPickerConfig = {
  ...modelPicker,
  isDisabled: () => !state.models.length || modelInput.disabled,
  getVisibleOptions: getVisibleModels,
  getOptionKey: (item) => item.id,
  getActiveValue: () => state.activeModelId,
  setActiveValue: setActiveModel,
  syncActive: syncActiveModel,
  render: renderModelPanel
};

const apiPickerConfig = {
  ...apiPicker,
  isDisabled: () => false,
  getVisibleOptions: getVisibleApiModes,
  getOptionKey: (item) => item.value,
  getActiveValue: () => state.activeApiMode,
  setActiveValue: setActiveApiMode,
  syncActive: syncActiveApiMode,
  render: renderApiModePanel
};

const openRawModal = (scope) => {
  const descriptor = getSignalDescriptor(scope);
  rawModalTitle.textContent = descriptor.detail.title;
  rawModalJson.textContent = descriptor.detail.content;
  openModal(modalConfigs.raw, scope === "models" ? rawModelsTrigger : rawInvokeTrigger);
};

const closeRawModal = () => {
  closeModal(modalConfigs.raw);
};

const pluralize = (count, noun) => count + " " + noun + (count === 1 ? "" : "s");

const parseHistoryProbeCount = (value) => {
  const match = /^(\d+)\s+(selected|models?)$/.exec((value || "").trim());
  return match ? Number(match[1]) : null;
};

const getHistoryTitle = (item) => {
  if (item.action === "models") {
    return "Load Models";
  }

  if (item.action === "invoke") {
    return item.model ? "Invoke " + item.model : "Invoke Model";
  }

  if (item.action === "probe") {
    const selectedCount = parseHistoryProbeCount(item.model);
    return selectedCount == null ? "Batch Probe" : "Batch Probe (" + pluralize(selectedCount, "model") + ")";
  }

  if (item.model) {
    return item.model;
  }

  return item.action || "History Entry";
};

const renderHistory = () => {
  const history = getStored(storageKeys.history, []);

  if (!history.length) {
    historyList.innerHTML = '<div class="history-empty">No history yet.</div>';
    historyCount.textContent = "0";
    return;
  }

  historyList.innerHTML = "";
  for (const item of history) {
    const block = document.createElement("div");
    block.className = "history-item";
    block.innerHTML =
      "<strong>" +
      escapeHtml(getHistoryTitle(item)) +
      "</strong>" +
      "<small>" +
      escapeHtml(item.baseUrl) +
      "</small>" +
      "<small>" +
      escapeHtml(item.summary) +
      "</small>" +
      "<small>" +
      escapeHtml(item.timestamp) +
      "</small>";
    historyList.appendChild(block);
  }

  historyCount.textContent = String(history.length);
};

const openHistoryModal = () => {
  renderHistory();
  openModal(modalConfigs.history, historyTrigger);
};

const closeHistoryModal = () => {
  closeModal(modalConfigs.history);
};

const probeSkipKeywords = ["image", "embedding", "rerank", "tts", "speech", "transcribe", "transcription", "whisper", "moderation"];

const probeStatusLabels = {
  idle: "Idle",
  testing: "Testing",
  available: "Available",
  failed: "Failed",
  skipped: "Skipped"
};

const getProbeStatusText = (item) => {
  if (item.status === "failed" && item.statusCode != null) {
    return probeStatusLabels.failed + " (" + item.statusCode + ")";
  }

  return probeStatusLabels[item.status];
};

const getProbeSkipReason = (modelId) =>
  probeSkipKeywords.some((keyword) => modelId.toLowerCase().includes(keyword)) ? "Unsupported for batch probe." : null;

const createProbeRowState = (modelId) => {
  const skipReason = getProbeSkipReason(modelId);

  return {
    model: modelId,
    selectable: !skipReason,
    selected: !skipReason,
    status: skipReason ? "skipped" : "idle",
    statusCode: null,
    latencyMs: null,
    errorMessage: skipReason
  };
};

const getSelectedProbeRows = () => state.probeRows.filter((item) => item.selectable && item.selected);

const hasSelectableProbeRows = () => state.probeRows.some((item) => item.selectable);

const hasUnselectedProbeRows = () => state.probeRows.some((item) => item.selectable && !item.selected);

const hasSelectedProbeRows = () => state.probeRows.some((item) => item.selectable && item.selected);

const updateProbeAvailability = () => {
  probeDirectoryTrigger.disabled = !state.models.length;
};

const closeProbeModal = () => {
  closeModal(modalConfigs.probe);
};

const formatProbeLatency = (latencyMs) => (latencyMs == null ? "--" : latencyMs + " ms");

const getProbeProgressText = () => {
  if (!state.models.length) {
    return "Load models first";
  }

  const selectedCount = getSelectedProbeRows().length;
  if (state.probeRunning) {
    return "Testing " + state.probeCompleted + " / " + state.probeTotal;
  }

  return selectedCount + " selected";
};

const renderProbeRows = () => {
  probeModalTitle.textContent = "Model Directory (" + state.models.length + ")";
  probeProgress.textContent = getProbeProgressText();
  probeSelectAllBtn.disabled = state.probeRunning || !hasUnselectedProbeRows();
  probeDeselectAllBtn.disabled = state.probeRunning || !hasSelectedProbeRows();
  probeSelectedBtn.disabled = state.probeRunning || !getSelectedProbeRows().length;
  probeTableBody.innerHTML = "";

  if (!state.models.length) {
    probeTableBody.innerHTML = '<tr class="probe-empty-row"><td colspan="3" class="probe-empty">Load models to open the directory.</td></tr>';
    return;
  }

  for (const item of state.probeRows) {
    const row = document.createElement("tr");
    row.className = "probe-row";
    if (item.selected) {
      row.classList.add("is-selected");
    }
    if (!item.selectable) {
      row.classList.add("is-disabled");
    }

    const nameCell = document.createElement("th");
    nameCell.scope = "row";
    const nameButton = document.createElement("button");
    nameButton.type = "button";
    nameButton.className = "probe-name-button";
    if (item.selected) {
      nameButton.classList.add("is-selected");
    }
    nameButton.disabled = !item.selectable || state.probeRunning;
    nameButton.setAttribute("aria-pressed", item.selected ? "true" : "false");
    nameButton.innerHTML =
      '<span class="probe-check" aria-hidden="true"></span><span class="probe-model-name">' +
      escapeHtml(item.model) +
      "</span>";
    nameButton.addEventListener("click", () => {
      if (state.probeRunning || !item.selectable) {
        return;
      }

      item.selected = !item.selected;
      state.probeTotal = getSelectedProbeRows().length;
      renderProbeRows();
    });
    nameCell.appendChild(nameButton);

    const latencyCell = document.createElement("td");
    latencyCell.className = "probe-latency";
    latencyCell.textContent = formatProbeLatency(item.latencyMs);

    const statusCell = document.createElement("td");
    statusCell.className = "probe-status is-" + item.status;
    statusCell.textContent = getProbeStatusText(item);

    row.appendChild(nameCell);
    row.appendChild(latencyCell);
    row.appendChild(statusCell);
    probeTableBody.appendChild(row);
  }
};

const setProbeSelection = (nextSelected) => {
  if (state.probeRunning || !hasSelectableProbeRows()) {
    return;
  }

  for (const item of state.probeRows) {
    if (!item.selectable) {
      continue;
    }

    item.selected = nextSelected;
  }

  state.probeTotal = getSelectedProbeRows().length;
  renderProbeRows();
};

const resetProbeRows = (closeModal = true) => {
  state.probeRows = [];
  state.probeRunning = false;
  state.probeCompleted = 0;
  state.probeTotal = 0;
  renderProbeRows();
  updateProbeAvailability();
  if (closeModal) {
    closeProbeModal();
  }
};

const buildProbeRows = () => {
  state.probeRows = state.models.map((item) => createProbeRowState(item.id));
  state.probeRunning = false;
  state.probeCompleted = 0;
  state.probeTotal = getSelectedProbeRows().length;
  renderProbeRows();
  updateProbeAvailability();
};

const openProbeModal = () => {
  if (!state.probeRows.length) {
    buildProbeRows();
  } else {
    renderProbeRows();
    updateProbeAvailability();
  }

  openModal(modalConfigs.probe, probeDirectoryTrigger);
};

const chunkItems = (items, size) => {
  const chunks = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
};

const markProbeRowsFailed = (modelIds, message) => {
  for (const modelId of modelIds) {
    const row = state.probeRows.find((item) => item.model === modelId);
    if (!row) {
      continue;
    }

    row.status = "failed";
    row.statusCode = null;
    row.latencyMs = null;
    row.errorMessage = message;
  }
};

const pushProbeHistory = () => {
  const selectedRows = state.probeRows.filter((item) => item.selectable && item.selected);
  const successCount = selectedRows.filter((item) => item.status === "available").length;
  const failedCount = selectedRows.filter((item) => item.status === "failed").length;

  pushHistory({
    action: "probe",
    baseUrl: baseUrlInput.value.trim(),
    model: pluralize(selectedRows.length, "model"),
    timestamp: new Date().toLocaleString(),
    summary: "[Batch Probe] " + successCount + " available / " + failedCount + " failed"
  });
};

const runProbeModels = async () => {
  if (state.probeRunning) {
    return;
  }

  const selectedModelIds = getSelectedProbeRows().map((item) => item.model);
  if (!selectedModelIds.length) {
    return;
  }

  saveForm();
  state.probeRunning = true;
  state.probeCompleted = 0;
  state.probeTotal = selectedModelIds.length;

  for (const row of state.probeRows) {
    if (!row.selectable || !row.selected) {
      continue;
    }

    row.status = "idle";
    row.statusCode = null;
    row.latencyMs = null;
    row.errorMessage = null;
  }

  renderProbeRows();

  try {
    for (const chunk of chunkItems(selectedModelIds, 10)) {
      for (const modelId of chunk) {
        const row = state.probeRows.find((item) => item.model === modelId);
        if (!row) {
          continue;
        }

        row.status = "testing";
        row.statusCode = null;
        row.latencyMs = null;
        row.errorMessage = null;
      }

      renderProbeRows();

      const result = await sendProbeRequest({
        apiKey: apiKeyInput.value.trim(),
        baseUrl: baseUrlInput.value.trim(),
        apiMode: apiModeValue.value,
        modelIds: chunk,
        messages: [{ role: "user", content: promptInput.value.trim() || "hi" }]
      });

      const payload = result.payload;
      if (!result.ok || !payload.ok) {
        const message = payload?.error?.message || "Batch probe failed.";
        const pendingModels = state.probeRows
          .filter((item) => item.selectable && item.selected && (item.status === "idle" || item.status === "testing"))
          .map((item) => item.model);

        markProbeRowsFailed(pendingModels, message);
        for (const modelId of pendingModels) {
          const row = state.probeRows.find((item) => item.model === modelId);
          if (!row) {
            continue;
          }

          row.statusCode = result.status || null;
        }
        state.probeCompleted = state.probeTotal;
        showToast("Batch probe failed", message);
        break;
      }

      const returnedModelIds = [];
      for (const result of payload.results || []) {
        const row = state.probeRows.find((item) => item.model === result.model);
        if (!row) {
          continue;
        }

        returnedModelIds.push(result.model);
        row.status = result.ok ? "available" : "failed";
        row.statusCode = result.ok ? null : (result.status ?? null);
        row.latencyMs = result.timing?.totalMs ?? null;
        row.errorMessage = result.error?.message ?? null;
        state.probeCompleted += 1;
      }

      for (const modelId of chunk) {
        if (returnedModelIds.includes(modelId)) {
          continue;
        }

        const row = state.probeRows.find((item) => item.model === modelId);
        if (!row) {
          continue;
        }

        row.status = "failed";
        row.statusCode = null;
        row.latencyMs = null;
        row.errorMessage = "Batch probe returned no result for this model.";
        state.probeCompleted += 1;
      }

      renderProbeRows();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    const pendingModels = state.probeRows
      .filter((item) => item.selectable && item.selected && (item.status === "idle" || item.status === "testing"))
      .map((item) => item.model);

    markProbeRowsFailed(pendingModels, message);
    state.probeCompleted = state.probeTotal;
    showToast("Batch probe failed", message);
  } finally {
    state.probeRunning = false;
    renderProbeRows();
    pushProbeHistory();
  }
};

const pushHistory = (entry) => {
  const history = getStored(storageKeys.history, []);
  history.unshift(entry);
  setStored(storageKeys.history, history.slice(0, 20));
  renderHistory();
};

let toastTimer = null;
let suppressApiPickerClick = false;
let suppressModelPickerClick = false;

const closeToast = () => {
  if (toastTimer) {
    clearTimeout(toastTimer);
    toastTimer = null;
  }

  toast.classList.add("hidden");
  toast.setAttribute("aria-hidden", "true");
};

const showToast = (title, message) => {
  if (toastTimer) {
    clearTimeout(toastTimer);
  }

  toastTitle.textContent = title;
  toastMessage.textContent = message;
  toast.classList.remove("hidden");
  toast.setAttribute("aria-hidden", "false");
  toastTimer = setTimeout(() => {
    closeToast();
  }, 5000);
};

const togglePicker = (config, preserveActive = true) => {
  if (config.panel.classList.contains("hidden")) {
    openPicker(config, preserveActive);
    return;
  }

  closePicker(config);
};

const pushFailureFeedback = ({ action, baseUrl, model, message, apiLabel }) => {
  showToast("Request failed", message);

  const summary =
    action === "models"
      ? "[Models] Failed to load: " + message
      : "[" + apiLabel + "] Invocation failed: " + message;

  pushHistory({
    action,
    baseUrl,
    model,
    timestamp: new Date().toLocaleString(),
    summary
  });
};

const applyTheme = (theme) => {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  const isDark = theme === "dark";
  themeToggle.setAttribute("aria-label", isDark ? "Switch to light theme" : "Switch to dark theme");
  themeIcon.textContent = isDark ? "☀" : "☾";
};

const initTheme = () => {
  const bootstrappedTheme = document.documentElement.dataset.theme;
  const storedTheme = localStorage.getItem(storageKeys.theme);
  const preferred =
    bootstrappedTheme === "dark" || bootstrappedTheme === "light"
      ? bootstrappedTheme
      : storedTheme === "dark" || storedTheme === "light"
        ? storedTheme
        : window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
  applyTheme(preferred);
};

const restoreForm = () => {
  const form = getStoredForm();
  if (form.baseUrl) {
    baseUrlInput.value = form.baseUrl;
  }

  applyApiMode(form.apiMode || inferApiMode(baseUrlInput.value.trim()), false);
  closePicker(apiPickerConfig);
};

const hydrateModelSelection = () => {
  const firstModelId = state.models[0]?.id ?? "";
  state.selectedModel = firstModelId;
  setActiveModel(firstModelId);
  modelInput.disabled = !state.models.length;
  modelInput.setAttribute("aria-disabled", state.models.length ? "false" : "true");
  modelCombobox.classList.toggle("is-disabled", !state.models.length);
  modelInput.value = firstModelId;
  closePicker(modelPickerConfig);
  updateInvokeAvailability();
  updateProbeAvailability();
  saveForm();
};

const submitLoadModels = async () => {
  const startedAt = Date.now();
  saveForm();
  state.lastModelsResult = null;
  clearModelSelection();
  loadModelsBtn.disabled = true;
  setModelsPending(true);

  try {
    const result = await sendModelsRequest({
      apiKey: apiKeyInput.value.trim(),
      baseUrl: baseUrlInput.value.trim()
    });
    const payload = ensureCompletedTiming(result.payload, startedAt);
    state.lastModelsResult = payload;
    renderRawSignals();

    if (!result.ok || !payload.ok) {
      pushFailureFeedback({
        action: "models",
        baseUrl: payload?.target?.baseUrl || baseUrlInput.value.trim(),
        model: "",
        message: payload?.error?.message || "Failed to load models.",
        apiLabel: "Models"
      });
      clearModelSelection();
      return;
    }

    state.models = payload.models || [];
    hydrateModelSelection();
    pushHistory({
      action: "models",
      baseUrl: payload.target.baseUrl,
      model: "",
      timestamp: new Date().toLocaleString(),
      summary: "Loaded " + state.models.length + " models"
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "unknown";
    clearModelSelection();
    state.lastModelsResult = {
      ok: false,
      target: {
        baseUrl: baseUrlInput.value.trim() || null,
        provider: null
      },
      models: [],
      timing: { ttfbMs: null, totalMs: Date.now() - startedAt },
      error: { message: errorMessage },
      warnings: []
    };
    renderRawSignals();
    pushFailureFeedback({
      action: "models",
      baseUrl: baseUrlInput.value.trim(),
      model: "",
      message: errorMessage,
      apiLabel: "Models"
    });
  } finally {
    loadModelsBtn.disabled = false;
    if (!state.lastModelsResult) {
      setModelsPending(false);
    }
  }
};

const confirmInsecureModelsRequest = async () => {
  closeModal(modalConfigs.httpWarning, false);
  acknowledgedInsecureBaseUrl = baseUrlInput.value.trim();
  await submitLoadModels();
};

connectForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const baseUrl = baseUrlInput.value.trim();

  if (shouldWarnForInsecureBaseUrl(baseUrl) && acknowledgedInsecureBaseUrl !== baseUrl) {
    openModal(modalConfigs.httpWarning, loadModelsBtn);
    return;
  }

  await submitLoadModels();
});

invokeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.selectedModel) {
    return;
  }

  const startedAt = Date.now();
  saveForm();
  invokeBtn.disabled = true;
  state.lastInvokeResult = null;
  const requestedApiMode = apiModeValue.value;
  const requestedApiLabel = getApiModeSummaryLabel(requestedApiMode);
  state.lastInvokeEndpointPath = getInvokeEndpointPath(requestedApiMode);
  setInvokePending(true);

  try {
    const result = await sendInvokeRequest({
      apiKey: apiKeyInput.value.trim(),
      baseUrl: baseUrlInput.value.trim(),
      apiMode: requestedApiMode,
      model: state.selectedModel,
      messages: [{ role: "user", content: promptInput.value.trim() || "hi" }]
    });
    const payload = ensureCompletedTiming(result.payload, startedAt);
    state.lastInvokeResult = payload;
    renderRawSignals();

    if (!result.ok || !payload.ok) {
      pushFailureFeedback({
        action: "invoke",
        baseUrl: payload?.target?.baseUrl || baseUrlInput.value.trim(),
        model: state.selectedModel,
        message: payload?.error?.message || "Invocation failed.",
        apiLabel: requestedApiLabel
      });
      return;
    }

    pushHistory({
      action: "invoke",
      baseUrl: payload.target.baseUrl,
      model: payload.invoke.model,
      timestamp: new Date().toLocaleString(),
      summary: "[" + requestedApiLabel + "] " + payload.invoke.outputPreview
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "unknown";
    state.lastInvokeResult = {
      ok: false,
      target: {
        baseUrl: baseUrlInput.value.trim() || null,
        provider: null
      },
      invoke: {
        model: state.selectedModel || null,
        status: null,
        outputPreview: null
      },
      timing: { ttfbMs: null, totalMs: Date.now() - startedAt },
      error: { message: errorMessage },
      warnings: []
    };
    renderRawSignals();
    pushFailureFeedback({
      action: "invoke",
      baseUrl: baseUrlInput.value.trim(),
      model: state.selectedModel,
      message: errorMessage,
      apiLabel: requestedApiLabel
    });
  } finally {
    updateInvokeAvailability();
    if (!state.lastInvokeResult) {
      setInvokePending(false);
    }
  }
});

themeToggle.addEventListener("click", () => {
  const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  localStorage.setItem(storageKeys.theme, nextTheme);
  applyTheme(nextTheme);
});

probeDirectoryTrigger.addEventListener("click", openProbeModal);
probeSelectAllBtn.addEventListener("click", () => {
  setProbeSelection(true);
});
probeDeselectAllBtn.addEventListener("click", () => {
  setProbeSelection(false);
});
probeSelectedBtn.addEventListener("click", runProbeModels);
rawModelsTrigger.addEventListener("click", () => {
  openRawModal("models");
});

rawInvokeTrigger.addEventListener("click", () => {
  openRawModal("invoke");
});

rawModalClose.addEventListener("click", closeRawModal);
rawModalBackdrop.addEventListener("click", closeRawModal);
historyTrigger.addEventListener("click", openHistoryModal);
historyModalClose.addEventListener("click", closeHistoryModal);
historyModalBackdrop.addEventListener("click", closeHistoryModal);
probeModalClose.addEventListener("click", closeProbeModal);
probeModalBackdrop.addEventListener("click", closeProbeModal);
httpWarningCancel.addEventListener("click", () => {
  closeModal(modalConfigs.httpWarning);
});
httpWarningBackdrop.addEventListener("click", () => {
  closeModal(modalConfigs.httpWarning);
});
httpWarningConfirm.addEventListener("click", () => {
  void confirmInsecureModelsRequest();
});
toastClose.addEventListener("click", closeToast);

apiModePicker.addEventListener("click", (event) => {
  if (event.target === apiModeInput || event.target === apiModePicker) {
    if (suppressApiPickerClick) {
      suppressApiPickerClick = false;
      return;
    }

    togglePicker(apiPickerConfig, true);
  }
});

apiModeInput.addEventListener("focus", () => {
  if (apiModePanel.classList.contains("hidden")) {
    openPicker(apiPickerConfig, true);
    suppressApiPickerClick = true;
  }
});

apiModeInput.addEventListener("keydown", (event) => {
  handlePickerKeydown(event, apiPickerConfig, (value) => {
    applyApiMode(value);
  });
});

modelCombobox.addEventListener("click", (event) => {
  if (event.target === modelInput || event.target === modelCombobox) {
    if (suppressModelPickerClick) {
      suppressModelPickerClick = false;
      return;
    }

    togglePicker(modelPickerConfig, true);
  }
});

modelInput.addEventListener("focus", () => {
  if (modelPanel.classList.contains("hidden")) {
    openPicker(modelPickerConfig, true);
    suppressModelPickerClick = true;
  }
});

modelInput.addEventListener("keydown", (event) => {
  handlePickerKeydown(event, modelPickerConfig, (value) => {
    applySelectedModel(value);
  });
});

modelInput.addEventListener("input", () => {
  if (modelInput.value.trim() !== state.selectedModel) {
    state.selectedModel = "";
    updateInvokeAvailability();
  }

  openPicker(modelPickerConfig, false);
});

baseUrlInput.addEventListener("input", () => {
  if (acknowledgedInsecureBaseUrl && acknowledgedInsecureBaseUrl !== baseUrlInput.value.trim()) {
    acknowledgedInsecureBaseUrl = "";
  }
});

baseUrlInput.addEventListener("change", () => {
  const stored = getStoredForm();
  const previousBaseUrl = stored.baseUrl ?? "";
  const previousDefault = inferApiMode(previousBaseUrl);

  if (!stored.apiMode || apiModeValue.value === previousDefault) {
    applyApiMode(inferApiMode(baseUrlInput.value.trim()), false);
  }

  saveForm();
});

clearHistoryBtn.addEventListener("click", () => {
  localStorage.removeItem(storageKeys.history);
  renderHistory();
});

document.addEventListener("keydown", (event) => {
  trapModalFocus(event);
  if (event.defaultPrevented) {
    return;
  }

  if (event.key === "Escape" && activeModal) {
    closeModal(activeModal);
    return;
  }

  if (event.key === "Escape" && !modelPanel.classList.contains("hidden")) {
    closePicker(modelPickerConfig);
  }

  if (event.key === "Escape" && !apiModePanel.classList.contains("hidden")) {
    closePicker(apiPickerConfig);
  }
});

document.addEventListener("click", (event) => {
  if (!modelCombobox.contains(event.target)) {
    closePicker(modelPickerConfig);
  }

  if (!apiModePicker.contains(event.target)) {
    closePicker(apiPickerConfig);
  }
});

renderApiModePanel();
initTheme();
restoreForm();
renderHistory();
clearModelSelection();
renderRawSignals();

export {};
