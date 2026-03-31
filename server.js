require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const { google } = require('googleapis');
const Razorpay = require('razorpay');

const app = express();
const PORT = process.env.PORT || 3000;
const TEST_MODE = process.env.TEST_MODE === 'true';

// Google Sheets auth (service account)
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    private_key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });
const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SHEET_RANGE = 'Sheet1';

// Razorpay — resolve key names (support both RAZORPAY_KEY_ID and RAZORPAY_KEY_ID_LIVE)
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID_LIVE;
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || process.env.RAZORPAY_KEY_SECRET_LIVE;

if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
  console.error('⚠ RAZORPAY KEYS MISSING — Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in environment variables');
  console.error('  Available env vars:', Object.keys(process.env).filter(k => k.includes('RAZORPAY')).join(', ') || '(none)');
} else {
  console.log(`Razorpay initialized with key: ${RAZORPAY_KEY_ID.substring(0, 12)}...`);
}

const razorpay = (RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET)
  ? new Razorpay({ key_id: RAZORPAY_KEY_ID, key_secret: RAZORPAY_KEY_SECRET })
  : null;

app.use(cors());
app.use(express.json());

function generateBookingId() {
  const year = new Date().getFullYear();
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `RR-${year}-${rand}`;
}

async function getAllRows() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_RANGE}!A2:L`,
  });
  return res.data.values || [];
}

// In-memory lock to prevent concurrent saves for the same booking
const saveLocks = new Map();

// Helper: Save booking to Google Sheets (idempotent — safe to call multiple times)
async function saveBooking(bookingData) {
  const { bookingId, name, phone, vehicleNumber, email, service, vehicleType, price, date, timeSlot, notes } = bookingData;

  // Wait if another save for this bookingId is in progress
  if (saveLocks.has(bookingId)) {
    await saveLocks.get(bookingId);
  }

  let resolve;
  const lock = new Promise(r => { resolve = r; });
  saveLocks.set(bookingId, lock);

  try {
  const rows = await getAllRows();

  // Idempotency: if booking already saved, return it
  const existingRow = rows.find(r => r[0] === bookingId);
  if (existingRow) {
    return {
      id: existingRow[0], name: existingRow[1], phone: existingRow[2],
      email: existingRow[3], service: existingRow[4], vehicleType: existingRow[5],
      price: Number(existingRow[6]), date: existingRow[7], timeSlot: existingRow[8],
      notes: existingRow[9] || '', status: existingRow[10], createdAt: existingRow[11]
    };
  }

  // Race-condition guard: check slot availability
  const slotTaken = rows.some(
    r => r[7] === date && r[8] === timeSlot && (r[10] || 'confirmed') !== 'cancelled'
  );
  if (slotTaken) {
    const err = new Error('This time slot was just booked by someone else. Your payment will be refunded.');
    err.code = 'SLOT_TAKEN';
    throw err;
  }

  const createdAt = new Date().toISOString();

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_RANGE}!A:L`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [[
        bookingId, name, phone, email || '', service, vehicleType,
        price, date, timeSlot, notes || '', 'confirmed', createdAt
      ]]
    }
  });

  const booking = {
    id: bookingId, service, vehicleType, price, date, timeSlot,
    name, phone, email: email || '', notes: notes || '', status: 'confirmed', createdAt
  };

  sendWhatsAppNotifications(booking).catch(err => {
    console.error('WhatsApp notification error:', err.message);
  });

  return booking;
  } finally {
    saveLocks.delete(bookingId);
    resolve();
  }
}

// Expose Razorpay key ID to frontend (public key, safe to expose)
app.get('/api/config', (req, res) => {
  if (!RAZORPAY_KEY_ID) {
    console.error('/api/config called but RAZORPAY_KEY_ID is not set');
    return res.status(500).json({ error: 'Payment configuration missing on server' });
  }
  res.json({ razorpayKeyId: RAZORPAY_KEY_ID });
});

// Get booked slots for a specific date
app.get('/api/slots/:date', async (req, res) => {
  try {
    const rows = await getAllRows();
    const bookedSlots = rows
      .filter(r => r[7] === req.params.date && (r[10] || 'confirmed') !== 'cancelled')
      .map(r => r[8]);
    res.json({ bookedSlots });
  } catch (err) {
    console.error('Error fetching slots:', err.message);
    res.status(500).json({ error: 'Failed to fetch available slots' });
  }
});

