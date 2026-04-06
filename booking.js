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
    '09:30', '10:30', '11:30', '12:30',
    '14:00', '15:00', '16:00', '17:00',
    '18:00', '19:00', '19:30'
  ];

  // Convert 24-hour "HH:MM" to display "h:MM AM/PM"
  function formatTime(slot) {
    const [h, m] = slot.split(':').map(Number);
    const suffix = h < 12 ? 'AM' : 'PM';
    const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${display}:${String(m).padStart(2, '0')} ${suffix}`;
  }

  let state = {
    step: 1,
    service: null,
    vehicleType: null,
    price: null,
    date: null,
    timeSlot: null,
    name: '',
    phone: '',
    email: '',
    notes: '',
    bookedSlots: [],
    booking: null
  };

  // Determine API base URL
  const API_BASE = window.location.origin;

  // IST helpers — all date logic uses Indian Standard Time (UTC+5:30)
  function getNowIST() {
    const now = new Date();
    const utc = now.getTime() + now.getTimezoneOffset() * 60000;
    return new Date(utc + 5.5 * 3600000);
  }
  function toDateStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

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
    state = { step: 1, service: null, vehicleType: null, price: null, date: null, timeSlot: null, name: '', phone: '', email: '', notes: '', bookedSlots: [], booking: null };
    const overlay = document.getElementById('booking-overlay');
    overlay.style.display = 'flex';
    requestAnimationFrame(() => overlay.classList.add('active'));
    document.body.style.overflow = 'hidden';
    render();
  }

  function closeBooking() {
    stopOtpResendTimer();
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
    const nowIST = getNowIST();
    const todayStr = toDateStr(nowIST);

    // Allow today if current IST time is before 7:30 PM (last slot)
    const canBookToday = nowIST.getHours() < 19 || (nowIST.getHours() === 19 && nowIST.getMinutes() < 30);
    const minDateObj = canBookToday
      ? new Date(nowIST.getFullYear(), nowIST.getMonth(), nowIST.getDate())
      : new Date(nowIST.getFullYear(), nowIST.getMonth(), nowIST.getDate() + 1);
    const minStr = toDateStr(minDateObj);
    const maxDateObj = new Date(nowIST.getFullYear(), nowIST.getMonth() + 2, nowIST.getDate());
    const maxStr = toDateStr(maxDateObj);

    // Determine which month to show
    let viewDate;
    if (state.date) {
      const parts = state.date.split('-');
      viewDate = new Date(+parts[0], +parts[1] - 1, 1);
    } else {
      viewDate = new Date(minDateObj.getFullYear(), minDateObj.getMonth(), 1);
    }

    function buildCalendar(viewYear, viewMonth) {
      const firstDay = new Date(viewYear, viewMonth, 1).getDay();
      const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
      const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];

      // Can navigate to prev month if it contains any dates >= minDate
      const prevMonthLastDay = toDateStr(new Date(viewYear, viewMonth, 0));
      const canPrev = prevMonthLastDay >= minStr;
      const nextMonthFirstDay = toDateStr(new Date(viewYear, viewMonth + 1, 1));
      const canNext = nextMonthFirstDay <= maxStr;

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
        const dateStr = `${viewYear}-${String(viewMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const isDisabled = dateStr < minStr || dateStr > maxStr;
        const isSelected = state.date === dateStr;
        const isToday = dateStr === todayStr;
        let cls = 'cal-cell';
        if (isDisabled) cls += ' disabled';
        if (isSelected) cls += ' selected';
        if (isToday && !isSelected && !isDisabled) cls += ' today';
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

  // Convert slot string like "9:30 AM" or "12:30 PM" to 24h minutes
  function slotToMinutes(slot) {
    const [h, m] = slot.split(':').map(Number);
    return h * 60 + m;
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

    // If selected date is today, filter out past time slots
    const nowIST = getNowIST();
    const isToday = state.date === toDateStr(nowIST);
    const currentMinutes = isToday ? nowIST.getHours() * 60 + nowIST.getMinutes() : 0;

    const grid = document.getElementById('time-slots-grid');
    let html = '';
    TIME_SLOTS.forEach(slot => {
      const isPast = isToday && slotToMinutes(slot) <= currentMinutes;
      const isBooked = state.bookedSlots.includes(slot);
      const isUnavailable = isBooked || isPast;
      const isSel = state.timeSlot === slot && !isUnavailable;
      const cls = isUnavailable ? 'booked' : isSel ? 'selected' : '';
      const label = isBooked ? ' (Booked)' : '';
      html += `<div class="time-slot ${cls}" data-slot="${slot}">${formatTime(slot)}${label}</div>`;
    });
    grid.innerHTML = html;

    // If previously selected slot is now past, clear it
    if (state.timeSlot && isToday && slotToMinutes(state.timeSlot) <= currentMinutes) {
      state.timeSlot = null;
      renderFooter4();
    }

    grid.querySelectorAll('.time-slot:not(.booked)').forEach(el => {
      el.addEventListener('click', () => {
        state.timeSlot = el.dataset.slot;
        grid.querySelectorAll('.time-slot').forEach(s => s.classList.remove('selected'));
        el.classList.add('selected');
        renderFooter4();
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
        <label>Email Address (Optional)</label>
        <input type="email" id="b-email" placeholder="e.g. rajesh@gmail.com" value="${escapeHtml(state.email)}">
      </div>
      <div class="form-group">
        <label>Special Notes (Optional)</label>
        <textarea id="b-notes" placeholder="Any specific requests...">${escapeHtml(state.notes)}</textarea>
      </div>
    `;

    const nameEl = document.getElementById('b-name');
    const phoneEl = document.getElementById('b-phone');
    const emailEl = document.getElementById('b-email');
    const notesEl = document.getElementById('b-notes');

    function sync() {
      state.name = nameEl.value.trim();
      state.phone = phoneEl.value.trim();
      state.email = emailEl.value.trim();
      state.notes = notesEl.value.trim();
      renderFooter5();
    }

    [nameEl, phoneEl, emailEl, notesEl].forEach(el => el.addEventListener('input', sync));
    renderFooter5();
  }

  function renderFooter5() {
    const footer = document.getElementById('booking-footer');
    const valid = state.name && /^[6-9]\d{9}$/.test(state.phone);
    footer.innerHTML = `
      <button class="booking-btn booking-btn-back" id="btn-back-4"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg></button>
      <button class="booking-btn booking-btn-next" ${valid ? '' : 'disabled'} id="btn-next-4">Review Booking</button>
    `;
    document.getElementById('btn-back-4').addEventListener('click', () => { state.step = 4; render(); });
    if (valid) {
      document.getElementById('btn-next-4').addEventListener('click', () => { state.step = 6; render(); });
    }
  }

  // ── STEP 6: Review & Confirm ──
  let otpResendTimer = null;

  function stopOtpResendTimer() {
    if (otpResendTimer) {
      clearInterval(otpResendTimer);
      otpResendTimer = null;
    }
  }

  function renderStep6() {
    stopOtpResendTimer();
    const body = document.getElementById('booking-body');
    const formattedDate = formatDate(state.date);
    const priceDisplay = state.price.toLocaleString('en-IN');

    body.innerHTML = `
      <div id="step6-content">
        <div class="step5-top-row">
          <div>
            <div class="step-label">Step 6 of 7</div>
            <div class="step-title" style="margin-bottom:0">Review & Confirm</div>
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
            <span class="review-value">${formattedDate}, ${formatTime(state.timeSlot)}</span>
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

        <button class="booking-btn" id="btn-confirm-booking" style="margin-top:1rem;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          Confirm Booking
        </button>
        <div class="otp-note" style="text-align:center;color:#aaa;font-size:0.75rem;margin-top:0.5rem;">
          A verification code will be sent to your WhatsApp
        </div>
      </div>

      <div id="otp-screen" style="display:none;">
        <div class="step-label">Step 6 of 7</div>
        <div class="step-title">Verify Your Number</div>
        <p class="otp-instruction">We've sent a 6-digit code to<br><strong>+91 ${state.phone}</strong> on WhatsApp</p>

        <div class="otp-input-group" id="otp-input-group">
          <input type="text" inputmode="numeric" maxlength="1" class="otp-digit" data-idx="0" autocomplete="off">
          <input type="text" inputmode="numeric" maxlength="1" class="otp-digit" data-idx="1" autocomplete="off">
          <input type="text" inputmode="numeric" maxlength="1" class="otp-digit" data-idx="2" autocomplete="off">
          <input type="text" inputmode="numeric" maxlength="1" class="otp-digit" data-idx="3" autocomplete="off">
          <input type="text" inputmode="numeric" maxlength="1" class="otp-digit" data-idx="4" autocomplete="off">
          <input type="text" inputmode="numeric" maxlength="1" class="otp-digit" data-idx="5" autocomplete="off">
        </div>

        <div class="otp-error" id="otp-error" style="display:none;"></div>

        <button class="booking-btn" id="btn-verify-otp" disabled>Verify & Book</button>

        <div class="otp-resend" id="otp-resend">
          <span id="otp-resend-timer">Resend code in <strong>30s</strong></span>
          <button class="otp-resend-btn" id="btn-resend-otp" style="display:none;">Resend Code</button>
        </div>

        <button class="otp-back-link" id="btn-back-review">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
          Back to Review
        </button>
      </div>

      <div class="otp-loading" id="otp-loading">
        <div class="pay-spinner"></div>
        <div class="otp-loading-text" id="otp-loading-text">Sending verification code...</div>
      </div>
    `;

    const footer = document.getElementById('booking-footer');
    footer.innerHTML = '';

    // Edit Details button
    document.getElementById('btn-back-5').addEventListener('click', () => {
      stopOtpResendTimer();
      state.step = 5;
      render();
    });

    // Confirm Booking button — sends OTP
    document.getElementById('btn-confirm-booking').addEventListener('click', sendOtp);

    // OTP digit inputs — auto-advance, paste support
    setupOtpInputs();

    // Verify OTP button
    document.getElementById('btn-verify-otp').addEventListener('click', verifyOtp);

    // Resend OTP
    document.getElementById('btn-resend-otp').addEventListener('click', sendOtp);

    // Back to review
    document.getElementById('btn-back-review').addEventListener('click', () => {
      stopOtpResendTimer();
      document.getElementById('otp-screen').style.display = 'none';
      document.getElementById('step6-content').style.display = '';
      document.getElementById('otp-loading').classList.remove('active');
    });
  }

  function setupOtpInputs() {
    const digits = document.querySelectorAll('.otp-digit');
    const verifyBtn = document.getElementById('btn-verify-otp');

    function checkComplete() {
      const code = Array.from(digits).map(d => d.value).join('');
      verifyBtn.disabled = code.length !== 6;
    }

    digits.forEach((input, idx) => {
      input.addEventListener('input', (e) => {
        const val = e.target.value.replace(/\D/g, '');
        e.target.value = val.charAt(0) || '';
        if (val && idx < 5) digits[idx + 1].focus();
        checkComplete();
      });

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !input.value && idx > 0) {
          digits[idx - 1].focus();
          digits[idx - 1].value = '';
          checkComplete();
        }
      });

      // Handle paste
      input.addEventListener('paste', (e) => {
        e.preventDefault();
        const pasted = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6);
        pasted.split('').forEach((ch, i) => {
          if (digits[i]) digits[i].value = ch;
        });
        if (pasted.length > 0) digits[Math.min(pasted.length, 5)].focus();
        checkComplete();
      });
    });
  }

  async function sendOtp() {
    const content = document.getElementById('step6-content');
    const otpScreen = document.getElementById('otp-screen');
    const loading = document.getElementById('otp-loading');
    const loadingText = document.getElementById('otp-loading-text');
    const errorEl = document.getElementById('otp-error');

    content.style.display = 'none';
    otpScreen.style.display = 'none';
    loading.classList.add('active');
    loadingText.textContent = 'Sending verification code...';

    try {
      const res = await fetch(`${API_BASE}/api/send-otp`, {
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
          email: state.email,
          notes: state.notes
        })
      });
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error('Server error. Please try again.');
      }
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to send OTP');
      }

      // Show OTP screen
      loading.classList.remove('active');
      otpScreen.style.display = '';

      // Clear previous OTP inputs
      document.querySelectorAll('.otp-digit').forEach(d => { d.value = ''; });
      document.getElementById('btn-verify-otp').disabled = true;
      if (errorEl) { errorEl.style.display = 'none'; errorEl.textContent = ''; }

      // Focus first digit
      const firstDigit = document.querySelector('.otp-digit[data-idx="0"]');
      if (firstDigit) firstDigit.focus();

      // Start resend countdown
      startResendCountdown();

    } catch (err) {
      loading.classList.remove('active');
      content.style.display = '';
      alert(err.message || 'Failed to send verification code. Please try again.');
    }
  }

  function startResendCountdown() {
    stopOtpResendTimer();
    const timerSpan = document.getElementById('otp-resend-timer');
    const resendBtn = document.getElementById('btn-resend-otp');
    let seconds = 30;

    if (timerSpan) { timerSpan.style.display = ''; timerSpan.innerHTML = `Resend code in <strong>${seconds}s</strong>`; }
    if (resendBtn) resendBtn.style.display = 'none';

    otpResendTimer = setInterval(() => {
      seconds--;
      if (timerSpan) timerSpan.innerHTML = `Resend code in <strong>${seconds}s</strong>`;
      if (seconds <= 0) {
        stopOtpResendTimer();
        if (timerSpan) timerSpan.style.display = 'none';
        if (resendBtn) resendBtn.style.display = '';
      }
    }, 1000);
  }

  async function verifyOtp() {
    const digits = document.querySelectorAll('.otp-digit');
    const code = Array.from(digits).map(d => d.value).join('');
    const errorEl = document.getElementById('otp-error');
    const verifyBtn = document.getElementById('btn-verify-otp');
    const otpScreen = document.getElementById('otp-screen');
    const loading = document.getElementById('otp-loading');
    const loadingText = document.getElementById('otp-loading-text');

    if (code.length !== 6) return;

    otpScreen.style.display = 'none';
    loading.classList.add('active');
    loadingText.textContent = 'Verifying...';

    try {
      const res = await fetch(`${API_BASE}/api/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: '91' + state.phone,
          otp: code
        })
      });
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('application/json')) {
        throw new Error('Server error. Please try again.');
      }
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Verification failed');
      }

      // Success — go to confirmation
      stopOtpResendTimer();
      state.booking = data.booking;
      state.step = 7;
      render();

    } catch (err) {
      loading.classList.remove('active');
      otpScreen.style.display = '';
      if (errorEl) {
        errorEl.textContent = err.message;
        errorEl.style.display = '';
      }
      // Clear inputs for retry
      digits.forEach(d => { d.value = ''; });
      verifyBtn.disabled = true;
      const firstDigit = document.querySelector('.otp-digit[data-idx="0"]');
      if (firstDigit) firstDigit.focus();
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
            <span class="review-value">${formatTime(b.timeSlot)}</span>
          </div>
          <div class="review-row">
            <span class="review-label">Amount</span>
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
