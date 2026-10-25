"use strict";

const apiBaseUrl = String(window.APP_CONFIG && window.APP_CONFIG.API_BASE_URL || "").replace(/\/+$/, "");

const CATEGORY_LABELS = {
  mountains: "Hill Station",
  heritage: "Heritage & Culture",
  beach: "Beaches & Coastal",
  nature: "Nature & Wildlife",
  spiritual: "Spiritual",
};

const STATES_LIST = [
  "Maharashtra",
  "Rajasthan",
  "Goa",
  "Himachal Pradesh",
  "Kerala",
  "Karnataka",
  "Punjab",
];

// Local Cart helper functions
function getLocalCart() {
  try {
    const raw = localStorage.getItem("roam_cart");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalCart(cart) {
  try {
    localStorage.setItem("roam_cart", JSON.stringify(cart));
  } catch (e) {
    console.warn("Unable to save cart to localStorage", e);
  }
}

function addToLocalCart(item) {
  const cart = getLocalCart();
  const id = "item_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
  cart.push({ ...item, id });
  saveLocalCart(cart);
  return id;
}

function removeFromLocalCart(id) {
  const cart = getLocalCart().filter((item) => item.id !== id);
  saveLocalCart(cart);
  return cart;
}

function clearLocalCart() {
  try {
    localStorage.removeItem("roam_cart");
  } catch {}
}

async function api(path, options = {}) {
  const response = await fetch(`${apiBaseUrl}/api${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { error: text };
  }
  if (!response.ok) {
    throw new Error(body.error || "The request could not be completed.");
  }
  return body;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function formatCurrency(amount) {
  return "₹" + Number(amount || 0).toLocaleString("en-IN");
}

function renderHeader(user) {
  const target = document.querySelector(".header-actions");
  if (!target) return;
  const cart = getLocalCart();
  const cartBadge = cart.length ? ` (${cart.length})` : "";
  const cartLink = `<a class="header-link" href="/cart.html">Cart${cartBadge}</a>`;

  if (user) {
    const firstName = escapeHtml(String(user.name || "Profile").trim().split(/\s+/)[0]);
    const management = ["administrator", "system_administrator"].includes(user.role)
      ? '<a class="text-button" href="/admin.html">Dashboard</a>'
      : "";
    target.innerHTML = `
      ${cartLink}
      ${management}
      <a class="text-button" href="/profile.html">Hi, ${firstName}</a>
      <a class="text-button header-secondary" href="/bookings.html">My trips</a>
      <button class="button button-dark" id="logout-button" type="button">Sign out</button>
    `;
    document.querySelector("#logout-button")?.addEventListener("click", async () => {
      try {
        await api("/auth/logout", { method: "POST", body: "{}" });
      } catch (e) {
        console.error("Sign out error", e);
      }
      window.location.href = "/";
    });
  } else {
    target.innerHTML = `
      ${cartLink}
      <a class="button button-dark" href="/account.html">Sign in</a>
    `;
  }
}

// ----------------------------------------------------
// 1. HOME PAGE
// ----------------------------------------------------
async function renderHome(user) {
  const grid = document.querySelector(".destination-grid");
  if (!grid) return;

  const params = new URLSearchParams(window.location.search);
  const stateSelect = document.querySelector('select[name="state"]');
  const categorySelect = document.querySelector('select[name="category"]');
  const sortSelect = document.querySelector('select[name="sort"]');
  const pillsContainer = document.querySelector(".category-pills");
  const feeInput = document.querySelector('#maxFee, input[name="maxFee"]');
  const feeDisplay = document.querySelector("#fee-display, .fee-filter strong");

  // Populate State options
  if (stateSelect && stateSelect.children.length <= 1) {
    stateSelect.innerHTML = `<option value="">All States</option>` +
      STATES_LIST.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("");
  }

  // Populate Category options
  if (categorySelect && categorySelect.children.length <= 1) {
    categorySelect.innerHTML = `<option value="">Every category</option>` +
      Object.entries(CATEGORY_LABELS).map(([val, label]) => `<option value="${escapeHtml(val)}">${escapeHtml(label)}</option>`).join("");
  }

  // Populate Category pills
  if (pillsContainer) {
    const selectedCat = params.get("category") || "";
    const pills = Object.entries(CATEGORY_LABELS).map(([cat, label]) => {
      const q = new URLSearchParams(window.location.search);
      q.set("category", cat);
      return `<a class="category-pill${selectedCat === cat ? " is-active" : ""}" href="/index.html?${q.toString()}#destinations">${escapeHtml(label)}</a>`;
    });
    pillsContainer.innerHTML = `<a class="category-pill${!selectedCat ? " is-active" : ""}" href="/index.html#destinations">Everything</a>` + pills.join("");
  }

  // Set initial form field values from URL
  document.querySelectorAll(".search-form input, .search-form select").forEach((element) => {
    const val = params.get(element.name);
    if (val !== null) element.value = val;
  });

  // Range slider live feedback
  if (feeInput && feeDisplay) {
    const updateFeeText = () => {
      const v = Number(feeInput.value);
      feeDisplay.textContent = v >= 2000 ? "₹2,000+" : `₹${v.toLocaleString("en-IN")}`;
    };
    updateFeeText();
    feeInput.addEventListener("input", updateFeeText);
  }

  // Query Destinations
  const query = new URLSearchParams();
  for (const key of ["q", "state", "category", "maxFee", "sort"]) {
    const val = params.get(key);
    if (val) query.set(key, val);
  }

  try {
    const data = await api(`/destinations?${query.toString()}`);
    const destinations = data.destinations || [];

    const count = document.querySelector(".results-meta p");
    if (count) {
      count.textContent = `${destinations.length} places to explore`;
    }

    if (!destinations.length) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <span aria-hidden="true">✳</span>
          <h3>No matching destinations found</h3>
          <p>Try searching for a different keyword or resetting your filters.</p>
          <a class="button button-dark" href="/index.html">Reset filters</a>
        </div>
      `;
      return;
    }

    grid.innerHTML = destinations.map((d) => `
      <article class="destination-card">
        <a class="card-link" href="/destination.html?id=${encodeURIComponent(d.id)}" aria-label="Discover ${escapeHtml(d.name)}">
          <div class="card-image-wrap">
            <img class="card-image" src="${escapeHtml(d.imageUrl)}" alt="${escapeHtml(d.name)}" loading="lazy">
            <span class="card-category">${escapeHtml(CATEGORY_LABELS[d.category] || d.category)}</span>
            <span class="card-arrow" aria-hidden="true">↗</span>
          </div>
          <div class="card-content">
            <p class="card-location">${escapeHtml(d.state || d.location)}</p>
            <h3>${escapeHtml(d.name)}</h3>
            <p class="card-description">${escapeHtml(d.description)}</p>
            <div class="card-foot">
              <span class="card-rating"><span>★ </span>${Number(d.rating || 4.5).toFixed(1)}</span>
              <span>${Number(d.entryFee) > 0 ? `Entry from ${formatCurrency(d.entryFee)}` : "Free to explore"}</span>
            </div>
          </div>
        </a>
      </article>
    `).join("");
  } catch (err) {
    grid.innerHTML = `<p class="page-notice" role="alert">Unable to load destinations: ${escapeHtml(err.message)}</p>`;
  }
}

// ----------------------------------------------------
// 2. DESTINATION DETAIL PAGE
// ----------------------------------------------------
async function renderDestination(user) {
  const container = document.querySelector("#destination-container");
  if (!container) return;

  const urlParams = new URLSearchParams(window.location.search);
  let id = urlParams.get("id");
  if (!id) {
    const match = window.location.pathname.match(/\/destinations\/(\d+)/);
    if (match) id = match[1];
  }

  if (!id) {
    container.innerHTML = `<p class="page-notice">No destination specified. <a class="underlined-link" href="/">Return to explore</a></p>`;
    return;
  }

  try {
    const data = await api(`/destinations/${encodeURIComponent(id)}`);
    const d = data.destination;
    document.title = `${d.name} · Smart Tourist Guide System`;

    const hotels = d.hotels || [];
    const places = d.places || [];
    const restaurants = d.restaurants || [];
    const reviews = d.reviews || [];

    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    const hotelsMarkup = hotels.length
      ? hotels.map((h) => `
        <article class="listing">
          <strong>${escapeHtml(h.name)}</strong>
          <span>${escapeHtml(h.address || "Local stay")} ${h.rating ? `· ★ ${Number(h.rating).toFixed(1)}` : ""}</span>
          <span>${escapeHtml(h.amenities || "Comfortable accommodation")}</span>
          <span class="listing-price">${formatCurrency(h.pricePerNight)} <small>per room / night</small> · ${h.availableRooms || 5} rooms available</span>
          <form class="listing-form" data-service-type="hotel" data-service-id="${h.id}" data-service-name="${escapeHtml(h.name)}" data-unit-price="${h.pricePerNight}">
            <label class="form-label">Check-in</label>
            <input class="form-input" name="bookingDate" type="date" min="${today}" value="${today}" required>
            <label class="form-label">Check-out</label>
            <input class="form-input" name="checkOut" type="date" min="${tomorrow}" value="${tomorrow}" required>
            <label class="form-label">Rooms</label>
            <input class="form-input" name="quantity" type="number" min="1" max="10" value="1" required>
            <label class="form-label">Guests</label>
            <input class="form-input" name="guestCount" type="number" min="1" max="20" value="2" required>
            <button class="button button-dark" type="submit">Add stay to cart <span aria-hidden="true">↗</span></button>
          </form>
        </article>
      `).join("")
      : '<p class="modal-note">Stays in this area will be available shortly.</p>';

    const placesMarkup = places.length
      ? places.map((p) => `
        <article class="listing">
          <strong>${escapeHtml(p.name)}</strong>
          <span>${escapeHtml(p.type || "Attraction")} ${p.timings ? `· ${escapeHtml(p.timings)}` : ""}</span>
          <span>${escapeHtml(p.historicalNotes || "")}</span>
          <span class="listing-price">${Number(p.entryFee) > 0 ? formatCurrency(p.entryFee) : "Free entry"} <small>per ticket</small></span>
          <form class="listing-form" data-service-type="place" data-service-id="${p.id}" data-service-name="${escapeHtml(p.name)}" data-unit-price="${p.entryFee}">
            <label class="form-label">Visit date</label>
            <input class="form-input" name="bookingDate" type="date" min="${today}" value="${today}" required>
            <label class="form-label">Tickets</label>
            <input class="form-input" name="quantity" type="number" min="1" max="20" value="1" required>
            <label class="form-label">Guests</label>
            <input class="form-input" name="guestCount" type="number" min="1" max="20" value="1" required>
            <button class="button button-dark" type="submit">Add tickets to cart <span aria-hidden="true">↗</span></button>
          </form>
        </article>
      `).join("")
      : '<p class="modal-note">Attractions will be listed shortly.</p>';

    const restaurantsMarkup = restaurants.length
      ? restaurants.map((r) => `
        <article class="listing">
          <strong>${escapeHtml(r.name)}</strong>
          <span>${escapeHtml(r.cuisine || "Local dining")} ${r.rating ? `· ★ ${Number(r.rating).toFixed(1)}` : ""}</span>
          <span>${escapeHtml(r.address || "")} ${r.operatingHours ? `· ${escapeHtml(r.operatingHours)}` : ""}</span>
          <span class="listing-price">${formatCurrency(r.averageCost)} <small>average for two</small></span>
          <form class="listing-form" data-service-type="restaurant" data-service-id="${r.id}" data-service-name="${escapeHtml(r.name)}" data-unit-price="${r.averageCost}">
            <label class="form-label">Reservation date</label>
            <input class="form-input" name="bookingDate" type="date" min="${today}" value="${today}" required>
            <label class="form-label">Tables</label>
            <input class="form-input" name="quantity" type="number" min="1" max="5" value="1" required>
            <label class="form-label">Guests</label>
            <input class="form-input" name="guestCount" type="number" min="1" max="15" value="2" required>
            <button class="button button-dark" type="submit">Reserve table <span aria-hidden="true">↗</span></button>
          </form>
        </article>
      `).join("")
      : '<p class="modal-note">Dining suggestions will be updated shortly.</p>';

    const reviewsMarkup = reviews.length
      ? reviews.map((rev) => `
        <article class="review-item">
          <strong>${escapeHtml(rev.touristName || "Traveler")}</strong>
          <span>${"★".repeat(Math.round(rev.rating || 5))} ${Number(rev.rating).toFixed(1)}/5</span>
          <p>${escapeHtml(rev.comment || "")}</p>
        </article>
      `).join("")
      : '<p class="modal-note">No stories yet. Be the first traveler to share your experience!</p>';

    container.innerHTML = `
      <img class="detail-image" src="${escapeHtml(d.imageUrl)}" alt="${escapeHtml(d.name)}">
      <p class="detail-location">${escapeHtml(d.state || d.location)} · ${escapeHtml(CATEGORY_LABELS[d.category] || d.category)}</p>
      <h1 class="page-title">${escapeHtml(d.name)}</h1>
      <p class="detail-description">${escapeHtml(d.description)}</p>

      <div class="detail-facts">
        <span class="detail-fact"><strong>Best Season:</strong> ${escapeHtml(d.bestSeason || "All year round")}</span>
        <span class="detail-fact"><strong>Climate:</strong> ${escapeHtml(d.climate || "Pleasant")}</span>
        <span class="detail-fact"><strong>Entry Fee:</strong> ${Number(d.entryFee) > 0 ? formatCurrency(d.entryFee) : "Free"}</span>
        <span class="detail-fact"><strong>Rating:</strong> ★ ${Number(d.rating || 4.5).toFixed(1)}</span>
      </div>

      <nav class="destination-tabs" aria-label="Destination sections">
        <a href="#overview">Overview & heritage</a>
        <a href="#hotels">Hotels & stays</a>
        <a href="#places">Places & attractions</a>
        <a href="#restaurants">Dining</a>
        <a href="#reviews">Reviews</a>
      </nav>

      <section class="overview-panel" id="overview">
        <h2 class="subheading">A little more about this place</h2>
        <p><strong>Highlights:</strong> ${escapeHtml(d.highlights || "Local sights, viewpoints, and cultural spots.")}</p>
        <p><strong>Heritage & Culture:</strong> ${escapeHtml(d.heritageNotes || "Rich historical traditions and warm local hospitality.")}</p>
      </section>

      <div class="detail-columns">
        <section class="detail-group" id="hotels">
          <h2>Hotels & stays</h2>
          ${hotelsMarkup}
        </section>
        <section class="detail-group" id="places">
          <h2>Places & attractions</h2>
          ${placesMarkup}
        </section>
        <section class="detail-group" id="restaurants">
          <h2>Dining & restaurants</h2>
          ${restaurantsMarkup}
        </section>
      </div>

      <section class="review-list" id="reviews">
        <h2 class="subheading">Stories from the road</h2>
        ${reviewsMarkup}

        <form class="review-form form-panel" id="review-submission-form">
          <h3>Leave a little story of your own</h3>
          <label class="form-label" for="review-rating">Your rating</label>
          <select class="form-input" id="review-rating" name="rating" required>
            <option value="5">5 — Loved every minute</option>
            <option value="4">4 — A lovely place</option>
            <option value="3">3 — Glad I went</option>
            <option value="2">2 — Not quite my place</option>
            <option value="1">1 — Not for me</option>
          </select>
          <label class="form-label" for="review-comment">Your story</label>
          <textarea class="form-input" id="review-comment" name="comment" maxlength="1000" required placeholder="Share a little about your time here…"></textarea>
          <button class="button button-dark" type="submit">Share your story <span aria-hidden="true">↗</span></button>
          <p class="modal-note">Sign in is recommended to post verified reviews.</p>
        </form>
      </section>
    `;

    // Listen for add-to-cart on listing forms
    container.querySelectorAll(".listing-form").forEach((form) => {
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        const item = {
          destinationId: d.id,
          destinationName: d.name,
          serviceType: form.dataset.serviceType,
          serviceId: form.dataset.serviceId,
          serviceName: form.dataset.serviceName,
          unitPrice: Number(form.dataset.unitPrice || 0),
          bookingDate: fd.get("bookingDate"),
          checkOut: fd.get("checkOut") || null,
          quantity: Number(fd.get("quantity") || 1),
          guestCount: Number(fd.get("guestCount") || 1),
        };
        addToLocalCart(item);
        renderHeader(user);
        const notice = document.querySelector("#destination-notice");
        if (notice) {
          notice.innerHTML = `<p class="page-notice">Added "<strong>${escapeHtml(item.serviceName)}</strong>" to your cart! <a class="underlined-link" href="/cart.html">View cart & checkout</a></p>`;
          window.scrollTo({ top: notice.offsetTop - 80, behavior: "smooth" });
        }
      });
    });

    // Review form handling
    document.querySelector("#review-submission-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const rating = Number(document.querySelector("#review-rating").value);
      const comment = document.querySelector("#review-comment").value;
      const notice = document.querySelector("#destination-notice");
      try {
        await api(`/destinations/${encodeURIComponent(d.id)}/reviews`, {
          method: "POST",
          body: JSON.stringify({ rating, comment }),
        });
        if (notice) notice.innerHTML = `<p class="page-notice">Thank you for sharing your story! Your review has been submitted.</p>`;
      } catch (err) {
        if (notice) notice.innerHTML = `<p class="page-notice" role="alert">Please sign in to submit a verified review.</p>`;
      }
    });

  } catch (err) {
    container.innerHTML = `<p class="page-notice" role="alert">Could not load destination details: ${escapeHtml(err.message)}</p>`;
  }
}

