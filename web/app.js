"use strict";

const SESSION_TOKEN_KEY = "prompt-registry-admin-token";
const DEFAULT_LABELS = ["production", "staging", "development"];

const state = {
  token: "",
  remember: false,
  projects: [],
  promptsByProject: new Map(),
  promptDetails: new Map(),
  versionsByPrompt: new Map(),
  tokensByProject: new Map(),
  tokensLoading: new Set(),
  historyByPrompt: new Map(),
  view: { type: "auth" },
  loading: false,
  selectedVersion: new Map(),
  compareVersion: new Map(),
};

const els = {
  app: document.getElementById("app"),
  sidebar: document.getElementById("sidebar"),
  main: document.getElementById("main"),
  modalRoot: document.getElementById("modalRoot"),
  toastRoot: document.getElementById("toastRoot"),
};

const iconPaths = {
  archive: '<path d="M21 8v13H3V8"/><path d="M1 3h22v5H1z"/><path d="M10 12h4"/>',
  boxes: '<path d="M2.97 12.92 12 17.5l9.03-4.58"/><path d="M2.97 17.92 12 22.5l9.03-4.58"/><path d="M12 2 2.97 6.58 12 11.16l9.03-4.58L12 2Z"/>',
  check: '<path d="m20 6-11 11-5-5"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  code: '<path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  file: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2Z"/><path d="M14 2v6h6"/>',
  folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9L9.6 4A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  git: '<circle cx="12" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/><path d="M6 9v9"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 3v6h6"/><path d="M12 7v5l3 2"/>',
  key: '<path d="M21 2 11 12"/><circle cx="7.5" cy="15.5" r="5.5"/><path d="m17 6 3 3"/><path d="m14 9 3 3"/>',
  logOut: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  refresh: '<path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>',
  rocket: '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09Z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22 22 0 0 1-4 2Z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>',
  rotate: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
  tag: '<path d="M12.59 2.59A2 2 0 0 0 11.17 2H4a2 2 0 0 0-2 2v7.17a2 2 0 0 0 .59 1.42l8.82 8.82a2 2 0 0 0 2.83 0l7.17-7.17a2 2 0 0 0 0-2.83z"/><path d="M7 7h.01"/>',
  terminal: '<path d="m4 17 6-6-6-6"/><path d="M12 19h8"/>',
  trash: '<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6 18 20a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
};

function icon(name) {
  return `<svg class="icon-svg" viewBox="0 0 24 24" aria-hidden="true">${iconPaths[name] ?? iconPaths.file}</svg>`;
}

