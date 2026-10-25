"use strict";

const apiBaseUrl = String(window.APP_CONFIG && window.APP_CONFIG.API_BASE_URL || "").replace(/\/+$/, "");

async function api(path, options = {}) {
  const response = await fetch(`${apiBaseUrl}/api${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { error: text }; }
  if (!response.ok) throw new Error(body.error || "The request could not be completed.");
  return body;
}

function replaceTokens(root, values) {
  root.innerHTML = root.innerHTML.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_, key) => values[key] ?? "");
}

function renderHeader(user) {
  const target = document.querySelector(".header-actions");
  if (!target) return;
  target.innerHTML = user
    ? `<a class="text-button" href="${user.role === "tourist" ? "/profile" : "/dashboard"}">Hi, ${escapeHtml(user.name)}</a><button class="button button-dark" id="logout-button" type="button">Sign out</button>`
    : '<a class="button button-dark" href="/account">Sign in</a>';
  document.querySelector("#logout-button")?.addEventListener("click", async () => {
    await api("/auth/logout", { method: "POST", body: "{}" });
    window.location.href = "/";
  });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

async function renderHome(user) {
  const main = document.querySelector("main");
  if (!main || !document.querySelector(".destination-grid")) return;
  const params = new URLSearchParams(window.location.search);
  const query = new URLSearchParams();
  for (const key of ["q", "state", "category", "maxFee", "sort"]) {
    if (params.get(key)) query.set(key, params.get(key));
  }
  const data = await api(`/destinations?${query}`);
  const grid = document.querySelector(".destination-grid");
  grid.innerHTML = data.destinations.map((destination) => `
    <a class="destination-card" href="/destination.html?id=${destination.id}">
      <img src="${escapeHtml(destination.imageUrl)}" alt="${escapeHtml(destination.name)}">
      <div class="destination-card-content"><span class="eyebrow">${escapeHtml(destination.state)}</span>
      <h3>${escapeHtml(destination.name)}</h3><p>${escapeHtml(destination.description)}</p>
      <span class="underlined-link">Explore this place ↗</span></div>
    </a>`).join("");
  const count = document.querySelector(".results-meta p");
  if (count) count.textContent = `${data.destinations.length} places to explore`;
  document.querySelectorAll(".search-form input, .search-form select").forEach((element) => {
    const value = params.get(element.name);
    if (value !== null) element.value = value;
  });
  replaceTokens(document.body, {});
  renderHeader(user);
}

function renderAccount() {
  const main = document.querySelector(".account-page");
  if (!main) return;
  const register = new URLSearchParams(window.location.search).get("mode") === "register";
  main.querySelector("h1").textContent = register ? "Create your account." : "Welcome back.";
  main.querySelector(".page-intro").textContent = register
    ? "Save your places, plan your trip, and keep every detail in one place."
    : "Sign in to keep planning your next chapter.";
  const form = document.createElement("form");
  form.className = "form-panel";
  form.innerHTML = register
    ? '<label class="form-label" for="name">Name</label><input class="form-input" id="name" name="name" required minlength="2"><label class="form-label" for="email">Email</label><input class="form-input" id="email" name="email" type="email" required><label class="form-label" for="phone">Phone</label><input class="form-input" id="phone" name="phone" required minlength="7"><label class="form-label" for="password">Password</label><input class="form-input" id="password" name="password" type="password" required minlength="10"><button class="button button-dark form-submit">Create account ↗</button>'
    : '<label class="form-label" for="email">Email</label><input class="form-input" id="email" name="email" type="email" required><label class="form-label" for="password">Password</label><input class="form-input" id="password" name="password" type="password" required minlength="10"><button class="button button-dark form-submit">Sign in ↗</button>';
  const oldForm = main.querySelector(".form-panel");
  if (oldForm) oldForm.replaceWith(form); else main.append(form);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(form));
    try {
      await api(register ? "/auth/register" : "/auth/login", { method: "POST", body: JSON.stringify(payload) });
      window.location.href = "/";
    } catch (error) {
      let notice = main.querySelector(".page-notice");
      if (!notice) { notice = document.createElement("p"); notice.className = "page-notice"; main.prepend(notice); }
      notice.textContent = error.message;
    }
  });
}

async function renderDestination(user) {
  const id = new URLSearchParams(window.location.search).get("id");
  if (!id || !document.querySelector(".detail-image")) return;
  const data = await api(`/destinations/${encodeURIComponent(id)}`);
  const destination = data.destination;
  document.title = `${destination.name} · Smart Tourist Guide System`;
  document.querySelector("main").innerHTML = `<section class="section-wrap"><a class="underlined-link" href="/index.html">← Back to all places</a><span class="eyebrow section-eyebrow">${escapeHtml(destination.state)}</span><h1>${escapeHtml(destination.name)}</h1><p class="page-intro">${escapeHtml(destination.description)}</p><img class="destination-hero-image" src="${escapeHtml(destination.imageUrl)}" alt="${escapeHtml(destination.name)}"><h2>Local stays and places</h2><div class="destination-grid">${[...destination.hotels, ...destination.places, ...destination.restaurants].map((item) => `<article class="destination-card"><div class="destination-card-content"><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.address || item.type || item.cuisine || "")}</p></div></article>`).join("")}</div></section>`;
  renderHeader(user);
}

(async () => {
  try {
    const session = await api("/auth/session");
    renderHeader(session.user);
    renderAccount();
    await renderHome(session.user);
    await renderDestination(session.user);
  } catch (error) {
    const notice = document.querySelector(".page-notice");
    if (notice) notice.textContent = error.message;
    else console.error(error);
  }
})();
