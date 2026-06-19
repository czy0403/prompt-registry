"use strict";

const SESSION_TOKEN_KEY = "prompt-registry-admin-token";
const DISPLAY_NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} ._:/()%-]*$/u;
const TOKEN_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const DISALLOWED_CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

const state = {
  token: "",
  projects: [],
  prompts: [],
  versions: [],
  labels: [],
  tokens: [],
  selectedProjectId: "",
  selectedPromptId: "",
  selectedVersion: 0,
};

const el = {};

function byId(id) {
  const node = document.getElementById(id);
  if (!node) {
    throw new Error(`Missing element: ${id}`);
  }
  return node;
}

function text(node, value) {
  node.textContent = value == null ? "" : String(value);
}

function value(id) {
  return byId(id).value.trim();
}

function setValue(id, nextValue) {
  byId(id).value = nextValue == null ? "" : String(nextValue);
}

function clear(node) {
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
}

function make(tag, className, content) {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (content !== undefined) {
    text(node, content);
  }
  return node;
}

function prettyJson(valueToFormat) {
  return JSON.stringify(valueToFormat, null, 2);
}

function parseJsonField(id, fallback, label) {
  const raw = byId(id).value.trim();
  if (!raw) {
    return fallback;
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`${label} must be valid JSON.`);
  }
}

function assertPattern(valueToCheck, pattern, label, hint) {
  if (!pattern.test(valueToCheck)) {
    throw new Error(`${label}: ${hint}`);
  }
}

function displayNameValidationMessage(rawValue) {
  const valueToCheck = rawValue.trim();
  if (!valueToCheck) {
    return "Name is required.";
  }
  if (!DISPLAY_NAME_PATTERN.test(valueToCheck)) {
    return "Use letters or numbers plus spaces, dot, underscore, slash, hyphen, colon, parentheses, or percent.";
  }
  return "";
}

function tokenNameValidationMessage(rawValue) {
  const valueToCheck = rawValue.trim();
  if (!valueToCheck) {
    return "Token name is required.";
  }
  if (!TOKEN_NAME_PATTERN.test(valueToCheck)) {
    return "Use letters, numbers, dot, underscore, slash, or hyphen; start with a letter or number.";
  }
  return "";
}

function freeTextValidationMessage(rawValue, label) {
  if (DISALLOWED_CONTROL_CHARS.test(rawValue)) {
    return `${label} contains unsupported control characters.`;
  }
  return "";
}

function validatedDisplayName(id, label) {
  const input = byId(id);
  const message = displayNameValidationMessage(input.value);
  input.setCustomValidity(message);
  if (message) {
    throw new Error(`${label}: ${message}`);
  }
  return input.value.trim();
}

function validatedTokenName(id) {
  const input = byId(id);
  const message = tokenNameValidationMessage(input.value);
  input.setCustomValidity(message);
  if (message) {
    throw new Error(`Token name: ${message}`);
  }
  return input.value.trim();
}

function validatedDescription(id, label) {
  const input = byId(id);
  const message = freeTextValidationMessage(input.value, label);
  input.setCustomValidity(message);
  if (message) {
    throw new Error(message);
  }
  return input.value.trim();
}

function validatedFreeText(id, label) {
  const input = byId(id);
  const message = freeTextValidationMessage(input.value, label);
  input.setCustomValidity(message);
  if (message) {
    throw new Error(message);
  }
  return input.value;
}

function validatedOptionalNote(id, label) {
  const input = byId(id);
  const message = freeTextValidationMessage(input.value, label);
  input.setCustomValidity(message);
  if (message) {
    throw new Error(message);
  }
  return input.value.trim() || null;
}

function validateDisplayNameField(id) {
  const input = byId(id);
  input.setCustomValidity(displayNameValidationMessage(input.value));
}

function validateTokenNameField() {
  el.tokenName.setCustomValidity(tokenNameValidationMessage(el.tokenName.value));
}

function validateFreeTextField(id, label) {
  const input = byId(id);
  input.setCustomValidity(freeTextValidationMessage(input.value, label));
}

function setFieldError(inputId, hintId, message) {
  const input = byId(inputId);
  const hint = byId(hintId);
  input.classList.toggle("invalid", Boolean(message));
  hint.classList.toggle("error-text", Boolean(message));
  if (message) {
    text(hint, message);
  }
}