// Step 1: Create Razorpay order
app.post('/api/create-order', async (req, res) => {
  if (!razorpay) {
    console.error('POST /api/create-order failed: Razorpay not initialized (missing keys)');
    return res.status(500).json({ error: 'Payment service not configured on server' });
  }

  const { service, vehicleType, price, date, timeSlot, name, phone, vehicleNumber, email, notes } = req.body;

  if (!service || !vehicleType || !price || !date || !timeSlot || !name || !phone) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Check if slot is already taken before creating order
    const rows = await getAllRows();
    const slotTaken = rows.some(
      r => r[7] === date && r[8] === timeSlot && (r[10] || 'confirmed') !== 'cancelled'
    );

    if (slotTaken) {
      return res.status(409).json({ error: 'This time slot is already booked' });
    }

    // In test mode, charge ₹1 (100 paise) instead of full price
    const amountInPaise = TEST_MODE ? 100 : price * 100;

    const order = await razorpay.orders.create({
      amount: amountInPaise,
      currency: 'INR',
      receipt: generateBookingId(),
      notes: {
        service,
        vehicleType,
        date,
        timeSlot,
        customerName: name,
        customerPhone: phone,
        customerEmail: email || '',
        vehicleNumber: vehicleNumber || '',
        actualPrice: String(price),
        bookingNotes: notes || '',
      }
    });

    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      bookingId: order.receipt,
    });
  } catch (err) {
    console.error('Error creating Razorpay order:', err.message);
    res.status(500).json({ error: 'Failed to create payment order' });
  }
});

// Step 2: Verify payment and save booking
app.post('/api/verify-payment', async (req, res) => {
  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    bookingId,
    service, vehicleType, price, date, timeSlot, name, phone, vehicleNumber, email, notes
  } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: 'Missing payment verification fields' });
  }

  // Verify signature
  const expectedSignature = crypto
    .createHmac('sha256', RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  if (expectedSignature !== razorpay_signature) {
    return res.status(400).json({ error: 'Payment verification failed' });
  }

  // Payment verified — save booking
  try {
    const booking = await saveBooking({
      bookingId, service, vehicleType, price, date, timeSlot, name, phone, vehicleNumber: vehicleNumber || '', email: email || '', notes
    });
    res.json({ success: true, booking });
  } catch (err) {
    if (err.code === 'SLOT_TAKEN') {
      return res.status(409).json({ error: err.message });
    }
    console.error('Error saving booking:', err.message);
    res.status(500).json({ error: 'Payment verified but failed to save booking. Please contact support.' });
  }
});