function brandMark() {
  return `
    <svg class="brand-svg" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 3.5h7.2L18 7.3v13.2H7z" />
      <path d="M14 3.5v4h4" />
      <path d="M10 12.2c-.8.4-1.2.9-1.2 1.8s.4 1.4 1.2 1.8" />
      <path d="M14 12.2c.8.4 1.2.9 1.2 1.8s-.4 1.4-1.2 1.8" />
      <path d="M11.6 16.2 12.4 12" />
    </svg>
  `;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function pretty(value) {
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

function formatDate(value) {
  if (!value) return "从未";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function fullDate(value) {
  if (!value) return "从未";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function parseJson(raw, label) {
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`${label} 必须是合法 JSON。`);
  }
}

function promptArchived(prompt) {
  return Boolean(prompt?.archived_at);
}

function projectArchived(project) {
  return Boolean(project?.archived_at);
}

function promptList(projectId) {
  return state.promptsByProject.get(projectId) ?? [];
}

function versionsFor(promptId) {
  return state.versionsByPrompt.get(promptId) ?? [];
}

function labelsFor(promptId) {
  return state.promptDetails.get(promptId)?.labels ?? [];
}

function currentProject() {
  if (state.view.type === "project") {
    return state.projects.find((p) => p.id === state.view.projectId);
  }
  if (state.view.type === "prompt") {
    const prompt = state.promptDetails.get(state.view.promptId);
    return state.projects.find((p) => p.id === prompt?.project_id);
  }
  return null;
}

async function api(path, options = {}) {
  if (!state.token) throw new Error("请先输入 ADMIN_API_TOKEN。");
  const headers = {
    authorization: `Bearer ${state.token}`,
    ...options.headers,
  };
  if (options.body !== undefined) {
    headers["content-type"] = "application/json";
  }
  const response = await fetch(path, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  if (response.status === 204) return null;
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = body?.error?.message ?? `请求失败 (${response.status})`;
    throw new Error(message);
  }
  return body;
}

async function runTask(task, successMessage) {
  try {
    state.loading = true;
    const result = await task();
    if (successMessage) toast(successMessage, "success");
    return result;
  } catch (error) {
    toast(error.message, "error");
    return null;
  } finally {
    state.loading = false;
    render();
  }
}

async function refreshAll() {
  if (!state.token) {
    render();
    return;
  }
  await runTask(async () => {
    state.projects = await api("/api/v1/projects");
    await Promise.all(state.projects.map((project) => loadProjectPrompts(project.id)));
    if (state.view.type === "auth") {
      const first = state.projects.find((project) => !projectArchived(project));
      state.view = first
        ? { type: "project", projectId: first.id, tab: "prompts" }
        : { type: "trash" };
    }
  });
}

async function loadProjectPrompts(projectId) {
  const prompts = await api(`/api/v1/projects/${projectId}/prompts?include_archived=true`);
  state.promptsByProject.set(projectId, prompts);
  await Promise.all(prompts.map((prompt) => loadPrompt(prompt.id, false)));
}

async function loadPrompt(promptId, withHistory = true) {
  const [detail, versions] = await Promise.all([
    api(`/api/v1/prompts/${promptId}`),
    api(`/api/v1/prompts/${promptId}/versions`),
  ]);
  state.promptDetails.set(promptId, detail);
  state.versionsByPrompt.set(promptId, versions);
  if (!state.selectedVersion.get(promptId) && versions[0]) {
    state.selectedVersion.set(promptId, versions[0].version);
  }
  if (withHistory) await loadHistories(promptId);
}

async function loadHistories(promptId) {
  const labels = labelsFor(promptId)
    .map((item) => item.label)
    .filter((label) => label !== "latest");
  const names = [...new Set([...DEFAULT_LABELS, ...labels])];
  const entries = [];
  await Promise.all(
    names.map(async (label) => {
      try {
        const history = await api(`/api/v1/prompts/${promptId}/labels/${encodeURIComponent(label)}/history`);
        entries.push(...history);
      } catch {
        // Missing label history is normal for never-published labels.
      }
    }),
  );
  entries.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  state.historyByPrompt.set(promptId, entries);
}

async function ensureTokens(projectId) {
  if (state.tokensByProject.has(projectId)) return;
  if (state.tokensLoading.has(projectId)) return;
  state.tokensLoading.add(projectId);
  try {
    const tokens = await api(`/api/v1/projects/${projectId}/api-tokens`);
    state.tokensByProject.set(projectId, tokens);
  } finally {
    state.tokensLoading.delete(projectId);
  }
}

function setToken(token, remember) {
  state.token = token;
  state.remember = remember;
  if (remember) {
    sessionStorage.setItem(SESSION_TOKEN_KEY, token);
  } else {
    sessionStorage.removeItem(SESSION_TOKEN_KEY);
  }
}

function logout() {
  setToken("", false);
  state.view = { type: "auth" };
  state.projects = [];
  state.promptsByProject.clear();
  state.promptDetails.clear();
  state.versionsByPrompt.clear();
  state.tokensByProject.clear();
  state.tokensLoading.clear();
  state.historyByPrompt.clear();
  render();
}

function toast(message, kind = "success") {
  const node = document.createElement("div");
  node.className = `toast ${kind}`;
  node.textContent = message;
  els.toastRoot.append(node);
  setTimeout(() => node.remove(), 3600);
}

function render() {
  renderSidebar();
  renderMain();
  bindMenus();
}

function renderSidebar() {
  const activeProjects = state.projects.filter((project) => !projectArchived(project));
  const archivedCount =
    state.projects.filter(projectArchived).length +
    [...state.promptsByProject.values()].flat().filter(promptArchived).length;
  els.sidebar.innerHTML = `
    <div class="brand">
      <div class="brand-mark">${brandMark()}</div>
      <div>
        <div class="brand-title">prompt-registry</div>
        <div class="brand-subtitle">v0.1.0</div>
      </div>
    </div>
    <div class="sidebar-section">
      <div class="sidebar-title">
        <span>项目</span>
        <button class="btn ghost icon" id="newProjectButton" type="button" aria-label="新建项目">${icon("plus")}</button>
      </div>
    </div>
    <div class="sidebar-scroll">
      <nav class="nav-list" id="projectNav"></nav>
    </div>
    <div class="sidebar-footer">
      <button class="sidebar-footer-button ${state.view.type === "trash" ? "active" : ""}" id="trashButton" type="button">
        ${icon("trash")}<span class="nav-label">回收站</span>${archivedCount ? `<span class="count-pill">${archivedCount}</span>` : ""}
      </button>
      <button class="sidebar-footer-button" id="refreshButton" type="button">
        ${icon("refresh")}<span class="nav-label">${state.loading ? "同步中" : "刷新"}</span>
      </button>
    </div>
  `;

  const nav = document.getElementById("projectNav");
  if (!state.token) {
    nav.innerHTML = '<p class="hint sidebar-note">连接管理员 Token 后加载项目。</p>';
  } else if (activeProjects.length === 0) {
    nav.innerHTML = '<p class="hint sidebar-note">暂无活跃项目。</p>';
  } else {
    nav.innerHTML = activeProjects
      .map((project) => {
        const count = promptList(project.id).filter((prompt) => !promptArchived(prompt)).length;
        const active = currentProject()?.id === project.id && state.view.type !== "trash";
        return `
          <button class="nav-item ${active ? "active" : ""}" type="button" data-project-id="${project.id}">
            ${icon("folder")}<span class="nav-label">${escapeHtml(project.name)}</span><span class="count-pill">${count}</span>
          </button>
        `;
      })
      .join("");
  }

  document.getElementById("newProjectButton").addEventListener("click", () => openProjectModal());
  document.getElementById("trashButton").addEventListener("click", () => {
    state.view = { type: "trash" };
    render();
  });
  document.getElementById("refreshButton").addEventListener("click", refreshAll);
  nav.querySelectorAll("[data-project-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.view = { type: "project", projectId: button.dataset.projectId, tab: "prompts" };
      await runTask(async () => loadProjectPrompts(button.dataset.projectId));
    });
  });
}

function renderMain() {
  if (!state.token || state.view.type === "auth") {
    renderAuth();
    return;
  }
  if (state.view.type === "project") {
    renderProjectView();
    return;
  }
  if (state.view.type === "prompt") {
    renderPromptView();
    return;
  }
  renderTrashView();
}

function renderTopbar(parts, actions = "") {
  return `
    <header class="topbar">
      <div class="breadcrumbs">
        ${parts.join('<span>/</span>')}
      </div>
      <div class="top-actions">
        ${state.token ? `<button class="btn ghost" id="logoutButton" type="button">${icon("logOut")}断开</button>` : ""}
        ${actions}
      </div>
    </header>
  `;
}

function bindTopbar() {
  const logoutButton = document.getElementById("logoutButton");
  if (logoutButton) logoutButton.addEventListener("click", logout);
}

function closeMenus(except) {
  document.querySelectorAll(".menu.open").forEach((menu) => {
    if (menu !== except) {
      menu.classList.remove("open");
      const content = menu.querySelector(".menu-content");
      if (content) {
        content.style.top = "";
        content.style.left = "";
      }
    }
  });
}

function positionMenu(trigger, content) {
  const rect = trigger.getBoundingClientRect();
  const gutter = 8;
  const width = Math.max(content.offsetWidth, 170);
  const height = content.offsetHeight;
  const left = Math.min(
    Math.max(gutter, rect.right - width),
    window.innerWidth - width - gutter,
  );
  const below = rect.bottom + 6;
  const above = rect.top - height - 6;
  const top = below + height > window.innerHeight - gutter
    ? Math.max(gutter, above)
    : below;
  content.style.left = `${left}px`;
  content.style.top = `${top}px`;
}

