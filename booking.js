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
    cleanupPaymentState();
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
      case 7: renderStep7(); break;
    }
    // Scroll modal to top on step change
    document.getElementById('booking-modal').scrollTop = 0;
  }

  function renderProgress() {
    const el = document.getElementById('booking-progress');
    if (state.step === 7) { el.innerHTML = ''; return; }
    let html = '';
    for (let i = 1; i <= 6; i++) {
      const cls = i < state.step ? 'done' : i === state.step ? 'active' : '';
      html += `<div class="booking-progress-step ${cls}"></div>`;
    }
    el.innerHTML = html;
  }

  // ── STEP 1: Select Service ──
  function renderStep1() {
    const body = document.getElementById('booking-body');
    let html = `
      <div class="step-label">Step 1 of 6</div>
      <div class="step-title">Select a Service</div>
      <div class="service-cards">
    `;
    SERVICES.forEach(s => {
      const sel = state.service && state.service.id === s.id ? 'selected' : '';
      const priceRange = `\u20B9${Math.min(...Object.values(s.prices))} \u2014 \u20B9${Math.max(...Object.values(s.prices))}`;
      html += `
        <div class="service-card ${sel}" data-service="${s.id}">
          <div class="service-card-name">${s.name}</div>
          <div class="service-card-desc">${s.desc} &nbsp;\u00B7&nbsp; ${priceRange}</div>
        </div>
      `;
    });
    html += '</div>';

    body.innerHTML = html;

    body.querySelectorAll('.service-card').forEach(card => {
      card.addEventListener('click', () => {
        const svc = SERVICES.find(s => s.id === card.dataset.service);
        if (state.service && state.service.id !== svc.id) {
          state.vehicleType = null;
          state.price = null;
        }
        state.service = svc;
        render();
      });
    });

    renderFooter1();
  }

  function renderFooter1() {
    const footer = document.getElementById('booking-footer');
    footer.innerHTML = `
      <button class="booking-btn booking-btn-next" ${state.service ? '' : 'disabled'} id="btn-next-1">
        Continue
      </button>
    `;
    if (state.service) {
      document.getElementById('btn-next-1').addEventListener('click', () => { state.step = 2; render(); });
    }
  }

  // ── STEP 2: Select Vehicle Type ──
  function renderStep2() {
    const body = document.getElementById('booking-body');
    let html = `
      <div class="step-label">Step 2 of 6</div>
      <div class="step-title">Select Vehicle Type</div>
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
    html += '</div>';

    body.innerHTML = html;

    body.querySelectorAll('.vehicle-option').forEach(opt => {
      opt.addEventListener('click', () => {
        const vt = VEHICLE_TYPES.find(v => v.id === opt.dataset.vehicle);
        state.vehicleType = vt;
        state.price = state.service.prices[vt.id];
        body.querySelectorAll('.vehicle-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        renderFooter2();
      });
    });

    renderFooter2();
  }

  function renderFooter2() {
    const footer = document.getElementById('booking-footer');
    const canNext = state.vehicleType && state.price;
    footer.innerHTML = `
      <button class="booking-btn booking-btn-back" id="btn-back-2"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg></button>
      <button class="booking-btn booking-btn-next" ${canNext ? '' : 'disabled'} id="btn-next-2">Continue</button>
    `;
    document.getElementById('btn-back-2').addEventListener('click', () => { state.step = 1; render(); });
    if (canNext) {
      document.getElementById('btn-next-2').addEventListener('click', () => { state.step = 3; render(); });
    }
  }

  // ── STEP 3: Select Date ──
  function renderStep3() {
    const body = document.getElementById('booking-body');
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const minDate = tomorrow;
    const maxDate = new Date(today.getFullYear(), today.getMonth() + 2, today.getDate());

    // Determine which month to show
    let viewDate;
    if (state.date) {
      const parts = state.date.split('-');
      viewDate = new Date(+parts[0], +parts[1] - 1, 1);
    } else {
      viewDate = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), 1);
    }

    function buildCalendar(viewYear, viewMonth) {
      const firstDay = new Date(viewYear, viewMonth, 1).getDay();
      const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
      const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];

      const canPrev = new Date(viewYear, viewMonth, 0) >= minDate;
      const canNext = new Date(viewYear, viewMonth + 1, 1) <= maxDate;

      let html = `
        <div class="step-label">Step 3 of 6</div>
        <div class="step-title">Select a Date</div>
        <div class="cal">
          <div class="cal-header">
            <button class="cal-nav ${canPrev ? '' : 'disabled'}" id="cal-prev">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
            <div class="cal-month">${monthNames[viewMonth]} ${viewYear}</div>
            <button class="cal-nav ${canNext ? '' : 'disabled'}" id="cal-next">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
            </button>
          </div>
          <div class="cal-grid">
            <div class="cal-day-label">Su</div><div class="cal-day-label">Mo</div><div class="cal-day-label">Tu</div>
            <div class="cal-day-label">We</div><div class="cal-day-label">Th</div><div class="cal-day-label">Fr</div><div class="cal-day-label">Sa</div>
      `;

      for (let i = 0; i < firstDay; i++) {
        html += '<div class="cal-cell empty"></div>';
      }

      for (let d = 1; d <= daysInMonth; d++) {
        const cellDate = new Date(viewYear, viewMonth, d);
        const dateStr = `${viewYear}-${String(viewMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const isDisabled = cellDate < minDate || cellDate > maxDate;
        const isSelected = state.date === dateStr;
        const isToday = cellDate.toDateString() === today.toDateString();
        let cls = 'cal-cell';
        if (isDisabled) cls += ' disabled';
        if (isSelected) cls += ' selected';
        if (isToday) cls += ' today';
        html += `<div class="${cls}" data-date="${dateStr}">${d}</div>`;
      }

      html += '</div></div>';
      return html;
    }

    body.innerHTML = buildCalendar(viewDate.getFullYear(), viewDate.getMonth());

    function attachEvents() {
      const prevBtn = document.getElementById('cal-prev');
      const nextBtn = document.getElementById('cal-next');
      if (prevBtn && !prevBtn.classList.contains('disabled')) {
        prevBtn.addEventListener('click', () => {
          viewDate.setMonth(viewDate.getMonth() - 1);
          body.innerHTML = buildCalendar(viewDate.getFullYear(), viewDate.getMonth());
          attachEvents();
        });
      }
      if (nextBtn && !nextBtn.classList.contains('disabled')) {
        nextBtn.addEventListener('click', () => {
          viewDate.setMonth(viewDate.getMonth() + 1);
          body.innerHTML = buildCalendar(viewDate.getFullYear(), viewDate.getMonth());
          attachEvents();
        });
      }
      body.querySelectorAll('.cal-cell:not(.disabled):not(.empty)').forEach(cell => {
        cell.addEventListener('click', () => {
          state.date = cell.dataset.date;
          state.timeSlot = null;
          body.querySelectorAll('.cal-cell').forEach(c => c.classList.remove('selected'));
          cell.classList.add('selected');
          renderFooter3();
        });
      });
    }
    attachEvents();
    renderFooter3();
  }

  function renderFooter3() {
    const footer = document.getElementById('booking-footer');
    footer.innerHTML = `
      <button class="booking-btn booking-btn-back" id="btn-back-2"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg></button>
      <button class="booking-btn booking-btn-next" ${state.date ? '' : 'disabled'} id="btn-next-2">Continue</button>
    `;
    document.getElementById('btn-back-2').addEventListener('click', () => { state.step = 2; render(); });
    if (state.date) {
      document.getElementById('btn-next-2').addEventListener('click', () => { state.step = 4; render(); });
    }
  }

  // ── STEP 4: Select Time Slot ──
  async function renderStep4() {
    const body = document.getElementById('booking-body');
    body.innerHTML = `
      <div class="step-label">Step 4 of 6</div>
      <div class="step-title">Select a Time Slot</div>
      <div class="time-slots" id="time-slots-grid">
        <div style="grid-column:1/-1;text-align:center;color:#888;font-size:0.85rem;padding:1rem;">Loading available slots...</div>
      </div>
    `;
    renderFooter4();

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

  function renderFooter4() {
    const footer = document.getElementById('booking-footer');
    footer.innerHTML = `
      <button class="booking-btn booking-btn-back" id="btn-back-3"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg></button>
      <button class="booking-btn booking-btn-next" ${state.timeSlot ? '' : 'disabled'} id="btn-next-3">Continue</button>
    `;
    document.getElementById('btn-back-3').addEventListener('click', () => { state.step = 3; render(); });
    if (state.timeSlot) {
      document.getElementById('btn-next-3').addEventListener('click', () => { state.step = 5; render(); });
    }
  }

  // ── STEP 5: Customer Details ──
  function renderStep5() {
    const body = document.getElementById('booking-body');
    body.innerHTML = `
      <div class="step-label">Step 5 of 6</div>
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
      renderFooter5();
    }

    [nameEl, phoneEl, vehicleEl, notesEl].forEach(el => el.addEventListener('input', sync));
    renderFooter5();
  }

  function renderFooter5() {
    const footer = document.getElementById('booking-footer');
    const valid = state.name && /^[6-9]\d{9}$/.test(state.phone) && state.vehicleNumber.length >= 4;
    footer.innerHTML = `
      <button class="booking-btn booking-btn-back" id="btn-back-4"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg></button>
      <button class="booking-btn booking-btn-next" ${valid ? '' : 'disabled'} id="btn-next-4">Review Booking</button>
    `;
    document.getElementById('btn-back-4').addEventListener('click', () => { state.step = 4; render(); });
    if (valid) {
      document.getElementById('btn-next-4').addEventListener('click', () => { state.step = 6; render(); });
    }
  }

  // ── STEP 6: Review & Payment ──
  let razorpayKeyId = null;
  let activeRzpInstance = null;
  let paymentPollInterval = null;
  let activeQrCodeId = null;

  function isMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  }

  async function fetchRazorpayKey() {
    if (razorpayKeyId) return razorpayKeyId;
    try {
      const res = await fetch(`${API_BASE}/api/config`);
      const data = await res.json();
      razorpayKeyId = data.razorpayKeyId;
      return razorpayKeyId;
    } catch {
      return null;
    }
  }

  function stopPaymentPolling() {
    if (paymentPollInterval) {
      clearInterval(paymentPollInterval);
      paymentPollInterval = null;
    }
  }

  function startPaymentPolling(params) {
    stopPaymentPolling();
    paymentPollInterval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/payment-status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params)
        });
        const data = await res.json();
        if (data.status === 'paid') {
          stopPaymentPolling();
          activeQrCodeId = null;
          state.booking = data.booking;
          state.step = 7;
          render();
        }
      } catch (e) {
        // Silently retry on next interval
      }
    }, 3000);
  }

  function cleanupPaymentState() {
    stopPaymentPolling();
    if (activeQrCodeId) {
      fetch(`${API_BASE}/api/close-qr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qrCodeId: activeQrCodeId })
      }).catch(() => {});
      activeQrCodeId = null;
    }
    activeRzpInstance = null;
  }

  function renderStep6() {
    const body = document.getElementById('booking-body');
    const formattedDate = formatDate(state.date);
    const priceDisplay = state.price.toLocaleString('en-IN');
    const mobile = isMobile();

    // Build UPI panel based on device type
    let upiPanelHtml;
    if (mobile) {
      // MOBILE: UPI ID input + app buttons
      upiPanelHtml = `
        <div class="pay-panel active" id="panel-upi">
          <div class="form-group">
            <label>UPI ID</label>
            <input type="text" id="pay-upi-id" placeholder="yourname@okicici" autocomplete="off" spellcheck="false">
          </div>
          <button class="booking-btn booking-btn-pay" id="btn-pay-upi">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            Pay \u20B9${priceDisplay}
          </button>
          <div class="upi-apps-divider"><span>or pay using app</span></div>
          <div class="upi-apps-grid">
            <button class="upi-app-btn" data-app="gpay">
              <span class="upi-app-icon gpay">G</span>
              <span>GPay</span>
            </button>
            <button class="upi-app-btn" data-app="phonepe">
              <span class="upi-app-icon phonepe">P</span>
              <span>PhonePe</span>
            </button>
            <button class="upi-app-btn" data-app="paytm">
              <span class="upi-app-icon paytm">P</span>
              <span>Paytm</span>
            </button>
            <button class="upi-app-btn" data-app="bhim">
              <span class="upi-app-icon bhim">B</span>
              <span>BHIM</span>
            </button>
          </div>
          <div class="upi-apps-note">Opens UPI app on your phone</div>
        </div>`;
    } else {
      // DESKTOP: QR code + UPI ID input (no app buttons)
      upiPanelHtml = `
        <div class="pay-panel active" id="panel-upi">
          <div class="upi-qr-section" id="upi-qr-section">
            <div class="upi-qr-title">Scan with any UPI app</div>
            <div class="upi-qr-container" id="upi-qr-container">
              <div class="upi-qr-loading">
                <div class="pay-spinner" style="width:24px;height:24px;border-width:2px;"></div>
                <span>Generating QR code...</span>
              </div>
            </div>
            <div class="upi-qr-amount">\u20B9${priceDisplay}</div>
          </div>
          <div class="upi-apps-divider"><span>or enter UPI ID</span></div>
          <div class="form-group">
            <label>UPI ID</label>
            <input type="text" id="pay-upi-id" placeholder="yourname@okicici" autocomplete="off" spellcheck="false">
          </div>
          <button class="booking-btn booking-btn-pay" id="btn-pay-upi">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            Pay \u20B9${priceDisplay}
          </button>
        </div>`;
    }

    body.innerHTML = `
      <div id="step5-content">
        <div class="step5-top-row">
          <div>
            <div class="step-label">Step 6 of 6</div>
            <div class="step-title" style="margin-bottom:0">Review & Pay</div>
          </div>
          <button class="step5-back-link" id="btn-back-5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
            Edit Details
          </button>
        </div>
        <div class="review-summary">
          <div class="review-row">
            <span class="review-label">Service</span>
            <span class="review-value">${state.service.name}</span>
          </div>
          <div class="review-row">
            <span class="review-label">Vehicle</span>
            <span class="review-value">${state.vehicleType.name}</span>
          </div>
          <div class="review-row">
            <span class="review-label">Date & Time</span>
            <span class="review-value">${formattedDate}, ${state.timeSlot}</span>
          </div>
          <div class="review-row">
            <span class="review-label">Customer</span>
            <span class="review-value">${escapeHtml(state.name)} &middot; +91 ${state.phone}</span>
          </div>
          <div class="review-total">
            <span class="review-label">Total</span>
            <span class="review-value">\u20B9${priceDisplay}</span>
          </div>
        </div>

        <div class="pay-method-tabs">
          <button class="pay-method-tab active" data-tab="upi">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
            UPI
          </button>
          <button class="pay-method-tab" data-tab="card">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
            Card
          </button>
        </div>

        ${upiPanelHtml}

        <div class="pay-panel" id="panel-card">
          <div class="form-group">
            <label>Card Number</label>
            <input type="text" id="pay-card-number" placeholder="1234 5678 9012 3456" maxlength="19" inputmode="numeric" autocomplete="cc-number">
          </div>
          <div class="card-fields-row">
            <div class="form-group">
              <label>Expiry</label>
              <input type="text" id="pay-card-expiry" placeholder="MM / YY" maxlength="7" inputmode="numeric" autocomplete="cc-exp">
            </div>
            <div class="form-group">
              <label>CVV</label>
              <input type="password" id="pay-card-cvv" placeholder="&#8226;&#8226;&#8226;" maxlength="4" inputmode="numeric" autocomplete="cc-csc">
            </div>
          </div>
          <div class="form-group">
            <label>Cardholder Name</label>
            <input type="text" id="pay-card-name" placeholder="Name on card" autocomplete="cc-name">
          </div>
          <button class="booking-btn booking-btn-pay" id="btn-pay-card">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            Pay \u20B9${priceDisplay}
          </button>
        </div>

        <div class="pay-secure-note">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          Secured by Razorpay
        </div>
      </div>

      <div class="pay-loading" id="pay-loading">
        <div class="pay-spinner"></div>
        <div class="pay-loading-text" id="pay-loading-text">Processing payment...</div>
        <button class="pay-cancel-btn" id="pay-cancel-btn" style="display:none">Cancel</button>
      </div>
    `;

    // Tab switching
    body.querySelectorAll('.pay-method-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        body.querySelectorAll('.pay-method-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        body.querySelectorAll('.pay-panel').forEach(p => p.classList.remove('active'));
        document.getElementById('panel-' + tab.dataset.tab).classList.add('active');
      });
    });

    // Card number formatting (4-4-4-4)
    const cardNumEl = document.getElementById('pay-card-number');
    cardNumEl.addEventListener('input', () => {
      let v = cardNumEl.value.replace(/\D/g, '').slice(0, 16);
      cardNumEl.value = v.replace(/(\d{4})(?=\d)/g, '$1 ');
    });

    // Expiry formatting (MM / YY)
    const expiryEl = document.getElementById('pay-card-expiry');
    expiryEl.addEventListener('input', () => {
      let v = expiryEl.value.replace(/\D/g, '').slice(0, 4);
      if (v.length >= 3) v = v.slice(0, 2) + ' / ' + v.slice(2);
      expiryEl.value = v;
    });

    // UPI Pay button (collect flow — works on both mobile and desktop)
    document.getElementById('btn-pay-upi').addEventListener('click', () => {
      const vpa = document.getElementById('pay-upi-id').value.trim();
      if (!vpa || !vpa.includes('@')) {
        alert('Please enter a valid UPI ID (e.g. yourname@okicici)');
        return;
      }
      // On desktop, close the active QR before starting collect flow
      if (!mobile && activeQrCodeId) {
        cleanupPaymentState();
      }
      processPayment('upi_collect', { vpa });
    });

    // Card Pay button
    document.getElementById('btn-pay-card').addEventListener('click', () => {
      const num = document.getElementById('pay-card-number').value.replace(/\s/g, '');
      const expRaw = document.getElementById('pay-card-expiry').value.replace(/\D/g, '');
      const cvv = document.getElementById('pay-card-cvv').value.trim();
      const cardName = document.getElementById('pay-card-name').value.trim();
      if (num.length < 13) { alert('Please enter a valid card number'); return; }
      if (expRaw.length !== 4) { alert('Please enter a valid expiry (MM/YY)'); return; }
      if (cvv.length < 3) { alert('Please enter a valid CVV'); return; }
      if (!cardName) { alert('Please enter the cardholder name'); return; }
      // Close active QR on desktop
      if (!mobile && activeQrCodeId) {
        cleanupPaymentState();
      }
      processPayment('card', {
        number: num,
        expMonth: expRaw.slice(0, 2),
        expYear: expRaw.slice(2),
        cvv,
        name: cardName
      });
    });

    // UPI app buttons — mobile only (intent flow)
    if (mobile) {
      body.querySelectorAll('.upi-app-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          processPayment('upi_intent', { app: btn.dataset.app });
        });
      });
    }

    // Desktop: auto-generate QR code when UPI tab is shown
    if (!mobile) {
      loadUpiQrCode();
    }

    document.getElementById('booking-footer').innerHTML = '';
    document.getElementById('btn-back-5').addEventListener('click', () => {
      cleanupPaymentState();
      state.step = 5;
      render();
    });
  }

  async function loadUpiQrCode() {
    const container = document.getElementById('upi-qr-container');
    if (!container) return;

    const bookingData = {
      service: state.service.name,
      vehicleType: state.vehicleType.name,
      price: state.price,
      date: state.date,
      timeSlot: state.timeSlot,
      name: state.name,
      phone: '91' + state.phone,
      vehicleNumber: state.vehicleNumber,
      notes: state.notes
    };

    try {
      const res = await fetch(`${API_BASE}/api/create-upi-qr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bookingData)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate QR');

      activeQrCodeId = data.qrCodeId;

      container.innerHTML = `<img class="upi-qr-image" src="${data.qrImageUrl}" alt="UPI QR Code">`;

      // Start polling for QR payment
      startPaymentPolling({
        qrCodeId: data.qrCodeId,
        bookingId: data.bookingId,
        ...bookingData
      });
    } catch (err) {
      container.innerHTML = `<div class="upi-qr-error">Could not generate QR code.<br>Please use UPI ID below.</div>`;
    }
  }

  async function processPayment(method, details) {
    const content = document.getElementById('step5-content');
    const loading = document.getElementById('pay-loading');
    const loadingText = document.getElementById('pay-loading-text');
    const cancelBtn = document.getElementById('pay-cancel-btn');

    content.style.display = 'none';
    loading.classList.add('active');
    loadingText.textContent = 'Creating order...';
    cancelBtn.style.display = 'none';

    const bookingData = {
      service: state.service.name,
      vehicleType: state.vehicleType.name,
      price: state.price,
      date: state.date,
      timeSlot: state.timeSlot,
      name: state.name,
      phone: '91' + state.phone,
      vehicleNumber: state.vehicleNumber,
      notes: state.notes
    };

    try {
      const keyId = await fetchRazorpayKey();
      if (!keyId) throw new Error('Could not load payment config');

      const orderRes = await fetch(`${API_BASE}/api/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bookingData)
      });
      const orderData = await orderRes.json();
      if (!orderRes.ok) throw new Error(orderData.error || 'Failed to create order');

      loadingText.textContent = 'Processing payment...';

      // Initialize Razorpay Custom Checkout
      const rzp = new window.Razorpay({ key: keyId });
      activeRzpInstance = rzp;

      const paymentBase = {
        order_id: orderData.orderId,
        amount: orderData.amount,
        currency: orderData.currency,
        email: 'booking@roadrunners.in',
        contact: '91' + state.phone,
      };

      let paymentPayload;

      if (method === 'upi_collect') {
        paymentPayload = {
          ...paymentBase,
          method: 'upi',
          '_[flow]': 'collect',
          'upi.vpa': details.vpa
        };
        loadingText.textContent = 'Waiting for payment confirmation...';
        cancelBtn.style.display = '';
      } else if (method === 'upi_intent') {
        paymentPayload = {
          ...paymentBase,
          method: 'upi',
          '_[flow]': 'intent',
        };
        loadingText.textContent = 'Waiting for payment confirmation...';
        cancelBtn.style.display = '';
      } else if (method === 'card') {
        paymentPayload = {
          ...paymentBase,
          method: 'card',
          'card[name]': details.name,
          'card[number]': details.number,
          'card[expiry_month]': details.expMonth,
          'card[expiry_year]': details.expYear,
          'card[cvv]': details.cvv
        };
      }

      // Start polling as backup confirmation for UPI methods
      if (method === 'upi_collect' || method === 'upi_intent') {
        startPaymentPolling({
          orderId: orderData.orderId,
          bookingId: orderData.bookingId,
          ...bookingData
        });
      }

      // Cancel button handler
      cancelBtn.onclick = () => {
        stopPaymentPolling();
        activeRzpInstance = null;
        loading.classList.remove('active');
        content.style.display = '';
        cancelBtn.style.display = 'none';
      };

      // Register event handlers before creating payment
      rzp.on('payment.success', async function (response) {
        stopPaymentPolling();
        cancelBtn.style.display = 'none';
        loadingText.textContent = 'Verifying payment...';

        try {
          const verifyRes = await fetch(`${API_BASE}/api/verify-payment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              bookingId: orderData.bookingId,
              ...bookingData
            })
          });
          const verifyData = await verifyRes.json();

          if (verifyData.success) {
            state.booking = verifyData.booking;
            state.step = 7;
            render();
          } else {
            throw new Error(verifyData.error || 'Payment verification failed');
          }
        } catch (err) {
          alert(err.message || 'Verification failed. Please contact support.');
          loading.classList.remove('active');
          content.style.display = '';
        }
      });

      rzp.on('payment.error', function (response) {
        stopPaymentPolling();
        const msg = response.error?.description || 'Payment failed. Please try again.';
        alert(msg);
        loading.classList.remove('active');
        content.style.display = '';
        cancelBtn.style.display = 'none';
      });

      rzp.createPayment(paymentPayload);

    } catch (err) {
      stopPaymentPolling();
      alert(err.message || 'Something went wrong. Please try again.');
      loading.classList.remove('active');
      content.style.display = '';
    }
  }

  // ── STEP 7: Confirmation ──
  function renderStep7() {
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
