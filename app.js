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
  const cartLink = `<a class="header-link" href="/cart">Cart${cartBadge}</a>`;

  if (user) {
    const firstName = escapeHtml(String(user.name || "Profile").trim().split(/\s+/)[0]);
    const management = ["administrator", "system_administrator"].includes(user.role)
      ? '<a class="text-button" href="/admin.html">Dashboard</a>'
      : "";
    target.innerHTML = `
      ${cartLink}
      ${management}
      <a class="text-button" href="/profile.html">Hi, ${firstName}</a>
      <a class="text-button header-secondary" href="/trips">My trips</a>
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
      <a class="text-button header-secondary" href="/trips">My trips</a>
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
      const rating = Number(document.querySelector("#review-rating")?.value || 5);
      const comment = document.querySelector("#review-comment")?.value || "";
      const notice = document.querySelector("#destination-notice");
      try {
        await api(`/destinations/${encodeURIComponent(d.id)}/reviews`, {
          method: "POST",
          body: JSON.stringify({ destinationId: d.id, rating, comment }),
        });
        if (notice) notice.innerHTML = `<p class="page-notice">Thank you for sharing your story! Your review has been submitted and posted.</p>`;
        const commentInput = document.querySelector("#review-comment");
        if (commentInput) commentInput.value = "";
      } catch (err) {
        if (notice) notice.innerHTML = `<p class="page-notice" role="alert">${escapeHtml(err.message || "Please sign in to submit a review.")}</p>`;
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
function formatDateRange(bookingDate, checkOut) {
  if (!bookingDate) return "";
  try {
    const d1 = new Date(`${bookingDate}T12:00:00`).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    if (!checkOut) return d1;
    const d2 = new Date(`${checkOut}T12:00:00`).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    return `${d1} → ${d2}`;
  } catch {
    return checkOut ? `${bookingDate} → ${checkOut}` : bookingDate;
  }
}

// ----------------------------------------------------
// 4. PAYMENT PAGE
// ----------------------------------------------------
async function renderPayment(user) {
  const container = document.querySelector("#payment-details-container");
  if (!container) return;

  const urlParams = new URLSearchParams(window.location.search);
  const existingBookingId = urlParams.get("bookingId");

  let item = null;
  let isExistingPendingBooking = false;
  let total = 0;

  // Check if paying for an existing pending booking
  if (existingBookingId && user) {
    try {
      const data = await api(`/bookings/${encodeURIComponent(existingBookingId)}`);
      const b = data.booking;
      if (b) {
        if (b.status === "confirmed") {
          container.innerHTML = `
            <div class="page-notice">
              This trip is already confirmed! <a class="underlined-link" href="/receipt.html?bookingId=${b.id}">View your e-ticket</a> or <a class="underlined-link" href="/trips">View your trips</a>.
            </div>
          `;
          return;
        }
        item = {
          destinationId: b.destinationId,
          destinationName: b.destinationName,
          serviceId: b.serviceId,
          serviceName: b.serviceName,
          serviceType: b.serviceType,
          unitPrice: b.unitPrice,
          bookingDate: b.bookingDate,
          checkOut: b.checkOut,
          quantity: b.quantity,
          guestCount: b.guestCount,
          id: `pending_${b.id}`,
        };
        total = Number(b.totalAmount || 0);
        isExistingPendingBooking = true;
      }
    } catch (err) {
      console.warn("Could not load existing booking:", err.message);
    }
  }

  // If not existing booking, load from cart active item
  if (!item) {
    const rawItem = sessionStorage.getItem("active_booking_item");
    item = rawItem ? JSON.parse(rawItem) : null;
  }

  if (!item) {
    container.innerHTML = `
      <p class="page-notice">No active item selected for checkout. <a class="underlined-link" href="/cart.html">View your cart</a> or <a class="underlined-link" href="/">Explore destinations</a>.</p>
    `;
    return;
  }

  if (!isExistingPendingBooking) {
    const nights = item.serviceType === "hotel" && item.checkOut
      ? Math.max(1, Math.round((Date.parse(`${item.checkOut}T00:00:00Z`) - Date.parse(`${item.bookingDate}T00:00:00Z`)) / 86400000))
      : 1;
    total = Number(item.unitPrice || 0) * Number(item.quantity || 1) * nights;
  }

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
        <span>${escapeHtml(user ? user.email : "Sign in to save this trip directly to your account history")}</span>
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
      <button class="button button-dark form-submit" id="checkout-submit-btn" type="submit">Complete Booking & Confirm · ${formatCurrency(total)} <span aria-hidden="true">↗</span></button>
    </form>
  `;

  document.querySelector("#checkout-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitBtn = document.querySelector("#checkout-submit-btn");
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Confirming your reservation...";
    }

    const mode = document.querySelector('input[name="mode"]:checked')?.value || "upi";
    let bookingId = isExistingPendingBooking ? Number(existingBookingId) : Math.floor(100000 + Math.random() * 900000);
    let transactionId = "TXN" + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
    let verificationToken = "";

    // If logged in, create backend booking AND complete payment
    if (user) {
      try {
        if (!isExistingPendingBooking) {
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
            verificationToken = res.booking.verificationToken || "";
          }
        }

        // Process payment to transition status from pending -> confirmed
        const payRes = await api(`/bookings/${bookingId}/payments`, {
          method: "POST",
          body: JSON.stringify({
            mode: mode,
            bankName: "State Bank of India",
            simulateFailure: false,
          }),
        });

        if (payRes.payment) {
          transactionId = payRes.payment.transactionId || transactionId;
          if (payRes.payment.verificationToken) {
            verificationToken = payRes.payment.verificationToken;
          }
        }
      } catch (err) {
        console.warn("Backend booking API note:", err.message);
      }
    } else {
      // Guest booking: store in localStorage
      const guestBookings = JSON.parse(localStorage.getItem("roam_guest_bookings") || "[]");
      guestBookings.unshift({
        id: bookingId,
        destinationName: item.destinationName,
        serviceName: item.serviceName,
        serviceType: item.serviceType,
        bookingDate: item.bookingDate,
        checkOut: item.checkOut,
        quantity: item.quantity,
        guestCount: item.guestCount,
        totalAmount: total,
        status: "confirmed",
        transactionId: transactionId,
        paymentMode: mode.toUpperCase(),
        paymentStatus: mode === "cash_on_arrival" ? "cash_due" : "success"
      });
      localStorage.setItem("roam_guest_bookings", JSON.stringify(guestBookings));
    }

    // Save receipt details to sessionStorage
    const receipt = {
      bookingId,
      transactionId,
      verificationToken,
      touristName: user ? user.name : "Guest Traveler",
      touristEmail: user ? user.email : "guest@touristguide.demo",
      destinationName: item.destinationName,
      serviceName: item.serviceName,
      bookingDate: item.bookingDate,
      checkOut: item.checkOut,
      quantity: item.quantity,
      guestCount: item.guestCount,
      paymentMode: mode.toUpperCase(),
      totalAmount: total,
      status: "confirmed",
    };
    sessionStorage.setItem("last_receipt", JSON.stringify(receipt));

    // Remove booked item from cart
    if (!isExistingPendingBooking) {
      removeFromLocalCart(item.id);
      sessionStorage.removeItem("active_booking_item");
      renderHeader(user);
    }

    window.location.href = `/receipt.html?bookingId=${bookingId}`;
  });
}