function bindMenus(root = document) {
  root.querySelectorAll(".menu").forEach((menu) => {
    const trigger = menu.querySelector("[data-menu-trigger]");
    const content = menu.querySelector(".menu-content");
    if (!trigger || !content || trigger.dataset.bound === "true") return;
    trigger.dataset.bound = "true";
    trigger.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const shouldOpen = !menu.classList.contains("open");
      closeMenus(menu);
      menu.classList.toggle("open", shouldOpen);
      if (shouldOpen) positionMenu(trigger, content);
    });
    menu.querySelectorAll(".menu-item").forEach((item) => {
      item.addEventListener("click", () => menu.classList.remove("open"));
    });
  });
}

function renderAuth() {
  els.main.innerHTML = `
    ${renderTopbar(['<span class="crumb-current">连接 prompt-registry</span>'])}
    <section class="content auth-card">
      <form class="auth-panel" id="authForm">
        <div class="brand auth-brand">
          <div class="brand-mark">${brandMark()}</div>
          <div>
            <h1 class="view-title">prompt-registry</h1>
            <p class="view-meta">输入 ADMIN_API_TOKEN 后管理真实 prompt-registry 数据。</p>
          </div>
        </div>
        <div class="form-row">
          <label class="label" for="tokenInput">管理员 Token</label>
          <input class="field mono" id="tokenInput" type="password" autocomplete="off" placeholder="ADMIN_API_TOKEN" required>
        </div>
        <label class="hint remember-line">
          <input id="rememberInput" type="checkbox"> Remember in this tab
        </label>
        <button class="btn primary" type="submit">${icon("check")}连接</button>
      </form>
    </section>
  `;
  bindTopbar();
  document.getElementById("authForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const token = document.getElementById("tokenInput").value.trim();
    const remember = document.getElementById("rememberInput").checked;
    setToken(token, remember);
    state.view = { type: "auth" };
    await refreshAll();
  });
}

function renderProjectView() {
  const project = state.projects.find((item) => item.id === state.view.projectId);
  if (!project) {
    state.view = { type: "trash" };
    renderTrashView();
    return;
  }
  const tab = state.view.tab ?? "prompts";
  const prompts = promptList(project.id).filter((prompt) => !promptArchived(prompt));
  const actions = `
    <button class="btn" id="editProjectButton" type="button">${icon("file")}编辑</button>
    <button class="btn primary" id="primaryProjectAction" type="button">${icon(tab === "tokens" ? "key" : "plus")}${tab === "tokens" ? "新建 Token" : "新建 Prompt"}</button>
  `;
  els.main.innerHTML = `
    ${renderTopbar([
      '<button class="crumb-button" id="homeCrumb" type="button">项目</button>',
      `<span class="crumb-current">${escapeHtml(project.name)}</span>`,
    ], actions)}
    <section class="content">
      <div class="view-head">
        <div>
          <h1 class="view-title">${escapeHtml(project.name)}</h1>
          <p class="view-meta">${escapeHtml(project.description || "无描述")} ${projectArchived(project) ? "· 已归档" : ""}</p>
        </div>
        <div class="menu">
          <button class="btn icon" data-menu-trigger type="button" aria-label="项目操作">${icon("more")}</button>
          <div class="menu-content">
            <button class="menu-item" id="menuEditProject" type="button">${icon("file")}编辑项目</button>
            <button class="menu-item danger" id="menuArchiveProject" type="button">${icon("archive")}归档项目</button>
          </div>
        </div>
      </div>
      <div class="tabs">
        <button class="tab ${tab === "prompts" ? "active" : ""}" data-tab="prompts" type="button">Prompts <span class="count-pill">${prompts.length}</span></button>
        <button class="tab ${tab === "tokens" ? "active" : ""}" data-tab="tokens" type="button">API Token</button>
      </div>
      <div id="projectTab"></div>
    </section>
  `;
  bindTopbar();
  document.getElementById("homeCrumb").addEventListener("click", () => render());
  document.getElementById("editProjectButton").addEventListener("click", () => openProjectModal(project));
  document.getElementById("menuEditProject").addEventListener("click", () => openProjectModal(project));
  document.getElementById("menuArchiveProject").addEventListener("click", () => archiveProject(project));
  document.getElementById("primaryProjectAction").addEventListener("click", () => {
    if (tab === "tokens") openTokenModal(project.id);
    else openPromptModal(project.id);
  });
  document.querySelectorAll("[data-tab]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.view = { type: "project", projectId: project.id, tab: button.dataset.tab };
      if (button.dataset.tab === "tokens") {
        await runTask(async () => ensureTokens(project.id));
      } else {
        render();
      }
    });
  });
  if (tab === "tokens") {
    renderTokens(project.id);
    if (!state.tokensByProject.has(project.id) && !state.tokensLoading.has(project.id)) {
      runTask(async () => ensureTokens(project.id));
    }
  } else {
    renderPromptTable(project.id, prompts);
  }
}