// ----------------------------------------------------
// 3. CART PAGE
// ----------------------------------------------------
function renderCart(user) {
  const container = document.querySelector("#cart-items-container");
  const summaryContainer = document.querySelector("#cart-summary-container");
  if (!container) return;

  const cart = getLocalCart();

  if (!cart.length) {
    container.innerHTML = `
      <section class="empty-state">
        <span aria-hidden="true">✳</span>
        <h2>Your cart is ready for an idea.</h2>
        <p>Explore destinations and add a stay, attraction, or restaurant experience.</p>
        <a class="button button-dark" href="/">Explore destinations</a>
      </section>
    `;
    if (summaryContainer) summaryContainer.innerHTML = "";
    return;
  }

  let grandTotal = 0;

  container.innerHTML = cart.map((item) => {
    const nights = item.serviceType === "hotel" && item.checkOut
      ? Math.max(1, Math.round((Date.parse(`${item.checkOut}T00:00:00Z`) - Date.parse(`${item.bookingDate}T00:00:00Z`)) / 86400000))
      : 1;
    const itemTotal = Number(item.unitPrice || 0) * Number(item.quantity || 1) * nights;
    grandTotal += itemTotal;

    return `
      <article class="cart-item">
        <div class="cart-item-details">
          <span class="eyebrow section-eyebrow">${escapeHtml(item.destinationName)}</span>
          <h2>${escapeHtml(item.serviceName)}</h2>
          <p>${item.serviceType === "hotel" ? "Stay" : item.serviceType === "place" ? "Attraction" : "Dining"} · ${escapeHtml(item.bookingDate)}${item.checkOut ? ` to ${escapeHtml(item.checkOut)}` : ""}</p>
          <p>${item.quantity} unit(s) · ${item.guestCount} guest(s)${item.serviceType === "hotel" ? ` · ${nights} night(s)` : ""}</p>
          <span class="cart-availability">Ready for reservation</span>
        </div>
        <div class="cart-item-actions">
          <strong>${formatCurrency(itemTotal)}</strong>
          <button class="button button-dark checkout-item-btn" data-cart-id="${item.id}">Book this item <span aria-hidden="true">↗</span></button>
          <button class="text-button cancel-booking remove-cart-btn" data-cart-id="${item.id}">Remove</button>
        </div>
      </article>
    `;
  }).join("");

  if (summaryContainer) {
    summaryContainer.innerHTML = `
      <section class="cart-total">
        <span>${cart.length} selected experience(s) · Total estimate</span>
        <strong>${formatCurrency(grandTotal)}</strong>
        <p>You can proceed to book your selections. Checkout will confirm your reservation.</p>
      </section>
    `;
  }

  // Handle remove buttons
  container.querySelectorAll(".remove-cart-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      removeFromLocalCart(btn.dataset.cartId);
      renderCart(user);
      renderHeader(user);
    });
  });

  // Handle individual checkout buttons
  container.querySelectorAll(".checkout-item-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const item = cart.find((i) => i.id === btn.dataset.cartId);
      if (item) {
        sessionStorage.setItem("active_booking_item", JSON.stringify(item));
        window.location.href = "/payment.html";
      }
    });
  });
}

