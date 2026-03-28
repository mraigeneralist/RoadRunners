// ── RoadRunners Booking System ──────────────────────────
(function () {
  'use strict';

  const SERVICES = [
    {
      id: 'basic-wash',
      name: 'Basic Wash',
      desc: 'Exterior hand wash with premium soap & dry',
      prices: { hatchback: 600, sedan: 700, lengthy: 800, muv: 900 }
    },
    {
      id: 'interior-deep',
      name: 'Interior Deep Cleaning + Basic Wash',
      desc: 'Full interior vacuum, dashboard, seats & basic exterior wash',
      prices: { hatchback: 2499, sedan: 2699, lengthy: 2899, muv: 2999 }
    },
    {
      id: 'exterior-deep',
      name: 'Exterior Deep Cleaning + Wax Wash',
      desc: 'Clay bar treatment, polish & premium carnauba wax coat',
      prices: { hatchback: 2399, sedan: 2499, lengthy: 2699, muv: 2899 }
    }
  ];

  const VEHICLE_TYPES = [
    { id: 'hatchback', name: 'Hatchback' },
    { id: 'sedan', name: 'Sedan / Compact SUV' },
    { id: 'lengthy', name: 'Lengthy Sedan / Mid SUV' },
    { id: 'muv', name: 'MUV / SUV' }
  ];

  const TIME_SLOTS = [
    '9:30 AM', '10:30 AM', '11:30 AM', '12:30 PM',
    '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM',
    '6:00 PM', '7:00 PM', '7:30 PM'
  ];

  let state = {
    step: 1,
    service: null,
    vehicleType: null,
    price: null,
    date: null,
    timeSlot: null,
    name: '',
    phone: '',
    vehicleNumber: '',
    notes: '',
    bookedSlots: [],
    booking: null
  };

  // Determine API base URL
  const API_BASE = window.location.origin;

  function createModal() {
    const overlay = document.createElement('div');
    overlay.className = 'booking-overlay';
    overlay.id = 'booking-overlay';
    overlay.innerHTML = `
      <div class="booking-modal" id="booking-modal">
        <div class="booking-header">
          <h2>Book a Service</h2>
          <button class="booking-close" id="booking-close">&times;</button>
        </div>
        <div class="booking-progress" id="booking-progress"></div>
        <div class="booking-body" id="booking-body"></div>
        <div class="booking-footer" id="booking-footer"></div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeBooking();
    });
    document.getElementById('booking-close').addEventListener('click', closeBooking);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeBooking();
    });
  }

  function openBooking() {
    state = { step: 1, service: null, vehicleType: null, price: null, date: null, timeSlot: null, name: '', phone: '', vehicleNumber: '', notes: '', bookedSlots: [], booking: null };
    const overlay = document.getElementById('booking-overlay');
    overlay.style.display = 'flex';
    requestAnimationFrame(() => overlay.classList.add('active'));
    document.body.style.overflow = 'hidden';
    render();
  }

  function closeBooking() {
    const overlay = document.getElementById('booking-overlay');
    overlay.classList.remove('active');
    setTimeout(() => {
      overlay.style.display = 'none';
      document.body.style.overflow = '';
    }, 300);
  }

  function render() {
    renderProgress();
    switch (state.step) {
      case 1: renderStep1(); break;
      case 2: renderStep2(); break;
      case 3: renderStep3(); break;
      case 4: renderStep4(); break;
      case 5: renderStep5(); break;
      case 6: renderStep6(); break;
    }
    // Scroll modal to top on step change
    document.getElementById('booking-modal').scrollTop = 0;
  }

  function renderProgress() {
    const el = document.getElementById('booking-progress');
    if (state.step === 6) { el.innerHTML = ''; return; }
    let html = '';
    for (let i = 1; i <= 5; i++) {
      const cls = i < state.step ? 'done' : i === state.step ? 'active' : '';
      html += `<div class="booking-progress-step ${cls}"></div>`;
    }
    el.innerHTML = html;
  }

  // ── STEP 1: Select Service ──
  function renderStep1() {
    const body = document.getElementById('booking-body');
    let html = `
      <div class="step-label">Step 1 of 5</div>
      <div class="step-title">Select a Service</div>
      <div class="service-cards">
    `;
    SERVICES.forEach(s => {
      const sel = state.service && state.service.id === s.id ? 'selected' : '';
      const priceRange = `\u20B9${Math.min(...Object.values(s.prices))} — \u20B9${Math.max(...Object.values(s.prices))}`;
      html += `
        <div class="service-card ${sel}" data-service="${s.id}">
          <div class="service-card-name">${s.name}</div>
          <div class="service-card-desc">${s.desc} &nbsp;·&nbsp; ${priceRange}</div>
        </div>
      `;
    });
    html += '</div>';

    if (state.service) {
      html += `
        <div style="margin-top:1.25rem;">
          <div class="step-label">Vehicle Type</div>
          <div class="vehicle-options">
      `;
      VEHICLE_TYPES.forEach(v => {
        const price = state.service.prices[v.id];
        const sel = state.vehicleType && state.vehicleType.id === v.id ? 'selected' : '';
        html += `
          <div class="vehicle-option ${sel}" data-vehicle="${v.id}">
            <div class="vehicle-option-type">${v.name}</div>
            <div class="vehicle-option-price">\u20B9${price.toLocaleString('en-IN')}</div>
          </div>
        `;
      });
      html += '</div></div>';
    }

    body.innerHTML = html;

    // Events
    body.querySelectorAll('.service-card').forEach(card => {
      card.addEventListener('click', () => {
        const svc = SERVICES.find(s => s.id === card.dataset.service);
        state.service = svc;
        state.vehicleType = null;
        state.price = null;
        render();
      });
    });
    body.querySelectorAll('.vehicle-option').forEach(opt => {
      opt.addEventListener('click', () => {
        const vt = VEHICLE_TYPES.find(v => v.id === opt.dataset.vehicle);
        state.vehicleType = vt;
        state.price = state.service.prices[vt.id];
        renderFooter1();
      });
    });

    renderFooter1();
  }

  function renderFooter1() {
    const footer = document.getElementById('booking-footer');
    const canNext = state.service && state.vehicleType && state.price;
    footer.innerHTML = `
      <button class="booking-btn booking-btn-next" ${canNext ? '' : 'disabled'} id="btn-next-1">
        Continue
      </button>
    `;
    if (canNext) {
      document.getElementById('btn-next-1').addEventListener('click', () => { state.step = 2; render(); });
    }
  }

  // ── STEP 2: Select Date ──
  function renderStep2() {
    const body = document.getElementById('booking-body');
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const minDate = tomorrow.toISOString().split('T')[0];
    const maxDate = new Date(today.getFullYear(), today.getMonth() + 2, today.getDate()).toISOString().split('T')[0];

    body.innerHTML = `
      <div class="step-label">Step 2 of 5</div>
      <div class="step-title">Select a Date</div>
      <div class="date-input-wrap">
        <input type="date" id="booking-date" min="${minDate}" max="${maxDate}" value="${state.date || ''}">
      </div>
    `;

    const dateInput = document.getElementById('booking-date');
    dateInput.addEventListener('change', (e) => {
      state.date = e.target.value;
      state.timeSlot = null;
      renderFooter2();
    });

    renderFooter2();
  }

  function renderFooter2() {
    const footer = document.getElementById('booking-footer');
    footer.innerHTML = `
      <button class="booking-btn booking-btn-back" id="btn-back-2">&larr;</button>
      <button class="booking-btn booking-btn-next" ${state.date ? '' : 'disabled'} id="btn-next-2">Continue</button>
    `;
    document.getElementById('btn-back-2').addEventListener('click', () => { state.step = 1; render(); });
    if (state.date) {
      document.getElementById('btn-next-2').addEventListener('click', () => { state.step = 3; render(); });
    }
  }

  // ── STEP 3: Select Time Slot ──
  async function renderStep3() {
    const body = document.getElementById('booking-body');
    body.innerHTML = `
      <div class="step-label">Step 3 of 5</div>
      <div class="step-title">Select a Time Slot</div>
      <div class="time-slots" id="time-slots-grid">
        <div style="grid-column:1/-1;text-align:center;color:#888;font-size:0.85rem;padding:1rem;">Loading available slots...</div>
      </div>
    `;
    renderFooter3();

    // Fetch booked slots
    try {
      const res = await fetch(`${API_BASE}/api/slots/${state.date}`);
      const data = await res.json();
      state.bookedSlots = data.bookedSlots || [];
    } catch {
      state.bookedSlots = [];
    }

    const grid = document.getElementById('time-slots-grid');
    let html = '';
    TIME_SLOTS.forEach(slot => {
      const isBooked = state.bookedSlots.includes(slot);
      const isSel = state.timeSlot === slot;
      const cls = isBooked ? 'booked' : isSel ? 'selected' : '';
      html += `<div class="time-slot ${cls}" data-slot="${slot}" ${isBooked ? '' : ''}>${slot}${isBooked ? ' (Booked)' : ''}</div>`;
    });
    grid.innerHTML = html;

    grid.querySelectorAll('.time-slot:not(.booked)').forEach(el => {
      el.addEventListener('click', () => {
        state.timeSlot = el.dataset.slot;
        render();
      });
    });
  }

  function renderFooter3() {
    const footer = document.getElementById('booking-footer');
    footer.innerHTML = `
      <button class="booking-btn booking-btn-back" id="btn-back-3">&larr;</button>
      <button class="booking-btn booking-btn-next" ${state.timeSlot ? '' : 'disabled'} id="btn-next-3">Continue</button>
    `;
    document.getElementById('btn-back-3').addEventListener('click', () => { state.step = 2; render(); });
    if (state.timeSlot) {
      document.getElementById('btn-next-3').addEventListener('click', () => { state.step = 4; render(); });
    }
  }

  // ── STEP 4: Customer Details ──
  function renderStep4() {
    const body = document.getElementById('booking-body');
    body.innerHTML = `
      <div class="step-label">Step 4 of 5</div>
      <div class="step-title">Your Details</div>
      <div class="form-group">
        <label>Full Name</label>
        <input type="text" id="b-name" placeholder="e.g. Rajesh Kumar" value="${escapeHtml(state.name)}">
      </div>
      <div class="form-group">
        <label>WhatsApp Number</label>
        <input type="tel" id="b-phone" placeholder="e.g. 9176347862" value="${escapeHtml(state.phone)}" maxlength="10">
      </div>
      <div class="form-group">
        <label>Vehicle Number</label>
        <input type="text" id="b-vehicle" placeholder="e.g. TN 01 AB 1234" value="${escapeHtml(state.vehicleNumber)}" style="text-transform:uppercase;">
      </div>
      <div class="form-group">
        <label>Special Notes (Optional)</label>
        <textarea id="b-notes" placeholder="Any specific requests...">${escapeHtml(state.notes)}</textarea>
      </div>
    `;

    const nameEl = document.getElementById('b-name');
    const phoneEl = document.getElementById('b-phone');
    const vehicleEl = document.getElementById('b-vehicle');
    const notesEl = document.getElementById('b-notes');

    function sync() {
      state.name = nameEl.value.trim();
      state.phone = phoneEl.value.trim();
      state.vehicleNumber = vehicleEl.value.trim().toUpperCase();
      state.notes = notesEl.value.trim();
      renderFooter4();
    }

    [nameEl, phoneEl, vehicleEl, notesEl].forEach(el => el.addEventListener('input', sync));
    renderFooter4();
  }

  function renderFooter4() {
    const footer = document.getElementById('booking-footer');
    const valid = state.name && /^[6-9]\d{9}$/.test(state.phone) && state.vehicleNumber.length >= 4;
    footer.innerHTML = `
      <button class="booking-btn booking-btn-back" id="btn-back-4">&larr;</button>
      <button class="booking-btn booking-btn-next" ${valid ? '' : 'disabled'} id="btn-next-4">Review Booking</button>
    `;
    document.getElementById('btn-back-4').addEventListener('click', () => { state.step = 3; render(); });
    if (valid) {
      document.getElementById('btn-next-4').addEventListener('click', () => { state.step = 5; render(); });
    }
  }

  // ── STEP 5: Review & Payment ──
  function renderStep5() {
    const body = document.getElementById('booking-body');
    const formattedDate = formatDate(state.date);
    body.innerHTML = `
      <div id="step5-content">
        <div class="step-label">Step 5 of 5</div>
        <div class="step-title">Review & Pay</div>
        <div class="review-summary">
          <div class="review-row">
            <span class="review-label">Service</span>
            <span class="review-value">${state.service.name}</span>
          </div>
          <div class="review-row">
            <span class="review-label">Vehicle Type</span>
            <span class="review-value">${state.vehicleType.name}</span>
          </div>
          <div class="review-row">
            <span class="review-label">Date</span>
            <span class="review-value">${formattedDate}</span>
          </div>
          <div class="review-row">
            <span class="review-label">Time</span>
            <span class="review-value">${state.timeSlot}</span>
          </div>
          <div class="review-row">
            <span class="review-label">Name</span>
            <span class="review-value">${escapeHtml(state.name)}</span>
          </div>
          <div class="review-row">
            <span class="review-label">Phone</span>
            <span class="review-value">+91 ${state.phone}</span>
          </div>
          <div class="review-row">
            <span class="review-label">Vehicle</span>
            <span class="review-value">${escapeHtml(state.vehicleNumber)}</span>
          </div>
          <div class="review-total">
            <span class="review-label">Total</span>
            <span class="review-value">\u20B9${state.price.toLocaleString('en-IN')}</span>
          </div>
        </div>

        <div class="payment-section">
          <div class="payment-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
            Pay with Card
          </div>
          <div class="payment-cards-strip">
            <div class="payment-card-icon">VISA</div>
            <div class="payment-card-icon">MC</div>
            <div class="payment-card-icon">RUPAY</div>
            <div class="payment-card-icon">UPI</div>
          </div>
          <div class="form-group">
            <label>Card Number</label>
            <input type="text" id="pay-card" placeholder="1234 5678 9012 3456" maxlength="19">
          </div>
          <div class="payment-row">
            <div class="form-group">
              <label>Expiry</label>
              <input type="text" id="pay-expiry" placeholder="MM/YY" maxlength="5">
            </div>
            <div class="form-group">
              <label>CVV</label>
              <input type="password" id="pay-cvv" placeholder="&bull;&bull;&bull;" maxlength="4">
            </div>
          </div>
          <button class="booking-btn booking-btn-pay" id="btn-pay">
            Pay \u20B9${state.price.toLocaleString('en-IN')}
          </button>
        </div>
      </div>

      <div class="pay-loading" id="pay-loading">
        <div class="pay-spinner"></div>
        <div class="pay-loading-text">Processing payment...</div>
      </div>
    `;

    // Card number formatting
    const cardEl = document.getElementById('pay-card');
    cardEl.addEventListener('input', (e) => {
      let v = e.target.value.replace(/\D/g, '').substring(0, 16);
      e.target.value = v.replace(/(.{4})/g, '$1 ').trim();
    });

    const expiryEl = document.getElementById('pay-expiry');
    expiryEl.addEventListener('input', (e) => {
      let v = e.target.value.replace(/\D/g, '').substring(0, 4);
      if (v.length >= 2) v = v.substring(0, 2) + '/' + v.substring(2);
      e.target.value = v;
    });

    document.getElementById('btn-pay').addEventListener('click', processPayment);

    const footer = document.getElementById('booking-footer');
    footer.innerHTML = `
      <button class="booking-btn booking-btn-back" id="btn-back-5">&larr;</button>
      <div style="flex:1"></div>
    `;
    document.getElementById('btn-back-5').addEventListener('click', () => { state.step = 4; render(); });
  }

  async function processPayment() {
    const content = document.getElementById('step5-content');
    const loading = document.getElementById('pay-loading');
    const footer = document.getElementById('booking-footer');

    content.style.display = 'none';
    loading.classList.add('active');
    footer.innerHTML = '';

    // Simulate payment delay
    await new Promise(r => setTimeout(r, 2000));

    loading.querySelector('.pay-loading-text').textContent = 'Confirming booking...';

    // Create the booking
    try {
      const res = await fetch(`${API_BASE}/api/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service: state.service.name,
          vehicleType: state.vehicleType.name,
          price: state.price,
          date: state.date,
          timeSlot: state.timeSlot,
          name: state.name,
          phone: '91' + state.phone,
          vehicleNumber: state.vehicleNumber,
          notes: state.notes
        })
      });
      const data = await res.json();
      if (data.success) {
        state.booking = data.booking;
        state.step = 6;
        render();
      } else {
        alert(data.error || 'Booking failed. Please try again.');
        content.style.display = '';
        loading.classList.remove('active');
      }
    } catch (err) {
      alert('Network error. Please check your connection and try again.');
      content.style.display = '';
      loading.classList.remove('active');
    }
  }

  // ── STEP 6: Confirmation ──
  function renderStep6() {
    const body = document.getElementById('booking-body');
    const b = state.booking;
    const formattedDate = formatDate(b.date);

    body.innerHTML = `
      <div class="confirmation">
        <div class="confirm-check">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
        </div>
        <div class="confirm-title">Booking Confirmed!</div>
        <div class="confirm-subtitle">Your appointment has been scheduled successfully</div>
        <div class="confirm-id">${b.id}</div>
        <div class="confirm-details">
          <div class="review-row">
            <span class="review-label">Service</span>
            <span class="review-value">${b.service}</span>
          </div>
          <div class="review-row">
            <span class="review-label">Vehicle Type</span>
            <span class="review-value">${b.vehicleType}</span>
          </div>
          <div class="review-row">
            <span class="review-label">Date</span>
            <span class="review-value">${formattedDate}</span>
          </div>
          <div class="review-row">
            <span class="review-label">Time</span>
            <span class="review-value">${b.timeSlot}</span>
          </div>
          <div class="review-row">
            <span class="review-label">Amount Paid</span>
            <span class="review-value" style="color:#d4a017;font-weight:800;">\u20B9${b.price.toLocaleString('en-IN')}</span>
          </div>
        </div>
        <div class="confirm-whatsapp-note">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
          You will receive a WhatsApp confirmation shortly
        </div>
        <button class="booking-btn-done" id="btn-done">Done</button>
      </div>
    `;

    const footer = document.getElementById('booking-footer');
    footer.innerHTML = '';

    document.getElementById('btn-done').addEventListener('click', closeBooking);
  }

  // ── Helpers ──
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatDate(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  }

  // ── Init ──
  document.addEventListener('DOMContentLoaded', () => {
    createModal();

    // Attach to all Book Now buttons
    document.querySelectorAll('[data-booking-trigger]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        openBooking();
      });
    });
  });

  // Expose globally so inline onclick can also use it
  window.openBooking = openBooking;
})();