function renderPromptTable(projectId, prompts) {
  const container = document.getElementById("projectTab");
  if (prompts.length === 0) {
    container.innerHTML = `<div class="empty">${icon("file")}<p>还没有 Prompt。创建第一个版本化 prompt。</p></div>`;
    return;
  }
  container.innerHTML = `
    <div class="table-shell">
      <table class="table">
        <thead><tr><th>Prompt</th><th>类型</th><th>最新版本</th><th>发布标签</th><th></th></tr></thead>
        <tbody>
          ${prompts.map((prompt) => {
            const detail = state.promptDetails.get(prompt.id) ?? prompt;
            const versions = versionsFor(prompt.id);
            const latest = versions[0];
            const labels = (detail.labels ?? []).filter((label) => label.label !== "latest");
            return `
              <tr class="click-row" data-prompt-id="${prompt.id}">
                <td>
                  <div class="item-title">${escapeHtml(prompt.name)}</div>
                  <div class="item-subtitle truncate"><span class="mono">${escapeHtml(prompt.prompt_key)}</span> · ${escapeHtml(prompt.description || "无描述")}</div>
                </td>
                <td><span class="badge">${escapeHtml(prompt.type)}</span></td>
                <td><span class="mono">${latest ? `v${latest.version}` : "-"}</span></td>
                <td><div class="badge-row">${labelBadges(labels)}</div></td>
                <td>
                  <div class="menu row-menu">
                    <button class="btn icon" data-menu-trigger type="button" aria-label="Prompt 操作">${icon("more")}</button>
                    <div class="menu-content">
                      <button class="menu-item" data-edit-prompt="${prompt.id}" type="button">${icon("file")}编辑</button>
                      <button class="menu-item danger" data-archive-prompt="${prompt.id}" type="button">${icon("archive")}归档</button>
                    </div>
                  </div>
                </td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
  container.querySelectorAll(".row-menu").forEach((menu) => {
    menu.addEventListener("click", (event) => event.stopPropagation());
  });
  container.querySelectorAll("[data-prompt-id]").forEach((row) => {
    row.addEventListener("click", async () => {
      state.view = { type: "prompt", promptId: row.dataset.promptId };
      await runTask(async () => loadPrompt(row.dataset.promptId, true));
    });
  });
  container.querySelectorAll("[data-edit-prompt]").forEach((button) => {
    button.addEventListener("click", () => openPromptEditModal(state.promptDetails.get(button.dataset.editPrompt)));
  });
  container.querySelectorAll("[data-archive-prompt]").forEach((button) => {
    button.addEventListener("click", () => archivePrompt(state.promptDetails.get(button.dataset.archivePrompt), projectId));
  });
}

function labelBadges(labels) {
  if (!labels.length) return '<span class="hint">未发布</span>';
  return labels
    .map((label) => `<span class="badge ${label.label === "production" ? "success" : "brand"}"><span class="dot"></span>${escapeHtml(label.label)} <span class="mono">v${label.version}</span></span>`)
    .join("");
}

function renderTokens(projectId) {
  const container = document.getElementById("projectTab");
  const tokens = state.tokensByProject.get(projectId);
  if (!tokens) {
    container.innerHTML = `<div class="empty"><p>正在加载 Token...</p></div>`;
    return;
  }
  if (tokens.length === 0) {
    container.innerHTML = `<div class="empty">${icon("key")}<p>暂无有效 Token。创建一个用于服务端读取已发布 Prompt。</p></div>`;
    return;
  }
  container.innerHTML = `
    <div class="table-shell">
      <table class="table">
        <thead><tr><th>名称</th><th>前缀</th><th>最近使用</th><th>创建时间</th><th></th></tr></thead>
        <tbody>
          ${tokens.map((token) => `
            <tr>
              <td><div class="item-title">${escapeHtml(token.name)}</div></td>
              <td><code>${escapeHtml(token.token_prefix)}••••••••</code></td>
              <td>${escapeHtml(formatDate(token.last_used_at))}</td>
              <td>${escapeHtml(formatDate(token.created_at))}</td>
              <td><button class="btn danger" data-revoke-token="${token.id}" type="button">${icon("trash")}吊销</button></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
  container.querySelectorAll("[data-revoke-token]").forEach((button) => {
    button.addEventListener("click", () => revokeToken(projectId, button.dataset.revokeToken));
  });
}

function renderPromptView() {
  const prompt = state.promptDetails.get(state.view.promptId);
  if (!prompt) {
    els.main.innerHTML = renderTopbar(['<span class="crumb-current">Prompt</span>']) + '<section class="content"><div class="empty">Prompt 未加载。</div></section>';
    bindTopbar();
    return;
  }
  const project = state.projects.find((item) => item.id === prompt.project_id);
  const versions = versionsFor(prompt.id);
  const selectedNumber = state.selectedVersion.get(prompt.id) ?? versions[0]?.version;
  const selected = versions.find((version) => version.version === Number(selectedNumber)) ?? versions[0];
  const actions = `
    <button class="btn primary" id="newVersionButton" type="button">${icon("plus")}新建版本</button>
  `;
  els.main.innerHTML = `
    ${renderTopbar([
      `<button class="crumb-button" id="projectCrumb" type="button">${escapeHtml(project?.name ?? "项目")}</button>`,
      `<span class="crumb-current">${escapeHtml(prompt.name)}</span>`,
    ], actions)}
    <section class="prompt-layout">
      <aside class="version-rail">
        <div class="sidebar-title">版本 (${versions.length})</div>
        ${versions.map((version) => `
          <button class="version-item ${selected?.version === version.version ? "active" : ""}" data-version="${version.version}" type="button">
            <span class="mono">v${version.version}</span>
            <span class="item-subtitle">${escapeHtml(version.commit_message || "无提交说明")}</span>
            <span class="item-subtitle">${escapeHtml(formatDate(version.created_at))}</span>
          </button>
        `).join("")}
      </aside>
      <div class="version-body">
        <div class="view-head">
          <div>
            <h1 class="view-title">${escapeHtml(prompt.name)} <span class="badge">${escapeHtml(prompt.type)}</span></h1>
            <p class="view-meta"><span class="mono">${escapeHtml(prompt.prompt_key)}</span> · ${escapeHtml(prompt.description || "无描述")}</p>
          </div>
          <div class="menu">
            <button class="btn icon" data-menu-trigger type="button" aria-label="Prompt 操作">${icon("more")}</button>
            <div class="menu-content">
              <button class="menu-item" id="menuEditPrompt" type="button">${icon("file")}编辑 Prompt</button>
              <button class="menu-item danger" id="menuArchivePrompt" type="button">${icon("archive")}归档 Prompt</button>
            </div>
          </div>
        </div>
        ${renderSelectedVersion(prompt, selected, versions)}
      </div>
    </section>
  `;
  bindTopbar();
  document.getElementById("projectCrumb").addEventListener("click", () => {
    state.view = { type: "project", projectId: prompt.project_id, tab: "prompts" };
    render();
  });
  document.getElementById("menuEditPrompt").addEventListener("click", () => openPromptEditModal(prompt));
  document.getElementById("menuArchivePrompt").addEventListener("click", () => archivePrompt(prompt, prompt.project_id));
  document.getElementById("newVersionButton").addEventListener("click", () => openVersionModal(prompt, selected));
  document.querySelectorAll("[data-version]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedVersion.set(prompt.id, Number(button.dataset.version));
      state.compareVersion.set(prompt.id, "none");
      render();
    });
  });
  bindVersionControls(prompt, selected);
}