// ----------------------------------------------------
// 4. PAYMENT PAGE
// ----------------------------------------------------
function renderPayment(user) {
  const container = document.querySelector("#payment-details-container");
  if (!container) return;

  const rawItem = sessionStorage.getItem("active_booking_item");
  const item = rawItem ? JSON.parse(rawItem) : null;

  if (!item) {
    container.innerHTML = `
      <p class="page-notice">No active item selected for checkout. <a class="underlined-link" href="/cart.html">View your cart</a> or <a class="underlined-link" href="/">Explore destinations</a>.</p>
    `;
    return;
  }

  const nights = item.serviceType === "hotel" && item.checkOut
    ? Math.max(1, Math.round((Date.parse(`${item.checkOut}T00:00:00Z`) - Date.parse(`${item.bookingDate}T00:00:00Z`)) / 86400000))
    : 1;
  const total = Number(item.unitPrice || 0) * Number(item.quantity || 1) * nights;

  container.innerHTML = `
    <section class="checkout-summary">
      <h2>${escapeHtml(item.destinationName)}: ${escapeHtml(item.serviceName)}</h2>
      <p>${item.serviceType === "hotel" ? "Accommodation" : item.serviceType === "place" ? "Attraction Entry" : "Dining Reservation"} · Date: ${escapeHtml(item.bookingDate)}${item.checkOut ? ` to ${escapeHtml(item.checkOut)}` : ""}</p>
      <p>${item.quantity} ${item.serviceType === "hotel" ? "room(s)" : item.serviceType === "place" ? "ticket(s)" : "table(s)"} · ${item.guestCount} guest(s)</p>
      <p class="checkout-total">${formatCurrency(total)}</p>
    </section>

    <section class="traveler-summary">
      <div>
        <span class="eyebrow section-eyebrow">BOOKING TRAVELER</span>
        <strong>${escapeHtml(user ? user.name : "Guest Traveler")}</strong>
        <span>${escapeHtml(user ? user.email : "Sign in to record in your account history")}</span>
      </div>
      <a class="underlined-link" href="${user ? "/profile.html" : "/account.html"}">${user ? "View profile" : "Sign in first"}</a>
    </section>

    <form class="checkout-form" id="checkout-form">
      <fieldset>
        <legend>Select payment method (Simulated)</legend>
        <label class="payment-option">
          <input type="radio" name="mode" value="upi" checked>
          <span><strong>UPI (Google Pay, PhonePe, Paytm, BHIM)</strong><small>Instant demo confirmation</small></span>
        </label>
        <label class="payment-option">
          <input type="radio" name="mode" value="card">
          <span><strong>Credit or Debit Card</strong><small>Demo checkout simulation (no real cards used)</small></span>
        </label>
        <label class="payment-option">
          <input type="radio" name="mode" value="cash_on_arrival">
          <span><strong>Pay at the Desk / Settle on Arrival</strong><small>Reservation placed; payment made at destination</small></span>
        </label>
      </fieldset>

      <p class="demo-warning">DEMO CHECKOUT · This application simulates the booking process. No actual charges are made.</p>
      <button class="button button-dark form-submit" type="submit">Complete Booking · ${formatCurrency(total)} <span aria-hidden="true">↗</span></button>
    </form>
  `;

  document.querySelector("#checkout-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const mode = document.querySelector('input[name="mode"]:checked')?.value || "upi";
    const transactionId = "TXN" + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();

    // If logged in, create backend booking
    let bookingId = Math.floor(100000 + Math.random() * 900000);
    if (user) {
      try {
        const res = await api("/bookings", {
          method: "POST",
          body: JSON.stringify({
            destinationId: item.destinationId,
            serviceId: item.serviceId,
            serviceType: item.serviceType,
            bookingDate: item.bookingDate,
            checkOut: item.checkOut,
            quantity: item.quantity,
            guestCount: item.guestCount,
          }),
        });
        if (res.booking && res.booking.id) {
          bookingId = res.booking.id;
        }
      } catch (err) {
        console.warn("Backend booking API notice:", err.message);
      }
    }

    // Save receipt details
    const receipt = {
      bookingId,
      transactionId,
      touristName: user ? user.name : "Guest Traveler",
      touristEmail: user ? user.email : "guest@touristguide.demo",
      destinationName: item.destinationName,
      serviceName: item.serviceName,
      bookingDate: item.bookingDate,
      quantity: item.quantity,
      paymentMode: mode.toUpperCase(),
      totalAmount: total,
    };
    sessionStorage.setItem("last_receipt", JSON.stringify(receipt));

    // Remove booked item from cart
    removeFromLocalCart(item.id);
    renderHeader(user);

    window.location.href = "/receipt.html";
  });
}