function clearFieldError(inputId, hintId, message) {
  const input = byId(inputId);
  const hint = byId(hintId);
  input.classList.remove("invalid");
  hint.classList.remove("error-text");
  text(hint, message);
}

function promptKeyValidationMessage(promptKey) {
  if (!promptKey) {
    return "Prompt key is required.";
  }
  if (/\s/.test(promptKey)) {
    return `Spaces are not allowed. Try "${promptKey.trim().replace(/\s+/g, "-")}".`;
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(promptKey)) {
    return "Use letters, numbers, dot, underscore, slash, or hyphen; start with a letter or number.";
  }
  return "";
}

function labelValidationMessage(label) {
  if (!label) {
    return "Label is required.";
  }
  if (label === "latest") {
    return "latest is managed automatically.";
  }
  if (/\s/.test(label)) {
    return `Spaces are not allowed. Try "${label.trim().toLowerCase().replace(/\s+/g, "-")}".`;
  }
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(label)) {
    return "Use lowercase letters, numbers, dot, underscore, or hyphen; start with lowercase letter or number.";
  }
  return "";
}

function validatePromptKeyField() {
  const message = promptKeyValidationMessage(value("promptKey"));
  byId("promptKey").setCustomValidity(message);
  if (message) {
    setFieldError("promptKey", "promptKeyHint", message);
  } else {
    clearFieldError(
      "promptKey",
      "promptKeyHint",
      "Use letters, numbers, dot, underscore, slash, or hyphen. Spaces are not allowed.",
    );
  }
  return message;
}

function validateLabelField() {
  const message = labelValidationMessage(value("labelName"));
  byId("labelName").setCustomValidity(message);
  if (message) {
    setFieldError("labelName", "labelHint", message);
  } else {
    clearFieldError(
      "labelName",
      "labelHint",
      "Use lowercase letters, numbers, dot, underscore, or hyphen. The managed latest label cannot be moved manually.",
    );
  }
  return message;
}

function validationDetails(details) {
  if (!Array.isArray(details) || details.length === 0) {
    return "";
  }

  return details
    .slice(0, 3)
    .map((issue) => {
      const path = Array.isArray(issue.path) && issue.path.length
        ? issue.path.join(".")
        : "request";
      const message = issue.message || "Invalid value.";
      return `${path}: ${message}`;
    })
    .join("; ");
}

function formatDate(valueToFormat) {
  if (!valueToFormat) {
    return "never";
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(valueToFormat));
}

function setStatus(message, isError = false) {
  text(el.statusText, message);
  el.statusText.classList.toggle("error-text", isError);
}

function setLabelFeedback(message, isError = false) {
  text(el.labelFeedback, message);
  el.labelFeedback.classList.toggle("hidden", !message);
  el.labelFeedback.classList.toggle("error-text", isError);
}

async function copyTextToClipboard(valueToCopy) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(valueToCopy);
      return;
    } catch (error) {
      // Fall back for browsers that expose Clipboard API but deny write access.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = valueToCopy;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "-1000px";
  textarea.style.left = "-1000px";
  textarea.style.opacity = "0";

  const selection = document.getSelection();
  const selectedRange = selection && selection.rangeCount > 0
    ? selection.getRangeAt(0)
    : null;

  document.body.append(textarea);
  textarea.select();
  textarea.setSelectionRange(0, valueToCopy.length);
  const copied = document.execCommand("copy");
  textarea.remove();

  if (selection) {
    selection.removeAllRanges();
    if (selectedRange) {
      selection.addRange(selectedRange);
    }
  }

  if (!copied) {
    throw new Error("Copy failed. Select the token and copy it manually.");
  }
}

function authHeaders() {
  if (!state.token) {
    throw new Error("Enter the administrator token first.");
  }
  return {
    authorization: `Bearer ${state.token}`,
  };
}