function renderSelectedVersion(prompt, selected, versions) {
  if (!selected) return '<div class="empty">暂无版本。</div>';
  const labels = labelsFor(prompt.id);
  const selectedLabels = labels.filter((label) => label.version === selected.version);
  const compare = state.compareVersion.get(prompt.id) ?? "none";
  return `
    <div class="tabs">
      <button class="tab active" type="button">${icon("git")}版本与内容</button>
    </div>
    <div class="split">
      <div class="version-stack">
        <div class="version-toolbar">
          <div class="version-title-line">
            <h2 class="version-number mono">v${selected.version}</h2>
            <div class="badge-row">${labelBadges(selectedLabels)}</div>
          </div>
        </div>
        <div class="version-meta-strip">
          <strong>${escapeHtml(selected.commit_message || "无提交说明")}</strong>
          <span>·</span>
          <span>${escapeHtml(selected.created_by ?? "system")}</span>
          <span>·</span>
          <span>${escapeHtml(fullDate(selected.created_at))}</span>
        </div>
        <div class="compare-row">
          <label class="hint" for="compareSelect">与其它版本对比：</label>
          <select class="select narrow" id="compareSelect">
            <option value="none">不对比（查看内容）</option>
            ${versions.filter((version) => version.version !== selected.version).map((version) => `<option value="${version.version}" ${String(compare) === String(version.version) ? "selected" : ""}>v${version.version} · ${escapeHtml(version.commit_message || "无提交说明")}</option>`).join("")}
          </select>
        </div>
        <div id="diffHost">${renderContentPreview(prompt, selected)}</div>
      </div>
      <div>
        ${renderLabelPanel(prompt, selected)}
        ${renderVariablesPanel(selected)}
        ${renderHistoryPanel(prompt.id)}
      </div>
    </div>
  `;
}

function renderContentPreview(prompt, version) {
  return `
    <div class="code-panel mb-12">
      <div class="code-panel-head"><span>content</span><span class="mono">${escapeHtml(prompt.type)}</span></div>
      <pre class="code-block">${escapeHtml(pretty(version.content))}</pre>
    </div>
    <div class="code-panel">
      <div class="code-panel-head"><span>model_config</span></div>
      <pre class="code-block">${escapeHtml(JSON.stringify(version.model_config ?? {}, null, 2))}</pre>
    </div>
  `;
}

function renderLabelPanel(prompt, selected) {
  const labels = labelsFor(prompt.id);
  const currentNames = labels.map((label) => label.label);
  const labelOptions = [...new Set([...DEFAULT_LABELS, ...currentNames.filter((label) => label !== "latest")])];
  return `
    <div class="panel panel-section mb-12">
      <div class="inline-actions mb-12">
        <strong class="panel-title">${icon("tag")} 发布标签</strong>
      </div>
      <div class="badge-row mb-12">${labelBadges(labels)}</div>
      <div class="form-row">
        <label class="label" for="publishLabel">Label</label>
        <input class="field mono" id="publishLabel" list="labelList" value="production">
        <datalist id="labelList">${labelOptions.map((label) => `<option value="${escapeHtml(label)}"></option>`).join("")}</datalist>
      </div>
      <div class="form-row mt-8">
        <label class="label" for="publishReason">原因</label>
        <input class="field" id="publishReason" value="Move label to v${selected.version}">
      </div>
      <button class="btn primary mt-10" id="publishButton" type="button">${icon("rocket")}发布 / 回滚到 v${selected.version}</button>
    </div>
  `;
}

function renderVariablesPanel(version) {
  const variables = version.variables ?? [];
  return `
    <div class="panel panel-section mb-12">
      <strong class="panel-title">${icon("code")} 变量 (${variables.length})</strong>
      <div class="badge-row mt-10">
        ${variables.length ? variables.map((name) => `<span class="badge"><code>{{${escapeHtml(name)}}}</code></span>`).join("") : '<span class="hint">该版本没有变量。</span>'}
      </div>
    </div>
  `;
}

function renderHistoryPanel(promptId) {
  const history = state.historyByPrompt.get(promptId) ?? [];
  return `
    <div class="panel panel-section">
      <strong class="panel-title">${icon("history")} 发布历史</strong>
      <div class="timeline spaced">
        ${history.length ? history.map((entry) => `
          <div class="timeline-item">
            <div><span class="badge ${entry.action === "rollback" ? "warning" : "brand"}">${entry.action === "rollback" ? "rollback" : entry.action}</span> <span class="mono">${escapeHtml(entry.label)} → v${entry.to_version}</span></div>
            <p class="item-subtitle">${escapeHtml(entry.reason || "无原因")} · ${escapeHtml(formatDate(entry.created_at))}</p>
          </div>
        `).join("") : '<p class="hint">还没有发布记录。</p>'}
      </div>
    </div>
  `;
}

function bindVersionControls(prompt, selected) {
  const compareSelect = document.getElementById("compareSelect");
  compareSelect?.addEventListener("change", async () => {
    state.compareVersion.set(prompt.id, compareSelect.value);
    await renderDiff(prompt, selected, compareSelect.value);
  });
  const publishButton = document.getElementById("publishButton");
  publishButton?.addEventListener("click", () => publishSelectedVersion(prompt, selected));
  if (compareSelect?.value && compareSelect.value !== "none") {
    renderDiff(prompt, selected, compareSelect.value);
  }
}