// ----------------------------------------------------
// 5. RECEIPT PAGE
// ----------------------------------------------------
function renderReceipt() {
  const container = document.querySelector("#receipt-container");
  if (!container) return;

  const raw = sessionStorage.getItem("last_receipt");
  const r = raw ? JSON.parse(raw) : null;

  if (!r) {
    container.innerHTML = `
      <p class="page-notice">No recent booking confirmation found. <a class="underlined-link" href="/">Explore destinations</a></p>
    `;
    return;
  }

  container.innerHTML = `
    <article class="receipt-card">
      <div class="receipt-top">
        <div>
          <span class="eyebrow section-eyebrow">YOUR ROAM E-TICKET</span>
          <h2>${escapeHtml(r.destinationName)}</h2>
        </div>
        <span class="receipt-status">CONFIRMED</span>
      </div>
      <div class="receipt-grid">
        <div><span>BOOKING ID</span><strong>BID-#${escapeHtml(r.bookingId)}</strong></div>
        <div><span>TRANSACTION ID</span><strong>${escapeHtml(r.transactionId)}</strong></div>
        <div><span>TRAVELER</span><strong>${escapeHtml(r.touristName)}</strong></div>
        <div><span>EMAIL</span><strong>${escapeHtml(r.touristEmail)}</strong></div>
        <div><span>EXPERIENCE</span><strong>${escapeHtml(r.serviceName)}</strong></div>
        <div><span>DATE</span><strong>${escapeHtml(r.bookingDate)}</strong></div>
        <div><span>GUESTS / QUANTITY</span><strong>${escapeHtml(r.quantity)}</strong></div>
        <div><span>PAYMENT</span><strong>${escapeHtml(r.paymentMode)}</strong></div>
      </div>
      <div class="receipt-total">
        <span>Total Paid (Simulated)</span>
        <strong>${formatCurrency(r.totalAmount)}</strong>
      </div>
      <p class="receipt-note">This is a simulated demo e-ticket for testing and academic demonstration. No real charges were processed.</p>
    </article>
  `;
}