// ----------------------------------------------------
// 5. RECEIPT PAGE
// ----------------------------------------------------
async function renderReceipt() {
  const container = document.querySelector("#receipt-container");
  if (!container) return;

  const urlParams = new URLSearchParams(window.location.search);
  const bookingIdFromUrl = urlParams.get("bookingId");

  let r = null;

  // Try fetching from backend if bookingId provided in URL
  if (bookingIdFromUrl) {
    try {
      const data = await api(`/bookings/${encodeURIComponent(bookingIdFromUrl)}`);
      if (data && data.booking) {
        const b = data.booking;
        r = {
          bookingId: b.id,
          transactionId: b.transactionId || `TXN${b.id}DEMO`,
          verificationToken: b.verificationToken || "",
          touristName: b.touristName || "Traveler",
          touristEmail: b.touristEmail || "traveler@touristguide.demo",
          destinationName: b.destinationName,
          serviceName: b.serviceName,
          bookingDate: formatDateRange(b.bookingDate, b.checkOut),
          quantity: `${b.quantity} unit(s) · ${b.guestCount || 1} guest(s)`,
          paymentMode: (b.paymentMode || "UPI").toUpperCase(),
          totalAmount: b.totalAmount,
          status: b.status || "confirmed",
        };
      }
    } catch {
      // Fallback to local storage
    }
  }

  // Fallback to sessionStorage last_receipt
  if (!r) {
    const raw = sessionStorage.getItem("last_receipt");
    if (raw) {
      try {
        r = JSON.parse(raw);
        if (bookingIdFromUrl && String(r.bookingId) !== String(bookingIdFromUrl)) {
          r = null;
        }
      } catch {
        r = null;
      }
    }
  }

  // Fallback to guest bookings
  if (!r && bookingIdFromUrl) {
    const guestBookings = JSON.parse(localStorage.getItem("roam_guest_bookings") || "[]");
    const found = guestBookings.find((g) => String(g.id) === String(bookingIdFromUrl));
    if (found) {
      r = {
        bookingId: found.id,
        transactionId: found.transactionId,
        verificationToken: "",
        touristName: "Guest Traveler",
        touristEmail: "guest@touristguide.demo",
        destinationName: found.destinationName,
        serviceName: found.serviceName,
        bookingDate: formatDateRange(found.bookingDate, found.checkOut),
        quantity: `${found.quantity} unit(s) · ${found.guestCount || 1} guest(s)`,
        paymentMode: found.paymentMode || "UPI",
        totalAmount: found.totalAmount,
        status: found.status || "confirmed",
      };
    }
  }

  if (!r) {
    container.innerHTML = `
      <p class="page-notice">No booking confirmation found for this request. <a class="underlined-link" href="/trips">View your trips</a> or <a class="underlined-link" href="/">Explore destinations</a>.</p>
    `;
    return;
  }

  const verifyUrl = r.verificationToken
    ? `${window.location.origin}/verify.html?token=${encodeURIComponent(r.verificationToken)}`
    : `${window.location.origin}/verify.html?bookingId=${encodeURIComponent(r.bookingId)}`;

  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(verifyUrl)}`;

  container.innerHTML = `
    <article class="receipt-card">
      <div class="receipt-top">
        <div>
          <span class="eyebrow section-eyebrow">YOUR SMART TOURIST GUIDE E-TICKET</span>
          <h2>${escapeHtml(r.destinationName)}</h2>
        </div>
        <span class="status-pill status-${r.status ? r.status.toLowerCase() : "confirmed"}">${escapeHtml((r.status || "CONFIRMED").toUpperCase())}</span>
      </div>
      <div class="receipt-grid">
        <div><span>BOOKING ID</span><strong>BID-#${escapeHtml(r.bookingId)}</strong></div>
        <div><span>TRANSACTION ID</span><strong>${escapeHtml(r.transactionId || "N/A")}</strong></div>
        <div><span>TRAVELER</span><strong>${escapeHtml(r.touristName)}</strong></div>
        <div><span>EMAIL</span><strong>${escapeHtml(r.touristEmail)}</strong></div>
        <div><span>EXPERIENCE</span><strong>${escapeHtml(r.serviceName)}</strong></div>
        <div><span>DATE</span><strong>${escapeHtml(r.bookingDate)}</strong></div>
        <div><span>GUESTS / QUANTITY</span><strong>${escapeHtml(r.quantity)}</strong></div>
        <div><span>PAYMENT MODE</span><strong>${escapeHtml(r.paymentMode || "UPI")}</strong></div>
      </div>
      <div class="receipt-total">
        <span>Total Paid (Simulated)</span>
        <strong>${formatCurrency(r.totalAmount)}</strong>
      </div>
      <div class="receipt-verification">
        <img src="${qrImageUrl}" alt="Verification QR Code">
        <div>
          <strong>Verified Demo Ticket</strong>
          <p>Scan to verify booking validity or <a class="underlined-link" href="${verifyUrl}" target="_blank">verify online</a>.</p>
          <small class="receipt-note">Demonstration ticket only. Validated in the Smart Tourist Guide System database.</small>
        </div>
      </div>
    </article>
  `;
}

// ----------------------------------------------------
// 6. BOOKINGS / TRIPS PAGE
// ----------------------------------------------------
async function renderBookings(user) {
  const container = document.querySelector("#trips-container");
  const noticeContainer = document.querySelector("#trips-notice");
  if (!container) return;

  let serverBookings = [];
  if (user) {
    try {
      const data = await api("/bookings");
      serverBookings = data.bookings || [];
    } catch (err) {
      console.warn("Unable to fetch server bookings:", err.message);
    }
  }

  const guestBookings = JSON.parse(localStorage.getItem("roam_guest_bookings") || "[]");
  const allBookings = [...serverBookings];

  // Merge guest bookings not already present in server bookings
  for (const gb of guestBookings) {
    if (!allBookings.some((b) => String(b.id) === String(gb.id))) {
      allBookings.push(gb);
    }
  }

  if (noticeContainer) {
    if (!user && guestBookings.length) {
      noticeContainer.innerHTML = `
        <div class="page-notice">
          Showing guest bookings placed on this browser. <a class="underlined-link" href="/account.html">Sign in or register</a> to save all your trips to your account permanently.
        </div>
      `;
    } else {
      noticeContainer.innerHTML = "";
    }
  }

  if (!allBookings.length) {
    if (!user) {
      container.innerHTML = `
        <section class="empty-state">
          <span aria-hidden="true">✻</span>
          <h2>Sign in to view your trips</h2>
          <p>Sign in with your traveler account to view confirmed bookings and trip receipts, or plan your next adventure.</p>
          <div style="display:flex; justify-content:center; gap:12px; margin-top:16px;">
            <a class="button button-dark" href="/account.html">Sign in now</a>
            <a class="button button-light" href="/">Explore destinations</a>
          </div>
        </section>
      `;
    } else {
      container.innerHTML = `
        <section class="empty-state">
          <span aria-hidden="true">✳</span>
          <h2>No trips planned yet</h2>
          <p>You haven't made any bookings yet. Start by finding your escape.</p>
          <a class="button button-dark" href="/">Explore destinations</a>
        </section>
      `;
    }
    return;
  }

  container.innerHTML = allBookings.map((b) => {
    const status = (b.status || "confirmed").toLowerCase();
    const dateRange = formatDateRange(b.bookingDate, b.checkOut);

    return `
      <article class="booking-item">
        <strong>${escapeHtml(b.destinationName)} · ${escapeHtml(b.serviceName)}</strong>
        <div class="trip-meta">
          <span class="status-pill status-${status}">${status.toUpperCase()}</span>
          <span>Date: <strong>${escapeHtml(dateRange)}</strong></span>
          <span>·</span>
          <span>${formatCurrency(b.totalAmount)}</span>
          <span>·</span>
          <span>${b.quantity} unit(s), ${b.guestCount || 1} guest(s)</span>
          ${b.transactionId ? `<span>· Txn: ${escapeHtml(b.transactionId)}</span>` : `<span>· Ref: #${b.id}</span>`}
        </div>
        <div class="trip-actions">
          ${status === "pending"
            ? `
              <a class="button button-dark" href="/payment.html?bookingId=${b.id}">Pay now & confirm ↗</a>
              <button class="text-button cancel-booking cancel-trip-btn" data-booking-id="${b.id}" type="button">Cancel trip</button>
            `
            : status === "confirmed"
              ? `
                <a class="button button-dark" href="/receipt.html?bookingId=${b.id}">View e-ticket ↗</a>
                <button class="text-button cancel-booking cancel-trip-btn" data-booking-id="${b.id}" type="button">Cancel trip</button>
              `
              : `<span class="cart-unavailable">Trip cancelled</span>`
          }
        </div>
      </article>
    `;
  }).join("");

  // Hook up cancel trip buttons
  container.querySelectorAll(".cancel-trip-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const bookingId = btn.dataset.bookingId;
      if (!confirm("Are you sure you want to cancel this trip?")) return;

      try {
        if (user) {
          await api(`/bookings/${bookingId}`, { method: "DELETE" });
        }
        // Update guest bookings if stored in local storage
        const guests = JSON.parse(localStorage.getItem("roam_guest_bookings") || "[]");
        const updated = guests.map((g) => String(g.id) === String(bookingId) ? { ...g, status: "cancelled" } : g);
        localStorage.setItem("roam_guest_bookings", JSON.stringify(updated));

        alert("Trip cancelled successfully.");
        renderBookings(user);
      } catch (err) {
        alert("Unable to cancel trip: " + err.message);
      }
    });
  });
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
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const notice = document.querySelector("#contact-notice");
    const submitBtn = form.querySelector('button[type="submit"]');
    const name = document.querySelector("#contact-name")?.value;
    const email = document.querySelector("#contact-email")?.value;
    const subject = document.querySelector("#contact-subject")?.value;
    const message = document.querySelector("#contact-message")?.value;

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Sending message...";
    }

    try {
      await api("/contact", {
        method: "POST",
        body: JSON.stringify({ name, email, subject, message }),
      });
      if (notice) {
        notice.innerHTML = `<p class="page-notice">Thank you for getting in touch! Your message has been received by the site administrator.</p>`;
      }
      form.reset();
    } catch (err) {
      if (notice) {
        notice.innerHTML = `<p class="page-notice" role="alert">Unable to send message: ${escapeHtml(err.message)}</p>`;
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `Send your message <span aria-hidden="true">↗</span>`;
      }
    }
  });
}

function setupAdminLoginForm() {
  const form = document.querySelector("#admin-login-form");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const notice = document.querySelector("#admin-notice");
    const email = document.querySelector("#admin-email")?.value;
    const password = document.querySelector("#admin-password")?.value;
    try {
      await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      window.location.href = "/admin.html";
    } catch (err) {
      if (notice) notice.innerHTML = `<p class="page-notice" role="alert">${escapeHtml(err.message)}</p>`;
    }
  });
}

// ----------------------------------------------------
// 10. ADMIN DASHBOARD
// ----------------------------------------------------
async function renderAdminDashboard(user) {
  const container = document.querySelector("#admin-dashboard-container");
  if (!container) return;

  if (!user || !["administrator", "system_administrator", "service_provider", "hotel_manager"].includes(user.role)) {
    container.innerHTML = `
      <section class="empty-state">
        <span aria-hidden="true">🔒</span>
        <h2>Administrator access required</h2>
        <p>Please sign in with an authorized administrator account to access this dashboard.</p>
        <a class="button button-dark" href="/admin-login.html">Sign in to dashboard ↗</a>
      </section>
    `;
    return;
  }

  const roleLabels = {
    tourist: "Tourist",
    administrator: "Administrator",
    service_provider: "Service Provider",
    system_administrator: "System Administrator",
    hotel_manager: "Hotel Manager",
  };

  const roleBadge = document.querySelector("#admin-role");
  if (roleBadge) {
    roleBadge.textContent = (roleLabels[user.role] || user.role).toUpperCase();
  }

  // Load metrics & data in parallel
  const [overviewRes, destsRes, hotelsRes, placesRes, restsRes, bookingsRes, paymentsRes, reviewsRes, usersRes, msgsRes] = await Promise.allSettled([
    api("/management/overview"),
    api("/management/entities/destinations"),
    api("/management/entities/hotels"),
    api("/management/entities/places"),
    api("/management/entities/restaurants"),
    api("/management/bookings"),
    api("/management/payments"),
    api("/management/reviews"),
    api("/management/users"),
    api("/management/contact-messages"),
  ]);

  const overview = overviewRes.status === "fulfilled" ? overviewRes.value.metrics || {} : {};
  const destinations = destsRes.status === "fulfilled" ? destsRes.value.items || [] : [];
  const hotels = hotelsRes.status === "fulfilled" ? hotelsRes.value.items || [] : [];
  const places = placesRes.status === "fulfilled" ? placesRes.value.items || [] : [];
  const restaurants = restsRes.status === "fulfilled" ? restsRes.value.items || [] : [];
  const bookings = bookingsRes.status === "fulfilled" ? bookingsRes.value.bookings || [] : [];
  const payments = paymentsRes.status === "fulfilled" ? paymentsRes.value.payments || [] : [];
  const reviews = reviewsRes.status === "fulfilled" ? reviewsRes.value.reviews || [] : [];
  const users = usersRes.status === "fulfilled" ? usersRes.value.users || [] : [];
  const messages = msgsRes.status === "fulfilled" ? msgsRes.value.messages || [] : [];

  // Metrics HTML
  const metricsHtml = `
    <section class="metrics-grid">
      <div class="metric-card"><span>TOURISTS</span><strong>${overview.tourists ?? users.filter((u) => u.role === "tourist").length}</strong></div>
      <div class="metric-card"><span>DESTINATIONS</span><strong>${overview.destinations ?? destinations.length}</strong></div>
      <div class="metric-card"><span>HOTELS & STAYS</span><strong>${overview.hotels ?? hotels.length}</strong></div>
      <div class="metric-card"><span>ATTRACTIONS</span><strong>${overview.places ?? places.length}</strong></div>
      <div class="metric-card"><span>RESTAURANTS</span><strong>${overview.restaurants ?? restaurants.length}</strong></div>
      <div class="metric-card"><span>TOTAL BOOKINGS</span><strong>${overview.bookings ?? bookings.length}</strong></div>
      <div class="metric-card"><span>CONFIRMED BOOKINGS</span><strong>${overview.confirmedBookings ?? bookings.filter((b) => b.status === "confirmed").length}</strong></div>
      <div class="metric-card"><span>RECORDED REVENUE</span><strong>${formatCurrency(overview.totalRevenue ?? payments.filter((p) => p.status === "success").reduce((s, p) => s + Number(p.amount || 0), 0))}</strong></div>
    </section>
  `;

  // Nav HTML
  const navHtml = `
    <nav class="dashboard-nav">
      <a href="#destinations">Destinations (${destinations.length})</a>
      <a href="#hotels">Hotels (${hotels.length})</a>
      <a href="#places">Places (${places.length})</a>
      <a href="#restaurants">Restaurants (${restaurants.length})</a>
      <a href="#bookings">Bookings (${bookings.length})</a>
      <a href="#payments">Payments (${payments.length})</a>
      <a href="#reviews">Reviews (${reviews.length})</a>
      ${user.role === "system_administrator" ? `<a href="#users">Accounts (${users.length})</a><a href="#messages">Messages (${messages.length})</a>` : ""}
    </nav>
  `;

  // Destinations Section
  const destinationsSection = `
    <section class="dashboard-section" id="destinations">
      <h2>Manage Destinations</h2>
      <details class="management-entry">
        <summary>+ Add New Destination</summary>
        <form class="management-form" id="create-destination-form">
          <label class="form-label">Name</label><input class="form-input" name="name" required placeholder="e.g. Manali">
          <label class="form-label">Location</label><input class="form-input" name="location" required placeholder="e.g. Himachal Pradesh, India">
          <label class="form-label">State</label><input class="form-input" name="state" required placeholder="e.g. Himachal Pradesh">
          <label class="form-label">Category</label>
          <select class="form-input" name="category" required>
            <option value="mountains">Hill Station</option>
            <option value="beach">Beaches & Coastal</option>
            <option value="heritage">Heritage & Culture</option>
            <option value="nature">Nature & Wildlife</option>
            <option value="spiritual">Spiritual</option>
          </select>
          <label class="form-label">Description</label><textarea class="form-input" name="description" required></textarea>
          <label class="form-label">Search tags</label><input class="form-input" name="tags" placeholder="e.g. snow, mountains, trekking">
          <label class="form-label">Highlights</label><textarea class="form-input" name="highlights" required placeholder="Key attractions"></textarea>
          <label class="form-label">Heritage notes</label><textarea class="form-input" name="heritageNotes" required placeholder="Historical or cultural background"></textarea>
          <label class="form-label">Entry fee (₹)</label><input class="form-input" name="entryFee" type="number" step="0.01" min="0" value="0">
          <label class="form-label">Image URL</label><input class="form-input" name="imageUrl" type="url" required placeholder="https://images.unsplash.com/...">
          <button class="button button-dark" type="submit">Create destination ↗</button>
        </form>
      </details>
      <div class="data-table-wrap" style="margin-top: 15px;">
        <table class="data-table">
          <thead><tr><th>ID</th><th>Name</th><th>Location / State</th><th>Category</th><th>Fee</th><th>Rating</th><th>Actions</th></tr></thead>
          <tbody>
            ${destinations.map((d) => `
              <tr>
                <td>#${d.id}</td>
                <td><strong>${escapeHtml(d.name)}</strong></td>
                <td>${escapeHtml(d.state || d.location)}</td>
                <td>${escapeHtml(CATEGORY_LABELS[d.category] || d.category)}</td>
                <td>${Number(d.entryFee || d.entry_fee) > 0 ? formatCurrency(d.entryFee || d.entry_fee) : "Free"}</td>
                <td>★ ${Number(d.rating || 0).toFixed(1)}</td>
                <td>
                  <button class="button danger-button delete-entity-btn" data-resource="destinations" data-id="${d.id}" style="padding: 4px 8px; font-size: 10px;">Delete</button>
                </td>
              </tr>
            `).join("") || '<tr><td colspan="7">No destinations found.</td></tr>'}
          </tbody>
        </table>
      </div>
    </section>
  `;

  // Hotels Section
  const hotelsSection = `
    <section class="dashboard-section" id="hotels">
      <h2>Manage Hotels & Stays</h2>
      <details class="management-entry">
        <summary>+ Add New Hotel</summary>
        <form class="management-form" id="create-hotel-form">
          <label class="form-label">Destination ID</label><input class="form-input" name="destinationId" type="number" required placeholder="1">
          <label class="form-label">Hotel Name</label><input class="form-input" name="name" required placeholder="e.g. Grand View Resort">
          <label class="form-label">Address</label><input class="form-input" name="address" required placeholder="e.g. Mall Road">
          <label class="form-label">Price Per Room / Night (₹)</label><input class="form-input" name="pricePerNight" type="number" step="0.01" required value="2500">
          <label class="form-label">Available Rooms</label><input class="form-input" name="availableRooms" type="number" required value="10">
          <label class="form-label">Amenities</label><textarea class="form-input" name="amenities" required placeholder="Free Wi-Fi, Breakfast included, Mountain view"></textarea>
          <button class="button button-dark" type="submit">Add hotel ↗</button>
        </form>
      </details>
      <div class="data-table-wrap" style="margin-top: 15px;">
        <table class="data-table">
          <thead><tr><th>ID</th><th>Hotel Name</th><th>Address</th><th>Price / Night</th><th>Rooms</th><th>Actions</th></tr></thead>
          <tbody>
            ${hotels.map((h) => `
              <tr>
                <td>#${h.id}</td>
                <td><strong>${escapeHtml(h.name)}</strong></td>
                <td>${escapeHtml(h.address || "")}</td>
                <td>${formatCurrency(h.pricePerNight || h.price_per_night)}</td>
                <td>${h.availableRooms || h.available_rooms || 0}</td>
                <td>
                  <button class="button danger-button delete-entity-btn" data-resource="hotels" data-id="${h.id}" style="padding: 4px 8px; font-size: 10px;">Delete</button>
                </td>
              </tr>
            `).join("") || '<tr><td colspan="6">No hotels recorded.</td></tr>'}
          </tbody>
        </table>
      </div>
    </section>
  `;

  // Places Section
  const placesSection = `
    <section class="dashboard-section" id="places">
      <h2>Manage Attractions & Places</h2>
      <details class="management-entry">
        <summary>+ Add New Attraction</summary>
        <form class="management-form" id="create-place-form">
          <label class="form-label">Destination ID</label><input class="form-input" name="destinationId" type="number" required placeholder="1">
          <label class="form-label">Place Name</label><input class="form-input" name="name" required placeholder="e.g. Sunset Point">
          <label class="form-label">Type</label><input class="form-input" name="type" required placeholder="e.g. Scenic Viewpoint / Fort">
          <label class="form-label">Opening Timings</label><input class="form-input" name="timings" required placeholder="e.g. 6:00 AM – 6:30 PM">
          <label class="form-label">Entry Fee (₹)</label><input class="form-input" name="entryFee" type="number" step="0.01" value="0">
          <label class="form-label">Historical Notes</label><textarea class="form-input" name="historicalNotes" required></textarea>
          <button class="button button-dark" type="submit">Add attraction ↗</button>
        </form>
      </details>
      <div class="data-table-wrap" style="margin-top: 15px;">
        <table class="data-table">
          <thead><tr><th>ID</th><th>Attraction Name</th><th>Type</th><th>Timings</th><th>Entry Fee</th><th>Actions</th></tr></thead>
          <tbody>
            ${places.map((p) => `
              <tr>
                <td>#${p.id}</td>
                <td><strong>${escapeHtml(p.name)}</strong></td>
                <td>${escapeHtml(p.type || "")}</td>
                <td>${escapeHtml(p.timings || "")}</td>
                <td>${Number(p.entryFee || p.entry_fee) > 0 ? formatCurrency(p.entryFee || p.entry_fee) : "Free"}</td>
                <td>
                  <button class="button danger-button delete-entity-btn" data-resource="places" data-id="${p.id}" style="padding: 4px 8px; font-size: 10px;">Delete</button>
                </td>
              </tr>
            `).join("") || '<tr><td colspan="6">No attractions recorded.</td></tr>'}
          </tbody>
        </table>
      </div>
    </section>
  `;

  // Restaurants Section
  const restaurantsSection = `
    <section class="dashboard-section" id="restaurants">
      <h2>Manage Dining & Restaurants</h2>
      <details class="management-entry">
        <summary>+ Add New Restaurant</summary>
        <form class="management-form" id="create-restaurant-form">
          <label class="form-label">Destination ID</label><input class="form-input" name="destinationId" type="number" required placeholder="1">
          <label class="form-label">Restaurant Name</label><input class="form-input" name="name" required placeholder="e.g. Hilltop Bistro">
          <label class="form-label">Address</label><input class="form-input" name="address" required placeholder="e.g. Central Market">
          <label class="form-label">Cuisine</label><input class="form-input" name="cuisine" required placeholder="e.g. North Indian, Coastal">
          <label class="form-label">Average Cost For Two (₹)</label><input class="form-input" name="averageCost" type="number" step="0.01" value="800">
          <label class="form-label">Operating Hours</label><input class="form-input" name="operatingHours" value="11:00 AM – 11:00 PM">
          <button class="button button-dark" type="submit">Add restaurant ↗</button>
        </form>
      </details>
      <div class="data-table-wrap" style="margin-top: 15px;">
        <table class="data-table">
          <thead><tr><th>ID</th><th>Name</th><th>Cuisine</th><th>Average Cost</th><th>Hours</th><th>Actions</th></tr></thead>
          <tbody>
            ${restaurants.map((r) => `
              <tr>
                <td>#${r.id}</td>
                <td><strong>${escapeHtml(r.name)}</strong></td>
                <td>${escapeHtml(r.cuisine || "")}</td>
                <td>${formatCurrency(r.averageCost || r.average_cost)}</td>
                <td>${escapeHtml(r.operatingHours || r.operating_hours || "")}</td>
                <td>
                  <button class="button danger-button delete-entity-btn" data-resource="restaurants" data-id="${r.id}" style="padding: 4px 8px; font-size: 10px;">Delete</button>
                </td>
              </tr>
            `).join("") || '<tr><td colspan="6">No restaurants recorded.</td></tr>'}
          </tbody>
        </table>
      </div>
    </section>
  `;

  // Bookings Section
  const bookingsSection = `
    <section class="dashboard-section" id="bookings">
      <h2>Bookings & Reservations (${bookings.length})</h2>
      <div class="data-table-wrap">
        <table class="data-table">
          <thead><tr><th>Booking ID</th><th>Traveler</th><th>Destination · Service</th><th>Dates</th><th>Total</th><th>Status</th><th>Update Status</th></tr></thead>
          <tbody>
            ${bookings.map((b) => `
              <tr>
                <td>BID-#${b.id}</td>
                <td><strong>${escapeHtml(b.touristName || b.tourist_name || "Traveler")}</strong><br><small>${escapeHtml(b.touristEmail || "")}</small></td>
                <td>${escapeHtml(b.destinationName || b.destination_name)} · ${escapeHtml(b.serviceName || b.service_name)}</td>
                <td>${escapeHtml(b.bookingDate || b.booking_date)}${b.checkOut ? ` to ${escapeHtml(b.checkOut)}` : ""}</td>
                <td><strong>${formatCurrency(b.totalAmount || b.total_amount)}</strong></td>
                <td><span class="receipt-status">${escapeHtml(b.status)}</span></td>
                <td>
                  <select class="form-input booking-status-select" data-booking-id="${b.id}" style="min-height: 30px; display: inline-block; width: auto; font-size: 10px;">
                    <option value="pending"${b.status === "pending" ? " selected" : ""}>pending</option>
                    <option value="confirmed"${b.status === "confirmed" ? " selected" : ""}>confirmed</option>
                    <option value="completed"${b.status === "completed" ? " selected" : ""}>completed</option>
                    <option value="cancelled"${b.status === "cancelled" ? " selected" : ""}>cancelled</option>
                  </select>
                  <button class="button button-dark save-booking-status-btn" data-booking-id="${b.id}" style="min-height: 30px; padding: 0 8px; font-size: 10px;">Save</button>
                </td>
              </tr>
            `).join("") || '<tr><td colspan="7">No customer bookings found.</td></tr>'}
          </tbody>
        </table>
      </div>
    </section>
  `;

  // Payments Section
  const paymentsSection = `
    <section class="dashboard-section" id="payments">
      <h2>Payments & Transactions (${payments.length})</h2>
      <p class="demo-warning">Simulated transaction records. Refund action updates booking and payment records in the database.</p>
      <div class="data-table-wrap">
        <table class="data-table">
          <thead><tr><th>ID</th><th>Traveler</th><th>Destination · Service</th><th>Amount</th><th>Method</th><th>Transaction ID</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>
            ${payments.map((p) => `
              <tr>
                <td>#${p.id}</td>
                <td>${escapeHtml(p.touristName || p.tourist_name || "")}</td>
                <td>${escapeHtml(p.destinationName || p.destination_name || "")} · ${escapeHtml(p.serviceName || p.service_name || "")}</td>
                <td><strong>${formatCurrency(p.amount)}</strong></td>
                <td>${escapeHtml(p.paymentMode || p.payment_mode || "UPI")}</td>
                <td><code>${escapeHtml(p.transactionId || p.transaction_id || "")}</code></td>
                <td>
                  <span class="status-pill status-${p.status === "success" ? "confirmed" : p.status === "cash_due" ? "pending" : "cancelled"}">
                    ${escapeHtml(p.status === "success" ? "PAID / SUCCESS" : p.status === "cash_due" ? "CASH DUE" : p.status.toUpperCase())}
                  </span>
                </td>
                <td>
                  ${p.status === "cash_due"
                    ? `<button class="button button-dark collect-cash-btn" data-payment-id="${p.id}" style="padding: 3px 8px; font-size: 9px;">Mark Paid</button>`
                    : p.status === "success"
                      ? `<button class="text-button cancel-booking refund-payment-btn" data-payment-id="${p.id}">Record Refund</button>`
                      : `<small>Processed</small>`
                  }
                </td>
              </tr>
            `).join("") || '<tr><td colspan="8">No payments recorded.</td></tr>'}
          </tbody>
        </table>
      </div>
    </section>
  `;

  // Reviews Section
  const reviewsSection = `
    <section class="dashboard-section" id="reviews">
      <h2>Reviews Moderation (${reviews.length})</h2>
      <div class="data-table-wrap">
        <table class="data-table">
          <thead><tr><th>Rating</th><th>Destination</th><th>Traveler</th><th>Comment</th><th>Action</th></tr></thead>
          <tbody>
            ${reviews.map((r) => `
              <tr>
                <td>★ ${Number(r.rating).toFixed(1)}</td>
                <td>${escapeHtml(r.destinationName || r.destination_name || "")}</td>
                <td>${escapeHtml(r.touristName || r.tourist_name || "Traveler")}</td>
                <td>${escapeHtml(r.comment || "")}</td>
                <td>
                  <button class="button danger-button delete-review-btn" data-review-id="${r.id}" style="padding: 4px 8px; font-size: 10px;">Remove</button>
                </td>
              </tr>
            `).join("") || '<tr><td colspan="5">No reviews to moderate.</td></tr>'}
          </tbody>
        </table>
      </div>
    </section>
  `;

  // Users Section (system_administrator only)
  const usersSection = user.role === "system_administrator" ? `
    <section class="dashboard-section" id="users">
      <h2>Accounts & Roles (${users.length})</h2>
      <div class="data-table-wrap">
        <table class="data-table">
          <thead><tr><th>ID</th><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            ${users.map((u) => `
              <tr>
                <td>#${u.id}</td>
                <td><strong>${escapeHtml(u.name)}</strong></td>
                <td>${escapeHtml(u.email)}</td>
                <td>
                  <select class="form-input user-role-select" data-user-id="${u.id}" style="min-height: 28px; width: auto; font-size: 10px;">
                    ${Object.entries(roleLabels).map(([rVal, rLbl]) => `<option value="${rVal}"${u.role === rVal ? " selected" : ""}>${rLbl}</option>`).join("")}
                  </select>
                  <button class="button button-dark save-role-btn" data-user-id="${u.id}" style="min-height: 28px; padding: 0 8px; font-size: 9px;">Save Role</button>
                </td>
                <td><strong>${u.isActive || u.is_active ? "Active" : "Suspended"}</strong></td>
                <td>
                  <button class="button ${u.isActive || u.is_active ? "danger-button" : "button-dark"} toggle-user-status-btn" data-user-id="${u.id}" data-active="${u.isActive || u.is_active ? 1 : 0}" style="padding: 4px 8px; font-size: 9px;">
                    ${u.isActive || u.is_active ? "Suspend" : "Activate"}
                  </button>
                </td>
              </tr>
            `).join("") || '<tr><td colspan="6">No accounts found.</td></tr>'}
          </tbody>
        </table>
      </div>
    </section>
  ` : "";

  // Messages Section
  const messagesSection = ["administrator", "system_administrator"].includes(user.role) ? `
    <section class="dashboard-section" id="messages">
      <h2>Contact Messages (${messages.length})</h2>
      <div class="data-table-wrap">
        <table class="data-table">
          <thead><tr><th>Date</th><th>Sender</th><th>Subject</th><th>Message</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>
            ${messages.map((m) => `
              <tr>
                <td><small>${new Date(m.createdAt || m.created_at).toLocaleDateString()}</small></td>
                <td><strong>${escapeHtml(m.name)}</strong><br><small>${escapeHtml(m.email)}</small></td>
                <td>${escapeHtml(m.subject)}</td>
                <td>${escapeHtml(m.message)}</td>
                <td>
                  <span class="status-pill status-${m.status === "reviewed" ? "confirmed" : "pending"}">
                    ${escapeHtml((m.status || "new").toUpperCase())}
                  </span>
                </td>
                <td>
                  <button class="button button-dark toggle-msg-status-btn" data-msg-id="${m.id}" data-status="${m.status === "new" ? "reviewed" : "new"}" style="padding: 4px 8px; font-size: 9px;">
                    Mark ${m.status === "new" ? "Reviewed" : "New"}
                  </button>
                </td>
              </tr>
            `).join("") || '<tr><td colspan="6">No contact messages received.</td></tr>'}
          </tbody>
        </table>
      </div>
    </section>
  ` : "";

  container.innerHTML = `
    ${metricsHtml}
    ${navHtml}
    ${destinationsSection}
    ${hotelsSection}
    ${placesSection}
    ${restaurantsSection}
    ${bookingsSection}
    ${paymentsSection}
    ${reviewsSection}
    ${usersSection}
    ${messagesSection}
  `;

  // Hook event handlers
  // 1. Delete entity buttons
  container.querySelectorAll(".delete-entity-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm(`Are you sure you want to delete this ${btn.dataset.resource.slice(0, -1)}?`)) return;
      try {
        await api(`/management/entities/${btn.dataset.resource}/${btn.dataset.id}/delete`, { method: "POST" });
        alert("Listing removed successfully.");
        renderAdminDashboard(user);
      } catch (err) {
        alert("Error: " + err.message);
      }
    });
  });

  // 2. Add destination form
  document.querySelector("#create-destination-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = Object.fromEntries(new FormData(e.target));
    try {
      await api("/management/entities/destinations", { method: "POST", body: JSON.stringify(payload) });
      alert("Destination created successfully!");
      renderAdminDashboard(user);
    } catch (err) {
      alert("Error creating destination: " + err.message);
    }
  });

  // 3. Add hotel form
  document.querySelector("#create-hotel-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = Object.fromEntries(new FormData(e.target));
    try {
      await api("/management/entities/hotels", { method: "POST", body: JSON.stringify(payload) });
      alert("Hotel added successfully!");
      renderAdminDashboard(user);
    } catch (err) {
      alert("Error adding hotel: " + err.message);
    }
  });

  // 4. Add place form
  document.querySelector("#create-place-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = Object.fromEntries(new FormData(e.target));
    try {
      await api("/management/entities/places", { method: "POST", body: JSON.stringify(payload) });
      alert("Attraction added successfully!");
      renderAdminDashboard(user);
    } catch (err) {
      alert("Error adding attraction: " + err.message);
    }
  });

  // 5. Add restaurant form
  document.querySelector("#create-restaurant-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = Object.fromEntries(new FormData(e.target));
    try {
      await api("/management/entities/restaurants", { method: "POST", body: JSON.stringify(payload) });
      alert("Restaurant added successfully!");
      renderAdminDashboard(user);
    } catch (err) {
      alert("Error adding restaurant: " + err.message);
    }
  });

  // 6. Update booking status
  container.querySelectorAll(".save-booking-status-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const select = container.querySelector(`.booking-status-select[data-booking-id="${btn.dataset.bookingId}"]`);
      const status = select?.value;
      try {
        await api(`/management/bookings/${btn.dataset.bookingId}`, {
          method: "PATCH",
          body: JSON.stringify({ status }),
        });
        alert(`Booking #${btn.dataset.bookingId} status updated to ${status}.`);
        renderAdminDashboard(user);
      } catch (err) {
        alert("Error updating status: " + err.message);
      }
    });
  });

  // 7. Refund payment
  container.querySelectorAll(".refund-payment-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Confirm demo refund for this payment?")) return;
      try {
        await api(`/management/payments/${btn.dataset.paymentId}/refund`, { method: "POST" });
        alert("Demo refund processed and logged.");
        renderAdminDashboard(user);
      } catch (err) {
        alert("Error processing refund: " + err.message);
      }
    });
  });

  // 7b. Collect cash payment
  container.querySelectorAll(".collect-cash-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        await api(`/management/payments/${btn.dataset.paymentId}/collect`, { method: "POST" });
        alert("Cash payment marked as collected and paid.");
        renderAdminDashboard(user);
      } catch (err) {
        alert("Error updating payment: " + err.message);
      }
    });
  });

  // 8. Delete review
  container.querySelectorAll(".delete-review-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Are you sure you want to remove this review?")) return;
      try {
        await api(`/management/reviews/${btn.dataset.reviewId}/delete`, { method: "POST" });
        alert("Review removed.");
        renderAdminDashboard(user);
      } catch (err) {
        alert("Error: " + err.message);
      }
    });
  });

  // 9. Save user role
  container.querySelectorAll(".save-role-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const select = container.querySelector(`.user-role-select[data-user-id="${btn.dataset.userId}"]`);
      const role = select?.value;
      try {
        await api(`/management/users/${btn.dataset.userId}/role`, {
          method: "PATCH",
          body: JSON.stringify({ role }),
        });
        alert(`Role updated to ${role}.`);
        renderAdminDashboard(user);
      } catch (err) {
        alert("Error updating role: " + err.message);
      }
    });
  });

  // 10. Toggle user status (suspend/activate)
  container.querySelectorAll(".toggle-user-status-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const currentActive = btn.dataset.active === "1";
      const newActive = !currentActive;
      try {
        await api(`/management/users/${btn.dataset.userId}/status`, {
          method: "PATCH",
          body: JSON.stringify({ isActive: newActive }),
        });
        alert(`User account ${newActive ? "activated" : "suspended"}.`);
        renderAdminDashboard(user);
      } catch (err) {
        alert("Error updating account status: " + err.message);
      }
    });
  });

  // 11. Toggle message status
  container.querySelectorAll(".toggle-msg-status-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const status = btn.dataset.status;
      try {
        await api(`/management/contact-messages/${btn.dataset.msgId}/status`, {
          method: "POST",
          body: JSON.stringify({ status }),
        });
        alert(`Message marked as ${status}.`);
        renderAdminDashboard(user);
      } catch (err) {
        alert("Error: " + err.message);
      }
    });
  });
}