async function renderDiff(prompt, selected, baseVersion) {
  const host = document.getElementById("diffHost");
  if (!host) return;
  if (baseVersion === "none") {
    host.innerHTML = renderContentPreview(prompt, selected);
    return;
  }
  const base = versionsFor(prompt.id).find((version) => version.version === Number(baseVersion));
  if (prompt.type === "text" && typeof base?.content === "string" && typeof selected.content === "string") {
    host.innerHTML = `
      <p class="diff-caption">从 v${base.version} 到 v${selected.version} 的变化</p>
      ${renderTextDiff(base.content, selected.content)}
    `;
    return;
  }
  host.innerHTML = '<div class="empty">正在生成结构化 diff...</div>';
  try {
    const diff = await api(`/api/v1/prompts/${prompt.id}/versions/${selected.version}/diff?base_version=${baseVersion}`);
    host.innerHTML = `
      <p class="diff-caption">从 v${baseVersion} 到 v${selected.version} 的变化</p>
      ${renderJsonDiff(diff)}
    `;
  } catch (error) {
    host.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
    toast(error.message, "error");
  }
}

function renderTextDiff(oldText, newText) {
  const lines = diffLines(oldText, newText);
  const added = lines.filter((line) => line.type === "add").length;
  const removed = lines.filter((line) => line.type === "remove").length;
  return `
    <div class="code-panel">
      <div class="code-panel-head"><span>差异对比</span><span><span class="diff-added-stat">+${added}</span> <span class="diff-removed-stat">-${removed}</span></span></div>
      <div>${lines.map((line) => `<div class="diff-line ${line.type}"><span class="diff-sign">${line.type === "add" ? "+" : line.type === "remove" ? "-" : " "}</span><span>${escapeHtml(line.text || " ")}</span></div>`).join("")}</div>
    </div>
  `;
}

function renderJsonDiff(diff) {
  const content = diff.content ?? [];
  const config = diff.model_config ?? [];
  const section = (title, rows) => `
    <div class="code-panel mb-12">
      <div class="code-panel-head"><span>${title}</span><span>${rows.length} changes</span></div>
      ${rows.length ? rows.map((entry) => `
        <div class="diff-line ${entry.kind === "added" ? "add" : entry.kind === "removed" ? "remove" : ""}">
          <span class="diff-sign">${entry.kind === "added" ? "+" : entry.kind === "removed" ? "-" : "~"}</span>
          <span><strong>${escapeHtml(entry.path)}</strong> ${escapeHtml(JSON.stringify(entry.before))} → ${escapeHtml(JSON.stringify(entry.after))}</span>
        </div>
      `).join("") : '<div class="diff-line"><span class="diff-sign"> </span><span>无变化</span></div>'}
    </div>
  `;
  return section("content", content) + section("model_config", config);
}

function diffLines(oldText, newText) {
  const a = oldText.split("\n");
  const b = newText.split("\n");
  const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const result = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      result.push({ type: "equal", text: a[i] });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      result.push({ type: "remove", text: a[i] });
      i += 1;
    } else {
      result.push({ type: "add", text: b[j] });
      j += 1;
    }
  }
  while (i < a.length) result.push({ type: "remove", text: a[i++] });
  while (j < b.length) result.push({ type: "add", text: b[j++] });
  return result;
}

function renderTrashView() {
  const archivedProjects = state.projects.filter(projectArchived);
  const archivedPrompts = [...state.promptsByProject.values()].flat().filter(promptArchived);
  els.main.innerHTML = `
    ${renderTopbar(['<span class="crumb-current">回收站</span>'])}
    <section class="content">
      <div class="view-head">
        <div>
          <h1 class="view-title">回收站</h1>
          <p class="view-meta">已归档的 Project 与 Prompt。当前后端仅支持永久删除。</p>
        </div>
      </div>
      ${archivedProjects.length + archivedPrompts.length === 0 ? '<div class="empty">回收站是空的。</div>' : ""}
      ${renderTrashSection("已归档项目", archivedProjects, "project")}
      ${renderTrashSection("已归档 Prompt", archivedPrompts, "prompt")}
    </section>
  `;
  bindTopbar();
  document.querySelectorAll("[data-delete-kind]").forEach((button) => {
    button.addEventListener("click", () => {
      const item = button.dataset.deleteKind === "project"
        ? state.projects.find((project) => project.id === button.dataset.deleteId)
        : state.promptDetails.get(button.dataset.deleteId);
      openPermanentDelete(button.dataset.deleteKind, item);
    });
  });
}