// ----------------------------------------------------
// 6. BOOKINGS / TRIPS PAGE
// ----------------------------------------------------
async function renderBookings(user) {
  const container = document.querySelector("#trips-container");
  if (!container) return;

  if (!user) {
    container.innerHTML = `
      <section class="empty-state">
        <span aria-hidden="true">✻</span>
        <h2>Sign in to view your trips</h2>
        <p>Sign in with your traveler account to view confirmed bookings and trip receipts.</p>
        <a class="button button-dark" href="/account.html">Sign in now</a>
      </section>
    `;
    return;
  }

  try {
    const data = await api("/bookings");
    const bookings = data.bookings || [];

    if (!bookings.length) {
      container.innerHTML = `
        <section class="empty-state">
          <span aria-hidden="true">✳</span>
          <h2>No trips planned yet</h2>
          <p>You haven't made any bookings yet. Start by finding your escape.</p>
          <a class="button button-dark" href="/">Explore destinations</a>
        </section>
      `;
      return;
    }

    container.innerHTML = bookings.map((b) => `
      <article class="booking-item">
        <strong>${escapeHtml(b.destinationName)} · ${escapeHtml(b.serviceName)}</strong>
        <span>${escapeHtml(b.serviceType.toUpperCase())} · Date: ${escapeHtml(b.bookingDate || "")} · ${b.quantity} item(s) · Status: <strong>${escapeHtml(b.status || "confirmed")}</strong></span>
        <span>Total: ${formatCurrency(b.totalAmount)} · Ref: #${b.id}</span>
      </article>
    `).join("");
  } catch (err) {
    container.innerHTML = `<p class="page-notice" role="alert">Unable to load trips: ${escapeHtml(err.message)}</p>`;
  }
}