// Generate UPI QR code for desktop payment
app.post('/api/create-upi-qr', async (req, res) => {
  if (!razorpay) {
    console.error('POST /api/create-upi-qr failed: Razorpay not initialized (missing keys)');
    return res.status(500).json({ error: 'Payment service not configured on server' });
  }

  const { service, vehicleType, price, date, timeSlot, name, phone, vehicleNumber, email, notes } = req.body;

  if (!service || !vehicleType || !price || !date || !timeSlot || !name || !phone) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const rows = await getAllRows();
    const slotTaken = rows.some(
      r => r[7] === date && r[8] === timeSlot && (r[10] || 'confirmed') !== 'cancelled'
    );
    if (slotTaken) {
      return res.status(409).json({ error: 'This time slot is already booked' });
    }

    const bookingId = generateBookingId();
    const amountInPaise = TEST_MODE ? 100 : price * 100;
    const closeBy = Math.floor(Date.now() / 1000) + 900; // 15 min expiry

    const qr = await razorpay.qrCode.create({
      type: 'upi_qr',
      name: 'RoadRunners Detailing',
      usage: 'single_use',
      fixed_amount: true,
      payment_amount: amountInPaise,
      description: `Booking ${bookingId}: ${service}`,
      close_by: closeBy,
      notes: {
        bookingId, service, vehicleType, date, timeSlot,
        customerName: name, customerPhone: phone, customerEmail: email || '',
        vehicleNumber: vehicleNumber || '',
        actualPrice: String(price), bookingNotes: notes || ''
      }
    });

    res.json({
      qrCodeId: qr.id,
      qrImageUrl: qr.image_url,
      bookingId,
      amount: amountInPaise,
    });
  } catch (err) {
    console.error('Error creating UPI QR:', err.message);
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

// Close an active QR code
app.post('/api/close-qr', async (req, res) => {
  try {
    if (req.body.qrCodeId) {
      await razorpay.qrCode.close(req.body.qrCodeId);
    }
    res.json({ success: true });
  } catch (err) {
    res.json({ success: true }); // Already closed or expired — fine
  }
});

// Poll payment status (for UPI QR and collect flows)
app.post('/api/payment-status', async (req, res) => {
  const { orderId, qrCodeId, bookingId, service, vehicleType, price, date, timeSlot, name, phone, vehicleNumber, email, notes } = req.body;

  try {
    let paid = false;

    if (qrCodeId) {
      const qr = await razorpay.qrCode.fetch(qrCodeId);
      if (qr.payments_amount_received > 0 && qr.payments_count_received > 0) {
        // Verify actual payment entity exists and amount matches
        try {
          const payments = await razorpay.qrCode.fetchAllPayments(qrCodeId);
          if (payments.items && payments.items.length > 0) {
            const payment = payments.items[0];
            const expectedAmount = TEST_MODE ? 100 : (Number(price) * 100);
            if (payment.status === 'captured' && payment.amount >= expectedAmount) {
              paid = true;
            }
          }
        } catch (fetchErr) {
          // If fetchAllPayments fails, fall back to basic check
          console.error('QR payment fetch error, using basic check:', fetchErr.message);
          paid = true;
        }
      }
    } else if (orderId) {
      const order = await razorpay.orders.fetch(orderId);
      if (order.status === 'paid') paid = true;
    } else {
      return res.status(400).json({ error: 'orderId or qrCodeId required' });
    }

    if (paid) {
      const booking = await saveBooking({
        bookingId, service, vehicleType, price, date, timeSlot, name, phone, vehicleNumber: vehicleNumber || '', email: email || '', notes
      });
      return res.json({ status: 'paid', booking });
    }

    res.json({ status: 'pending' });
  } catch (err) {
    if (err.code === 'SLOT_TAKEN') {
      return res.status(409).json({ error: err.message });
    }
    console.error('Error checking payment status:', err.message);
    res.status(500).json({ error: 'Failed to check payment status' });
  }
});

// WhatsApp notification via Meta Cloud API
async function sendWhatsAppNotifications(booking) {
  const token = process.env.META_WHATSAPP_TOKEN;
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID;
  const ownerNumber = process.env.OWNER_WHATSAPP_NUMBER;

  if (!token || !phoneNumberId) {
    console.log('WhatsApp API credentials not configured. Skipping notifications.');
    return;
  }

  const apiUrl = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  const customerPayload = {
    messaging_product: 'whatsapp',
    to: booking.phone,
    type: 'template',
    template: {
      name: 'customer_booking_confirmation',
      language: { code: 'en' },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: booking.name },
            { type: 'text', text: booking.id },
            { type: 'text', text: booking.service },
            { type: 'text', text: booking.vehicleType },
            { type: 'text', text: booking.date },
            { type: 'text', text: booking.timeSlot },
            { type: 'text', text: `${booking.price}` }
          ]
        }
      ]
    }
  };

  const ownerPayload = {
    messaging_product: 'whatsapp',
    to: ownerNumber,
    type: 'template',
    template: {
      name: 'owner_booking_alert',
      language: { code: 'en' },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: booking.name },
            { type: 'text', text: booking.phone },
            { type: 'text', text: booking.email || 'N/A' },
            { type: 'text', text: booking.service },
            { type: 'text', text: booking.vehicleType },
            { type: 'text', text: booking.date },
            { type: 'text', text: booking.timeSlot },
            { type: 'text', text: `${booking.price}` },
            { type: 'text', text: booking.id }
          ]
        }
      ]
    }
  };

  try {
    const customerRes = await fetch(apiUrl, { method: 'POST', headers, body: JSON.stringify(customerPayload) });
    const customerData = await customerRes.json();
    if (customerData.error) console.error('Customer WhatsApp error:', customerData.error);
    else console.log('Customer WhatsApp sent:', customerData);
  } catch (err) {
    console.error('Customer WhatsApp fetch error:', err.message);
  }

  if (ownerNumber) {
    try {
      const ownerRes = await fetch(apiUrl, { method: 'POST', headers, body: JSON.stringify(ownerPayload) });
      const ownerData = await ownerRes.json();
      if (ownerData.error) console.error('Owner WhatsApp error:', ownerData.error);
      else console.log('Owner WhatsApp sent:', ownerData);
    } catch (err) {
      console.error('Owner WhatsApp fetch error:', err.message);
    }
  }
}

// Static files — AFTER API routes so /api/* routes are matched first
app.use(express.static(__dirname));

app.listen(PORT, () => {
  console.log(`RoadRunners server running at http://localhost:${PORT}`);
  if (TEST_MODE) console.log('⚠ TEST MODE: Razorpay orders will be created for ₹1 instead of actual price');
});