// ----------------------------------------------------
// 12. VERIFY PAGE
// ----------------------------------------------------
async function renderVerify() {
  const container = document.querySelector("#verify-details");
  const messageEl = document.querySelector("#verify-message");
  if (!container) return;

  const urlParams = new URLSearchParams(window.location.search);
  let token = urlParams.get("token");
  if (!token) {
    const match = window.location.pathname.match(/\/verify\/([a-f0-9]{48})/);
    if (match) token = match[1];
  }

  if (!token) {
    if (messageEl) messageEl.textContent = "Please provide a valid ticket verification token.";
    container.innerHTML = `<p class="modal-note">No ticket token provided to verify. Scan the QR code on your e-ticket or check your booking confirmation.</p>`;
    return;
  }

  try {
    const data = await api(`/verify/${encodeURIComponent(token)}`);
    const b = data.booking;
    if (messageEl) messageEl.textContent = "Smart Tourist Guide System Verified Reservation";
    container.innerHTML = `
      <div style="display: grid; gap: 8px;">
        <span class="status-pill status-confirmed">VERIFIED RESERVATION</span>
        <h2>${escapeHtml(b.destinationName)} · ${escapeHtml(b.serviceName)}</h2>
        <p><strong>Booking ID:</strong> BID-#${b.id}</p>
        <p><strong>Traveler:</strong> ${escapeHtml(b.touristName || "Traveler")}</p>
        <p><strong>Dates:</strong> ${escapeHtml(formatDateRange(b.bookingDate, b.checkOut))}</p>
        <p><strong>Guests / Quantity:</strong> ${b.quantity} unit(s) · ${b.guestCount || 1} guest(s)</p>
        <p><strong>Total Amount:</strong> ${formatCurrency(b.totalAmount)}</p>
        <p><strong>Status:</strong> ${escapeHtml((b.bookingStatus || "confirmed").toUpperCase())}</p>
        <p><strong>Transaction ID:</strong> ${escapeHtml(b.transactionId || "CONFIRMED")} (${escapeHtml(b.paymentStatus || "success")})</p>
      </div>
    `;
  } catch (err) {
    if (messageEl) messageEl.textContent = "We couldn't verify that ticket.";
    container.innerHTML = `<p class="page-notice" role="alert">The ticket could not be verified: ${escapeHtml(err.message)}. The reservation may have been cancelled or the link is invalid.</p>`;
  }
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
  setupAdminLoginForm();
  renderAdminDashboard(sessionUser);
  renderVerify();
})();