// ----------------------------------------------------
// 7. PROFILE PAGE
// ----------------------------------------------------
async function renderProfile(user) {
  const form = document.querySelector("#profile-form");
  if (!form) return;

  if (!user) {
    window.location.href = "/account.html";
    return;
  }

  try {
    const res = await api("/auth/profile");
    const p = res.user;

    const initialsElem = document.querySelector("#profile-initials");
    const displayNameElem = document.querySelector("#profile-display-name");
    const roleElem = document.querySelector("#profile-role");
    const createdElem = document.querySelector("#profile-created");

    if (initialsElem) {
      initialsElem.textContent = (p.name || "U").trim().split(/\s+/).slice(0, 2).map((x) => x[0]).join("").toUpperCase();
    }
    if (displayNameElem) displayNameElem.textContent = p.name;
    if (roleElem) roleElem.textContent = `SIGNED IN AS ${(p.role || "tourist").toUpperCase()}`;
    if (createdElem && p.createdAt) {
      createdElem.textContent = `Member since ${new Date(p.createdAt).toLocaleDateString()}`;
    }

    const nameInput = document.querySelector("#profile-name");
    const emailInput = document.querySelector("#profile-email");
    const phoneInput = document.querySelector("#profile-phone");

    if (nameInput) nameInput.value = p.name || "";
    if (emailInput) emailInput.value = p.email || "";
    if (phoneInput) phoneInput.value = p.phone || "";

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const notice = document.querySelector("#profile-notice");
      try {
        await api("/auth/profile", {
          method: "PATCH",
          body: JSON.stringify({
            name: nameInput.value,
            email: emailInput.value,
            phone: phoneInput.value,
          }),
        });
        if (notice) notice.innerHTML = `<p class="page-notice">Profile details updated successfully.</p>`;
        renderHeader({ ...user, name: nameInput.value, email: emailInput.value });
      } catch (err) {
        if (notice) notice.innerHTML = `<p class="page-notice" role="alert">${escapeHtml(err.message)}</p>`;
      }
    });
  } catch (err) {
    console.error("Profile load error", err);
  }
}