async function api(path, options = {}) {
  const headers = {
    ...authHeaders(),
    ...(options.headers || {}),
  };
  if (options.body !== undefined) {
    headers["content-type"] = "application/json";
  }

  const response = await fetch(path, {
    ...options,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (response.status === 204) {
    return null;
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const details = validationDetails(payload?.error?.details);
    const message =
      details ||
      payload?.error?.message ||
      `Request failed with ${response.status}`;
    throw new Error(message);
  }
  return payload;
}

function selectedProject() {
  return state.projects.find((project) => project.id === state.selectedProjectId);
}

function selectedPrompt() {
  return state.prompts.find((prompt) => prompt.id === state.selectedPromptId);
}

function selectedVersion() {
  return state.versions.find((version) => version.version === state.selectedVersion);
}

function labelVersion(labelName) {
  const found = state.labels.find((label) => label.label === labelName);
  return found ? found.version : null;
}

function renderProjects() {
  clear(el.projectList);
  text(el.projectCount, `${state.projects.length} project${state.projects.length === 1 ? "" : "s"}`);

  for (const project of state.projects) {
    const button = make("button", "list-item");
    button.type = "button";
    if (project.id === state.selectedProjectId) {
      button.classList.add("selected");
    }
    if (project.archived_at) {
      button.classList.add("archived");
    }
    button.addEventListener("click", () => selectProject(project.id));

    button.appendChild(make("strong", "", project.name));
    button.appendChild(make("small", "", project.description || "No description"));
    button.appendChild(make("small", "", project.archived_at ? `Archived ${formatDate(project.archived_at)}` : `Updated ${formatDate(project.updated_at)}`));
    el.projectList.appendChild(button);
  }
}

function renderPrompts() {
  clear(el.promptList);
  if (!state.selectedProjectId) {
    text(el.promptCount, "Select a project");
    return;
  }

  text(el.promptCount, `${state.prompts.length} prompt${state.prompts.length === 1 ? "" : "s"}`);
  for (const prompt of state.prompts) {
    const button = make("button", "list-item");
    button.type = "button";
    if (prompt.id === state.selectedPromptId) {
      button.classList.add("selected");
    }
    if (prompt.archived_at) {
      button.classList.add("archived");
    }
    button.addEventListener("click", () => selectPrompt(prompt.id));

    button.appendChild(make("strong", "", prompt.name));
    button.appendChild(make("small", "", `${prompt.prompt_key} · ${prompt.type}`));
    button.appendChild(make("small", "", prompt.description || "No description"));
    el.promptList.appendChild(button);
  }
}

function renderDetail() {
  const project = selectedProject();
  const prompt = selectedPrompt();
  el.detailBody.classList.toggle("hidden", !project);
  el.detailEmpty.classList.toggle("hidden", !!project);
  el.archiveProjectButton.disabled = !project || !!project.archived_at;
  el.archivePromptButton.disabled = !prompt || !!prompt.archived_at;
  el.permanentDeleteProjectButton.disabled = !project || !project.archived_at;
  el.permanentDeletePromptButton.disabled = !prompt || !prompt.archived_at;
  el.permanentDeleteProjectButton.title =
    project?.archived_at ? "Permanently delete this archived project." : "Archive the project first.";
  el.permanentDeletePromptButton.title =
    prompt?.archived_at ? "Permanently delete this archived prompt." : "Archive the prompt first.";
  el.saveProjectButton.disabled = !project || !!project.archived_at;
  el.savePromptButton.disabled = !prompt || !!prompt.archived_at;

  if (!project) {
    text(el.detailSubtitle, "Select a prompt");
    return;
  }

  setValue("editProjectName", project.name);
  setValue("editProjectDescription", project.description);
  text(el.detailSubtitle, prompt ? `${project.name} / ${prompt.prompt_key}` : project.name);

  if (prompt) {
    setValue("editPromptName", prompt.name);
    setValue("editPromptDescription", prompt.description);
  } else {
    setValue("editPromptName", "");
    setValue("editPromptDescription", "");
  }

  renderLabels();
  renderVersions();
  renderTokens();
}

function renderLabels() {
  clear(el.labelList);
  for (const label of state.labels) {
    el.labelList.appendChild(make("span", "badge", `${label.label} -> v${label.version}`));
  }
  if (!state.labels.length) {
    el.labelList.appendChild(make("span", "badge", "No labels loaded"));
  }
}

function fillVersionSelects() {
  const selects = [el.versionSelect, el.diffBaseSelect, el.labelVersion];
  for (const select of selects) {
    clear(select);
    for (const version of state.versions) {
      const option = make("option", "", `v${version.version}`);
      option.value = String(version.version);
      select.appendChild(option);
    }
  }

  if (state.selectedVersion) {
    el.versionSelect.value = String(state.selectedVersion);
  }
}

function renderVersions() {
  clear(el.versionList);
  fillVersionSelects();

  for (const version of state.versions) {
    const item = make("div", "version-item");
    const title = make("strong", "", `Version ${version.version}`);
    const meta = make("div", "meta", `${version.commit_message || "No commit message"} · ${formatDate(version.created_at)}`);
    const vars = make("div", "meta", `Variables: ${(version.variables || []).join(", ") || "none"}`);
    const button = make("button", "ghost", "View");
    button.type = "button";
    button.addEventListener("click", () => {
      state.selectedVersion = version.version;
      renderVersionPreview();
      fillVersionSelects();
    });
    item.appendChild(title);
    item.appendChild(meta);
    item.appendChild(vars);
    item.appendChild(button);
    el.versionList.appendChild(item);
  }

  renderVersionPreview();
}

function renderVersionPreview() {
  const version = selectedVersion();
  if (!version) {
    text(el.versionPreview, "No version selected.");
    return;
  }
  text(
    el.versionPreview,
    prettyJson({
      version: version.version,
      variables: version.variables || [],
      content: version.content,
      model_config: version.model_config,
    }),
  );
}

function renderDiff(diff) {
  clear(el.diffList);
  const entries = [
    ...(diff.content || []).map((entry) => ({ ...entry, group: "content" })),
    ...(diff.model_config || []).map((entry) => ({ ...entry, group: "model_config" })),
  ];

  if (!entries.length) {
    el.diffList.appendChild(make("div", "diff-item", "No differences."));
    return;
  }

  for (const entry of entries) {
    const item = make("div", `diff-item ${entry.kind}`);
    item.appendChild(make("strong", "", `${entry.group} ${entry.path} · ${entry.kind}`));
    const values = make("div", "diff-values");
    const before = make("pre", "", entry.before === undefined ? "" : prettyJson(entry.before));
    const after = make("pre", "", entry.after === undefined ? "" : prettyJson(entry.after));
    values.appendChild(before);
    values.appendChild(after);
    item.appendChild(values);
    el.diffList.appendChild(item);
  }
}

function renderTokens() {
  clear(el.tokenList);
  if (!state.selectedProjectId) {
    return;
  }
  if (!state.tokens.length) {
    el.tokenList.appendChild(make("div", "token-item", "No active tokens."));
    return;
  }

  for (const token of state.tokens) {
    const item = make("div", "token-item");
    item.appendChild(make("strong", "", token.name));
    item.appendChild(make("div", "meta", `${token.token_prefix}... · created ${formatDate(token.created_at)} · last used ${formatDate(token.last_used_at)}`));
    const button = make("button", "danger", "Revoke");
    button.type = "button";
    button.addEventListener("click", () => revokeToken(token.id));
    item.appendChild(button);
    el.tokenList.appendChild(item);
  }
}

function renderHistory(items) {
  clear(el.historyList);
  if (!items.length) {
    el.historyList.appendChild(make("div", "history-item", "No history."));
    return;
  }
  for (const item of items) {
    const row = make("div", "history-item");
    row.appendChild(make("strong", "", `${item.action}: v${item.from_version || "none"} -> v${item.to_version}`));
    row.appendChild(make("div", "meta", `${item.reason || "No reason"} · ${formatDate(item.created_at)}`));
    el.historyList.appendChild(row);
  }
}

async function refreshAll() {
  const projects = await api("/api/v1/projects");
  state.projects = projects;
  if (state.selectedProjectId && !projects.some((project) => project.id === state.selectedProjectId)) {
    state.selectedProjectId = "";
    state.selectedPromptId = "";
  }
  if (!state.selectedProjectId && projects[0]) {
    state.selectedProjectId = projects[0].id;
  }
  renderProjects();
  await loadPrompts();
  await loadTokens();
  setStatus("Connected.");
}

async function loadPrompts(preferredPromptId = "") {
  state.prompts = [];
  const nextPromptId = preferredPromptId || state.selectedPromptId;
  state.versions = [];
  state.labels = [];
  if (!state.selectedProjectId) {
    state.selectedPromptId = "";
    renderPrompts();
    renderDetail();
    return;
  }

  const query = el.includeArchived.checked ? "?include_archived=true" : "";
  state.prompts = await api(`/api/v1/projects/${state.selectedProjectId}/prompts${query}`);
  const promptToSelect =
    state.prompts.find((prompt) => prompt.id === nextPromptId) || state.prompts[0];
  if (promptToSelect) {
    await selectPrompt(promptToSelect.id, false);
  } else {
    state.selectedPromptId = "";
    renderPrompts();
    renderDetail();
  }
}

async function loadPromptDetail() {
  if (!state.selectedPromptId) {
    state.labels = [];
    state.versions = [];
    renderDetail();
    return;
  }
  const [prompt, versions, labels] = await Promise.all([
    api(`/api/v1/prompts/${state.selectedPromptId}`),
    api(`/api/v1/prompts/${state.selectedPromptId}/versions`),
    api(`/api/v1/prompts/${state.selectedPromptId}/labels`),
  ]);
  state.prompts = state.prompts.map((item) => (item.id === prompt.id ? prompt : item));
  state.versions = versions;
  state.labels = labels;
  state.selectedVersion = versions[0]?.version || 0;
  const latest = versions[0];
  if (latest) {
    setValue("versionContent", typeof latest.content === "string" ? latest.content : prettyJson(latest.content));
    setValue("versionModelConfig", prettyJson(latest.model_config || {}));
  }
  renderPrompts();
  renderDetail();
}

async function loadTokens() {
  state.tokens = [];
  if (state.selectedProjectId) {
    state.tokens = await api(`/api/v1/projects/${state.selectedProjectId}/api-tokens`);
  }
  renderTokens();
}

async function selectProject(projectId, reload = true) {
  state.selectedProjectId = projectId;
  state.selectedPromptId = "";
  state.versions = [];
  state.labels = [];
  state.tokens = [];
  setLabelFeedback("");
  renderProjects();
  if (reload) {
    await loadPrompts();
    await loadTokens();
  }
}

async function selectPrompt(promptId, rerenderList = true) {
  state.selectedPromptId = promptId;
  setLabelFeedback("");
  if (rerenderList) {
    renderPrompts();
  }
  await loadPromptDetail();
}

async function submitProject(event) {
  event.preventDefault();
  await api("/api/v1/projects", {
    method: "POST",
    body: {
      name: validatedDisplayName("projectName", "Project name"),
      description: validatedDescription("projectDescription", "Project description"),
    },
  });
  setValue("projectName", "");
  setValue("projectDescription", "");
  await refreshAll();
}

async function submitPrompt(event) {
  event.preventDefault();
  if (!state.selectedProjectId) {
    throw new Error("Select a project first.");
  }
  const type = byId("promptType").value;
  const promptKey = value("promptKey");
  const promptKeyMessage = validatePromptKeyField();
  if (promptKeyMessage) {
    throw new Error(`Prompt key: ${promptKeyMessage}`);
  }
  assertPattern(
    promptKey,
    /^[A-Za-z0-9][A-Za-z0-9._/-]*$/,
    "Prompt key",
    "use letters, numbers, dot, underscore, slash, or hyphen; start with a letter or number.",
  );
  const promptContent = validatedFreeText("promptContent", "Prompt content");
  validatedFreeText("promptModelConfig", "Model config");
  const content = type === "text" ? promptContent : parseJsonField("promptContent", [], "Chat content");
  const modelConfig = parseJsonField("promptModelConfig", {}, "Model config");
  await api(`/api/v1/projects/${state.selectedProjectId}/prompts`, {
    method: "POST",
    body: {
      prompt_key: promptKey,
      name: validatedDisplayName("promptName", "Prompt name"),
      description: validatedDescription("promptDescription", "Prompt description"),
      type,
      content,
      model_config: modelConfig,
      commit_message: validatedOptionalNote("promptCommitMessage", "Commit message"),
    },
  });
  setValue("promptKey", "");
  setValue("promptName", "");
  setValue("promptDescription", "");
  setValue("promptContent", "");
  setValue("promptModelConfig", "{}");
  setValue("promptCommitMessage", "");
  await loadPrompts();
}

async function submitVersion(event) {
  event.preventDefault();
  const prompt = selectedPrompt();
  if (!prompt) {
    throw new Error("Select a prompt first.");
  }
  const versionContent = validatedFreeText("versionContent", "Version content");
  validatedFreeText("versionModelConfig", "Version model config");
  const content = prompt.type === "text" ? versionContent : parseJsonField("versionContent", [], "Version content");
  const modelConfig = parseJsonField("versionModelConfig", {}, "Version model config");
  await api(`/api/v1/prompts/${prompt.id}/versions`, {
    method: "POST",
    body: {
      content,
      model_config: modelConfig,
      commit_message: validatedOptionalNote("versionCommitMessage", "Commit message"),
    },
  });
  setValue("versionCommitMessage", "");
  await loadPromptDetail();
}

async function saveProject() {
  if (!state.selectedProjectId) {
    throw new Error("Select a project first.");
  }
  await api(`/api/v1/projects/${state.selectedProjectId}`, {
    method: "PATCH",
    body: {
      name: validatedDisplayName("editProjectName", "Project name"),
      description: validatedDescription("editProjectDescription", "Project description"),
    },
  });
  await refreshAll();
}

async function savePrompt() {
  if (!state.selectedPromptId) {
    throw new Error("Select a prompt first.");
  }
  await api(`/api/v1/prompts/${state.selectedPromptId}`, {
    method: "PATCH",
    body: {
      name: validatedDisplayName("editPromptName", "Prompt name"),
      description: validatedDescription("editPromptDescription", "Prompt description"),
    },
  });
  await loadPromptDetail();
}

async function archiveProject() {
  const project = selectedProject();
  if (!project || !window.confirm(`Archive project "${project.name}"?`)) {
    return;
  }
  await api(`/api/v1/projects/${project.id}`, { method: "DELETE" });
  await refreshAll();
}

async function archivePrompt() {
  const prompt = selectedPrompt();
  if (!prompt || !window.confirm(`Archive prompt "${prompt.name}"?`)) {
    return;
  }
  await api(`/api/v1/prompts/${prompt.id}`, { method: "DELETE" });
  el.includeArchived.checked = true;
  await loadPrompts(prompt.id);
  setStatus("Prompt archived. Permanent deletion is now available in the Danger zone.");
}

async function permanentlyDeleteProject() {
  const project = selectedProject();
  if (!project) {
    throw new Error("Select a project first.");
  }
  if (!project.archived_at) {
    throw new Error("Archive the project before permanent deletion.");
  }
  const confirmation = window.prompt(
    `This will permanently delete project "${project.name}", its prompts, versions, labels, history, and API tokens.\n\nType the project name to confirm:`,
  );
  if (confirmation !== project.name) {
    setStatus("Permanent project deletion cancelled.");
    return;
  }
  await api(`/api/v1/projects/${project.id}/permanent`, { method: "DELETE" });
  state.selectedProjectId = "";
  state.selectedPromptId = "";
  state.versions = [];
  state.labels = [];
  state.tokens = [];
  await refreshAll();
  setStatus("Project permanently deleted.");
}

async function permanentlyDeletePrompt() {
  const prompt = selectedPrompt();
  if (!prompt) {
    throw new Error("Select a prompt first.");
  }
  if (!prompt.archived_at) {
    throw new Error("Archive the prompt before permanent deletion.");
  }
  const confirmation = window.prompt(
    `This will permanently delete prompt "${prompt.prompt_key}", including versions, labels, and label history.\n\nType the prompt key to confirm:`,
  );
  if (confirmation !== prompt.prompt_key) {
    setStatus("Permanent prompt deletion cancelled.");
    return;
  }
  await api(`/api/v1/prompts/${prompt.id}/permanent`, { method: "DELETE" });
  state.selectedPromptId = "";
  state.versions = [];
  state.labels = [];
  await loadPrompts();
  setStatus("Prompt permanently deleted.");
}

async function createOrMoveLabel(action) {
  if (!state.selectedPromptId) {
    throw new Error("Select a prompt first.");
  }
  setLabelFeedback("");
  const label = value("labelName");
  const labelMessage = validateLabelField();
  if (labelMessage) {
    throw new Error(`Label: ${labelMessage}`);
  }
  assertPattern(
    label,
    /^[a-z0-9][a-z0-9._-]*$/,
    "Label",
    "use lowercase letters, numbers, dot, underscore, or hyphen; start with a lowercase letter or number.",
  );
  const version = Number(byId("labelVersion").value);
  const expected = labelVersion(label);
  const fromVersion = expected == null ? "none" : `v${expected}`;
  const path =
    action === "rollback"
      ? `/api/v1/prompts/${state.selectedPromptId}/labels/${encodeURIComponent(label)}/rollback`
      : `/api/v1/prompts/${state.selectedPromptId}/labels/${encodeURIComponent(label)}`;
  el.publishLabelButton.disabled = true;
  el.rollbackLabelButton.disabled = true;
  try {
    await api(path, {
      method: action === "rollback" ? "POST" : "PUT",
      body: {
        version,
        expected_current_version: expected,
        reason: validatedOptionalNote("labelReason", "Reason"),
      },
    });
    await loadPromptDetail();
    const actionLabel = action === "rollback" ? "Rolled back" : "Published";
    const message = expected === version
      ? `${label} already points to v${version}.`
      : `${actionLabel} ${label}: ${fromVersion} -> v${version}.`;
    setLabelFeedback(message);
    setStatus(message);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error.";
    setLabelFeedback(message, true);
    throw error;
  } finally {
    el.publishLabelButton.disabled = false;
    el.rollbackLabelButton.disabled = false;
  }
}

async function loadHistory() {
  if (!state.selectedPromptId) {
    throw new Error("Select a prompt first.");
  }
  const label = value("labelName");
  if (!label) {
    throw new Error("Enter a label name.");
  }
  const history = await api(`/api/v1/prompts/${state.selectedPromptId}/labels/${encodeURIComponent(label)}/history`);
  renderHistory(history);
}

async function showDiff() {
  if (!state.selectedPromptId) {
    throw new Error("Select a prompt first.");
  }
  const target = Number(byId("versionSelect").value);
  const base = Number(byId("diffBaseSelect").value);
  if (!target || !base) {
    throw new Error("Select both versions.");
  }
  const diff = await api(`/api/v1/prompts/${state.selectedPromptId}/versions/${target}/diff?base_version=${base}`);
  renderDiff(diff);
}

async function createToken(event) {
  event.preventDefault();
  if (!state.selectedProjectId) {
    throw new Error("Select a project first.");
  }
  const created = await api(`/api/v1/projects/${state.selectedProjectId}/api-tokens`, {
    method: "POST",
    body: { name: validatedTokenName("tokenName") },
  });
  setValue("tokenName", "");
  text(el.newTokenValue, created.token);
  el.newTokenBox.classList.remove("hidden");
  await loadTokens();
}

async function revokeToken(tokenId) {
  if (!state.selectedProjectId || !window.confirm("Revoke this token?")) {
    return;
  }
  await api(`/api/v1/projects/${state.selectedProjectId}/api-tokens/${tokenId}`, {
    method: "DELETE",
  });
  await loadTokens();
}

async function copyNewToken() {
  const token = el.newTokenValue.textContent || "";
  if (!token) {
    return;
  }
  await copyTextToClipboard(token);
  setStatus("Token copied.");
}

function updatePromptPlaceholders() {
  const type = byId("promptType").value;
  if (type === "chat") {
    setValue("promptContent", '[{"role":"system","content":"Use a {{tone}} tone."},{"role":"user","content":"{{question}}"}]');
  } else {
    setValue("promptContent", "Summarize {{input}}.");
  }
}

function connect(event) {
  event.preventDefault();
  const token = value("tokenInput");
  if (!token) {
    setStatus("Enter the administrator token.", true);
    return;
  }
  state.token = token;
  if (el.rememberToken.checked) {
    sessionStorage.setItem(SESSION_TOKEN_KEY, token);
  } else {
    sessionStorage.removeItem(SESSION_TOKEN_KEY);
  }
  refreshAll().catch(handleError);
}

function logout() {
  state.token = "";
  sessionStorage.removeItem(SESSION_TOKEN_KEY);
  setValue("tokenInput", "");
  setStatus("Token cleared.");
}

function handleError(error) {
  setStatus(error instanceof Error ? error.message : "Unexpected error.", true);
}

function bind(id, eventName, handler) {
  byId(id).addEventListener(eventName, (event) => {
    Promise.resolve(handler(event)).catch(handleError);
  });
}

function initElements() {
  for (const id of [
    "statusText",
    "authForm",
    "tokenInput",
    "rememberToken",
    "logoutButton",
    "refreshButton",
    "projectForm",
    "projectName",
    "projectDescription",
    "projectCount",
    "projectList",
    "includeArchived",
    "promptForm",
    "promptType",
    "promptCount",
    "promptList",
    "detailSubtitle",
    "archiveProjectButton",
    "archivePromptButton",
    "permanentDeleteProjectButton",
    "permanentDeletePromptButton",
    "detailEmpty",
    "detailBody",
    "saveProjectButton",
    "savePromptButton",
    "editProjectName",
    "editProjectDescription",
    "editPromptName",
    "editPromptDescription",
    "labelList",
    "versionForm",
    "versionContent",
    "versionModelConfig",
    "versionSelect",
    "diffBaseSelect",
    "labelVersion",
    "versionList",
    "versionPreview",
    "diffList",
    "diffButton",
    "reloadVersionsButton",
    "labelName",
    "labelReason",
    "labelFeedback",
    "publishLabelButton",
    "rollbackLabelButton",
    "loadHistoryButton",
    "historyList",
    "reloadTokensButton",
    "tokenForm",
    "tokenName",
    "newTokenBox",
    "newTokenValue",
    "copyTokenButton",
    "tokenList",
    "promptKeyHint",
    "labelHint",
    "promptKey",
    "labelName",
  ]) {
    el[id] = byId(id);
  }
}

function init() {
  initElements();
  bind("authForm", "submit", connect);
  bind("logoutButton", "click", logout);
  bind("refreshButton", "click", refreshAll);
  bind("projectForm", "submit", submitProject);
  bind("includeArchived", "change", loadPrompts);
  bind("promptForm", "submit", submitPrompt);
  bind("promptType", "change", updatePromptPlaceholders);
  bind("versionForm", "submit", submitVersion);
  bind("reloadVersionsButton", "click", loadPromptDetail);
  bind("saveProjectButton", "click", saveProject);
  bind("savePromptButton", "click", savePrompt);
  bind("archiveProjectButton", "click", archiveProject);
  bind("archivePromptButton", "click", archivePrompt);
  bind("permanentDeleteProjectButton", "click", permanentlyDeleteProject);
  bind("permanentDeletePromptButton", "click", permanentlyDeletePrompt);
  bind("publishLabelButton", "click", () => createOrMoveLabel("publish"));
  bind("rollbackLabelButton", "click", () => createOrMoveLabel("rollback"));
  bind("loadHistoryButton", "click", loadHistory);
  bind("diffButton", "click", showDiff);
  bind("reloadTokensButton", "click", loadTokens);
  bind("tokenForm", "submit", createToken);
  bind("copyTokenButton", "click", copyNewToken);
  bind("versionSelect", "change", () => {
    state.selectedVersion = Number(el.versionSelect.value);
    renderVersionPreview();
  });
  for (const id of ["projectName", "editProjectName", "promptName", "editPromptName"]) {
    bind(id, "input", () => validateDisplayNameField(id));
  }
  bind("projectDescription", "input", () => validateFreeTextField("projectDescription", "Project description"));
  bind("editProjectDescription", "input", () => validateFreeTextField("editProjectDescription", "Project description"));
  bind("promptDescription", "input", () => validateFreeTextField("promptDescription", "Prompt description"));
  bind("editPromptDescription", "input", () => validateFreeTextField("editPromptDescription", "Prompt description"));
  bind("promptContent", "input", () => validateFreeTextField("promptContent", "Prompt content"));
  bind("promptModelConfig", "input", () => validateFreeTextField("promptModelConfig", "Model config"));
  bind("versionContent", "input", () => validateFreeTextField("versionContent", "Version content"));
  bind("versionModelConfig", "input", () => validateFreeTextField("versionModelConfig", "Version model config"));
  bind("promptCommitMessage", "input", () => validateFreeTextField("promptCommitMessage", "Commit message"));
  bind("versionCommitMessage", "input", () => validateFreeTextField("versionCommitMessage", "Commit message"));
  bind("labelReason", "input", () => validateFreeTextField("labelReason", "Reason"));
  bind("tokenName", "input", validateTokenNameField);
  bind("promptKey", "input", validatePromptKeyField);
  bind("labelName", "input", validateLabelField);

  updatePromptPlaceholders();
  const storedToken = sessionStorage.getItem(SESSION_TOKEN_KEY);
  if (storedToken) {
    state.token = storedToken;
    setValue("tokenInput", storedToken);
    el.rememberToken.checked = true;
    refreshAll().catch(handleError);
  }
}

document.addEventListener("DOMContentLoaded", init);