function renderTrashSection(title, items, kind) {
  if (!items.length) return "";
  return `
    <h2 class="sidebar-title section-heading">${title} (${items.length})</h2>
    <div class="table-shell">
      <table class="table">
        <tbody>
          ${items.map((item) => `
            <tr>
              <td>
                <div class="item-title">${escapeHtml(item.name)}</div>
                <div class="item-subtitle">${kind === "prompt" ? escapeHtml(item.prompt_key) : escapeHtml(item.id)} · 归档于 ${escapeHtml(formatDate(item.archived_at))}</div>
              </td>
              <td class="action-cell"><button class="btn danger" data-delete-kind="${kind}" data-delete-id="${item.id}" type="button">${icon("trash")}永久删除</button></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function modal(title, body, footer, size = "") {
  els.modalRoot.innerHTML = `
    <div class="modal-backdrop">
      <section class="modal ${size}" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
        <div class="modal-head">
          <h2 class="modal-title">${escapeHtml(title)}</h2>
          <button class="btn ghost icon" id="modalClose" type="button">${icon("x")}</button>
        </div>
        <div class="modal-body">${body}</div>
        <div class="modal-foot">${footer}</div>
      </section>
    </div>
  `;
  document.getElementById("modalClose").addEventListener("click", closeModal);
}

function closeModal() {
  els.modalRoot.innerHTML = "";
}

function openProjectModal(project) {
  const editing = Boolean(project && typeof project.id === "string");
  modal(
    editing ? "编辑项目" : "新建项目",
    `
      <form id="projectForm" class="form-grid">
        <div class="form-row full">
          <label class="label" for="projectName">名称</label>
          <input class="field" id="projectName" maxlength="128" value="${escapeHtml(project?.name ?? "")}" required>
        </div>
        <div class="form-row full">
          <label class="label" for="projectDescription">描述</label>
          <textarea class="textarea" id="projectDescription" maxlength="10000">${escapeHtml(project?.description ?? "")}</textarea>
        </div>
      </form>
    `,
    `<button class="btn ghost" id="cancelModal" type="button">取消</button><button class="btn primary" id="saveProject" type="button">${editing ? "保存" : "创建"}</button>`,
    "small",
  );
  document.getElementById("cancelModal").addEventListener("click", closeModal);
  document.getElementById("saveProject").addEventListener("click", async () => {
    const payload = {
      name: document.getElementById("projectName").value.trim(),
      description: document.getElementById("projectDescription").value.trim(),
    };
    if (!payload.name) return toast("项目名称不能为空。", "error");
    await runTask(async () => {
      if (editing) await api(`/api/v1/projects/${project.id}`, { method: "PATCH", body: payload });
      else {
        const created = await api("/api/v1/projects", { method: "POST", body: payload });
        state.view = { type: "project", projectId: created.id, tab: "prompts" };
      }
      closeModal();
      await refreshAll();
    }, editing ? "项目已更新" : "项目已创建");
  });
}

function openPromptModal(projectId) {
  modal(
    "新建 Prompt",
    `
      <form id="promptForm" class="form-grid">
        <div class="form-row">
          <label class="label" for="promptKey">prompt_key</label>
          <input class="field mono" id="promptKey" placeholder="customer-answer" required>
        </div>
        <div class="form-row">
          <label class="label" for="promptType">类型</label>
          <select class="select" id="promptType"><option value="text">text</option><option value="chat">chat</option></select>
        </div>
        <div class="form-row">
          <label class="label" for="promptName">名称</label>
          <input class="field" id="promptName" required>
        </div>
        <div class="form-row">
          <label class="label" for="promptCommit">初始提交说明</label>
          <input class="field" id="promptCommit" value="Initial version">
        </div>
        <div class="form-row full">
          <label class="label" for="promptDescription">描述</label>
          <textarea class="textarea" id="promptDescription"></textarea>
        </div>
        <div class="form-row full">
          <label class="label" for="promptContent">内容</label>
          <textarea class="textarea mono tall" id="promptContent" placeholder="text: 直接输入文本；chat: 输入 JSON 消息数组" required></textarea>
          <p class="hint">变量写作 {{name}}。chat 类型示例：[{"role":"system","content":"你是 {{role}}"}]</p>
        </div>
        <div class="form-row full">
          <label class="label" for="promptModelConfig">model_config JSON</label>
          <textarea class="textarea mono" id="promptModelConfig">{}</textarea>
        </div>
      </form>
    `,
    '<button class="btn ghost" id="cancelModal" type="button">取消</button><button class="btn primary" id="savePrompt" type="button">创建</button>',
  );
  document.getElementById("cancelModal").addEventListener("click", closeModal);
  document.getElementById("savePrompt").addEventListener("click", async () => {
    await runTask(async () => {
      const type = document.getElementById("promptType").value;
      const contentRaw = document.getElementById("promptContent").value;
      const payload = {
        prompt_key: document.getElementById("promptKey").value.trim(),
        name: document.getElementById("promptName").value.trim(),
        description: document.getElementById("promptDescription").value.trim(),
        type,
        content: type === "chat" ? parseJson(contentRaw, "chat 内容") : contentRaw,
        model_config: parseJson(document.getElementById("promptModelConfig").value || "{}", "model_config"),
        commit_message: document.getElementById("promptCommit").value.trim() || null,
      };
      const created = await api(`/api/v1/projects/${projectId}/prompts`, { method: "POST", body: payload });
      closeModal();
      await loadProjectPrompts(projectId);
      await loadPrompt(created.id, true);
      state.view = { type: "prompt", promptId: created.id };
    }, "Prompt 已创建");
  });
}

function openPromptEditModal(prompt) {
  if (!prompt) return;
  modal(
    "编辑 Prompt",
    `
      <div class="form-grid">
        <div class="form-row full">
          <label class="label" for="editPromptName">名称</label>
          <input class="field" id="editPromptName" value="${escapeHtml(prompt.name)}">
        </div>
        <div class="form-row full">
          <label class="label" for="editPromptDescription">描述</label>
          <textarea class="textarea" id="editPromptDescription">${escapeHtml(prompt.description ?? "")}</textarea>
        </div>
      </div>
    `,
    '<button class="btn ghost" id="cancelModal" type="button">取消</button><button class="btn primary" id="savePromptEdit" type="button">保存</button>',
    "small",
  );
  document.getElementById("cancelModal").addEventListener("click", closeModal);
  document.getElementById("savePromptEdit").addEventListener("click", async () => {
    const payload = {
      name: document.getElementById("editPromptName").value.trim(),
      description: document.getElementById("editPromptDescription").value.trim(),
    };
    await runTask(async () => {
      await api(`/api/v1/prompts/${prompt.id}`, { method: "PATCH", body: payload });
      closeModal();
      await loadProjectPrompts(prompt.project_id);
      await loadPrompt(prompt.id, true);
    }, "Prompt 已更新");
  });
}

function openVersionModal(prompt, base) {
  const content = base ? pretty(base.content) : "";
  const config = base ? JSON.stringify(base.model_config ?? {}, null, 2) : "{}";
  modal(
    `新建版本 · ${prompt.name}`,
    `
      <div class="form-grid">
        <div class="form-row full">
          <label class="label" for="versionContent">content</label>
          <textarea class="textarea mono taller" id="versionContent">${escapeHtml(content)}</textarea>
          <p class="hint">${prompt.type === "text" ? "text 类型将保存为字符串。" : "chat 类型必须是 JSON 消息数组。"}</p>
        </div>
        <div class="form-row full">
          <label class="label" for="versionModelConfig">model_config JSON</label>
          <textarea class="textarea mono" id="versionModelConfig">${escapeHtml(config)}</textarea>
        </div>
        <div class="form-row full">
          <label class="label" for="versionCommit">提交说明</label>
          <input class="field" id="versionCommit" placeholder="What changed">
        </div>
      </div>
    `,
    '<button class="btn ghost" id="cancelModal" type="button">取消</button><button class="btn primary" id="saveVersion" type="button">创建版本</button>',
  );
  document.getElementById("cancelModal").addEventListener("click", closeModal);
  document.getElementById("saveVersion").addEventListener("click", async () => {
    await runTask(async () => {
      const raw = document.getElementById("versionContent").value;
      const payload = {
        content: prompt.type === "chat" ? parseJson(raw, "chat 内容") : raw,
        model_config: parseJson(document.getElementById("versionModelConfig").value || "{}", "model_config"),
        commit_message: document.getElementById("versionCommit").value.trim() || null,
      };
      const created = await api(`/api/v1/prompts/${prompt.id}/versions`, { method: "POST", body: payload });
      closeModal();
      await loadPrompt(prompt.id, true);
      state.selectedVersion.set(prompt.id, created.version);
    }, "新版本已创建");
  });
}

function openTokenModal(projectId) {
  modal(
    "新建 API Token",
    `
      <form id="tokenForm" class="form-row">
        <label class="label" for="tokenName">名称</label>
        <input class="field mono" id="tokenName" placeholder="production-client" required>
      </form>
      <div id="newTokenBox"></div>
    `,
    '<button class="btn ghost" id="cancelModal" type="button">取消</button><button class="btn primary" id="saveToken" type="submit" form="tokenForm">创建</button>',
    "small",
  );
  document.getElementById("cancelModal").addEventListener("click", closeModal);
  document.getElementById("tokenForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = document.getElementById("tokenName").value.trim();
    if (!name) return toast("Token 名称不能为空。", "error");
    await runTask(async () => {
      const token = await api(`/api/v1/projects/${projectId}/api-tokens`, { method: "POST", body: { name } });
      state.tokensByProject.delete(projectId);
      await ensureTokens(projectId);
      const box = document.getElementById("newTokenBox");
      box.innerHTML = `<div class="new-token token-box"><strong>请立即复制，Token 仅显示一次。</strong><pre class="code-block loose">${escapeHtml(token.token)}</pre><button class="btn" id="copyNewToken" type="button">${icon("copy")}复制</button></div>`;
      document.getElementById("copyNewToken").addEventListener("click", () => copyText(token.token));
      toast("Token 已创建", "success");
      render();
    });
  });
}