// ----------------------------------------------------
// 8. ACCOUNT (LOGIN & REGISTER) PAGE
// ----------------------------------------------------
function renderAccount() {
  const container = document.querySelector("#account-form-container");
  if (!container) return;

  const params = new URLSearchParams(window.location.search);
  const register = params.get("mode") === "register";

  document.title = register ? "Create an account · Smart Tourist Guide System" : "Sign in · Smart Tourist Guide System";

  const heading = document.querySelector("#account-heading");
  const intro = document.querySelector("#account-intro");
  const tabLogin = document.querySelector("#tab-login");
  const tabRegister = document.querySelector("#tab-register");

  if (heading) heading.textContent = register ? "Create your account." : "Welcome back.";
  if (intro) intro.textContent = register ? "Save your places, plan your trip, and keep every detail in one place." : "Sign in to keep planning your next chapter.";

  if (tabLogin && tabRegister) {
    tabLogin.className = `auth-tab${!register ? " is-active" : ""}`;
    tabRegister.className = `auth-tab${register ? " is-active" : ""}`;
  }

  container.innerHTML = `
    <form class="form-panel" id="auth-form">
      ${register ? `
        <label class="form-label" for="reg-name">Name</label>
        <input class="form-input" id="reg-name" name="name" required minlength="2" maxlength="100" placeholder="Full name">
        <label class="form-label" for="reg-email">Email</label>
        <input class="form-input" id="reg-email" name="email" type="email" required maxlength="254" placeholder="you@example.com">
        <label class="form-label" for="reg-phone">Phone</label>
        <input class="form-input" id="reg-phone" name="phone" required minlength="7" maxlength="30" placeholder="Contact phone">
        <label class="form-label" for="reg-password">Password (minimum 10 characters)</label>
        <input class="form-input" id="reg-password" name="password" type="password" required minlength="10" placeholder="••••••••••">
        <button class="button button-dark form-submit" type="submit">Create account ↗</button>
      ` : `
        <label class="form-label" for="login-email">Email</label>
        <input class="form-input" id="login-email" name="email" type="email" required maxlength="254" placeholder="you@example.com">
        <label class="form-label" for="login-password">Password</label>
        <input class="form-input" id="login-password" name="password" type="password" required minlength="8" placeholder="••••••••••">
        <button class="button button-dark form-submit" type="submit">Sign in ↗</button>
      `}
    </form>
  `;

  document.querySelector("#auth-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const notice = document.querySelector("#account-notice");
    const payload = Object.fromEntries(new FormData(e.target));
    try {
      await api(register ? "/auth/register" : "/auth/login", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const next = params.get("next") || "/";
      window.location.href = next;
    } catch (err) {
      if (notice) notice.innerHTML = `<p class="page-notice" role="alert">${escapeHtml(err.message)}</p>`;
    }
  });
}

// ----------------------------------------------------
// 9. CONTACT FORM
// ----------------------------------------------------
function setupContactForm() {
  const form = document.querySelector("#contact-form");
  if (!form) return;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const notice = document.querySelector("#contact-notice");
    if (notice) {
      notice.innerHTML = `<p class="page-notice">Thank you for getting in touch! Your message has been received.</p>`;
    }
    form.reset();
  });
}

// ----------------------------------------------------
// INITIALIZATION
// ----------------------------------------------------
(async () => {
  let sessionUser = null;
  try {
    const session = await api("/auth/session");
    sessionUser = session.user || null;
  } catch (err) {
    console.warn("Session check notice:", err.message);
  }

  renderHeader(sessionUser);
  renderHome(sessionUser);
  renderDestination(sessionUser);
  renderCart(sessionUser);
  renderPayment(sessionUser);
  renderReceipt();
  renderBookings(sessionUser);
  renderProfile(sessionUser);
  renderAccount();
  setupContactForm();
})();