function openPermanentDelete(kind, item) {
  if (!item) return;
  const name = item.name;
  modal(
    kind === "project" ? "永久删除项目" : "永久删除 Prompt",
    `
      <p class="hint confirm-copy">此操作不可恢复。请输入名称 <strong class="mono">${escapeHtml(name)}</strong> 以确认。</p>
      <input class="field mono" id="deleteConfirm" placeholder="${escapeHtml(name)}">
    `,
    '<button class="btn ghost" id="cancelModal" type="button">取消</button><button class="btn danger" id="confirmDelete" type="button" disabled>永久删除</button>',
    "small",
  );
  const input = document.getElementById("deleteConfirm");
  const confirm = document.getElementById("confirmDelete");
  document.getElementById("cancelModal").addEventListener("click", closeModal);
  input.addEventListener("input", () => {
    confirm.disabled = input.value !== name;
  });
  confirm.addEventListener("click", async () => {
    await runTask(async () => {
      if (kind === "project") await api(`/api/v1/projects/${item.id}/permanent`, { method: "DELETE" });
      else await api(`/api/v1/prompts/${item.id}/permanent`, { method: "DELETE" });
      closeModal();
      await refreshAll();
      state.view = { type: "trash" };
    }, "已永久删除");
  });
}

async function archiveProject(project) {
  await runTask(async () => {
    await api(`/api/v1/projects/${project.id}`, { method: "DELETE" });
    await refreshAll();
    state.view = { type: "trash" };
  }, "项目已归档");
}

async function archivePrompt(prompt, projectId) {
  if (!prompt) return;
  await runTask(async () => {
    await api(`/api/v1/prompts/${prompt.id}`, { method: "DELETE" });
    await loadProjectPrompts(projectId);
    state.view = { type: "project", projectId, tab: "prompts" };
  }, "Prompt 已归档");
}

async function revokeToken(projectId, tokenId) {
  await runTask(async () => {
    await api(`/api/v1/projects/${projectId}/api-tokens/${tokenId}`, { method: "DELETE" });
    state.tokensByProject.delete(projectId);
    await ensureTokens(projectId);
  }, "Token 已吊销并从列表移除");
}

async function publishSelectedVersion(prompt, version) {
  const label = document.getElementById("publishLabel").value.trim();
  const reason = document.getElementById("publishReason").value.trim() || null;
  if (!label) return toast("Label 不能为空。", "error");
  if (label === "latest") return toast("latest 由系统维护，不能手动发布。", "error");
  const current = labelsFor(prompt.id).find((item) => item.label === label);
  const isRollback = current && version.version < current.version;
  await runTask(async () => {
    await api(`/api/v1/prompts/${prompt.id}/labels/${encodeURIComponent(label)}${isRollback ? "/rollback" : ""}`, {
      method: isRollback ? "POST" : "PUT",
      body: {
        version: version.version,
        expected_current_version: current?.version ?? null,
        reason,
      },
    });
    await loadPrompt(prompt.id, true);
  }, isRollback ? `已回滚 ${label} 到 v${version.version}` : `已发布 ${label} 到 v${version.version}`);
}

async function copyText(value) {
  try {
    if (!navigator.clipboard?.writeText) {
      throw new Error("Clipboard API unavailable.");
    }
    await navigator.clipboard.writeText(value);
    toast("已复制到剪贴板", "success");
  } catch {
    if (fallbackCopyText(value)) {
      toast("已复制到剪贴板", "success");
    } else {
      toast("复制失败，请手动选择文本。", "error");
    }
  }
}

function fallbackCopyText(value) {
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.className = "clipboard-fallback";
  document.body.append(textarea);
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);
  try {
    return document.execCommand("copy");
  } finally {
    textarea.remove();
  }
}

function boot() {
  document.addEventListener("click", () => closeMenus());
  window.addEventListener("resize", () => closeMenus());
  window.addEventListener("scroll", () => closeMenus(), true);
  const stored = sessionStorage.getItem(SESSION_TOKEN_KEY);
  if (stored) {
    setToken(stored, true);
    refreshAll();
  } else {
    render();
  }
}

boot();
