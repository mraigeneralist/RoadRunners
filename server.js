require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const { google } = require('googleapis');

const app = express();
const PORT = process.env.PORT || 3000;

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

const MAX_ACTIVE_BOOKINGS_PER_PHONE = 2;

app.use(cors());
app.use(express.json());

// ── OTP Store (in-memory, expires after 5 minutes) ──
// Key: phone number, Value: { code, expiresAt, attempts, bookingData }
const otpStore = new Map();

function generateOtp() {
  return crypto.randomInt(100000, 999999).toString();
}

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

// Helper: Save booking to Google Sheets (idempotent)
async function saveBooking(bookingData) {
  const { bookingId, name, phone, email, service, vehicleType, price, date, timeSlot, notes } = bookingData;

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

    // Check slot availability
    const slotTaken = rows.some(
      r => r[7] === date && r[8] === timeSlot && (r[10] || 'confirmed') !== 'cancelled'
    );
    if (slotTaken) {
      const err = new Error('This time slot was just booked by someone else.');
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

// ── API Routes ──

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

// Send OTP via WhatsApp for booking verification
app.post('/api/send-otp', async (req, res) => {
  const { service, vehicleType, price, date, timeSlot, name, phone, email, notes } = req.body;

  if (!service || !vehicleType || !price || !date || !timeSlot || !name || !phone) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Check slot availability
    let rows;
    try {
      rows = await getAllRows();
    } catch (sheetsErr) {
      console.error('Google Sheets error in send-otp:', sheetsErr.message, sheetsErr.stack);
      return res.status(500).json({ error: 'Unable to check slot availability. Please try again.' });
    }

    const slotTaken = rows.some(
      r => r[7] === date && r[8] === timeSlot && (r[10] || 'confirmed') !== 'cancelled'
    );
    if (slotTaken) {
      return res.status(409).json({ error: 'This time slot is already booked' });
    }

    // Check booking limit per phone number
    const activeBookings = rows.filter(
      r => r[2] === phone && (r[10] || 'confirmed') !== 'cancelled'
    );
    if (activeBookings.length >= MAX_ACTIVE_BOOKINGS_PER_PHONE) {
      return res.status(429).json({ error: `Maximum ${MAX_ACTIVE_BOOKINGS_PER_PHONE} active bookings per phone number. Please cancel an existing booking or contact us.` });
    }

    // Rate limit: don't send another OTP if one was sent less than 30 seconds ago
    const existing = otpStore.get(phone);
    if (existing && existing.sentAt && (Date.now() - existing.sentAt) < 30000) {
      return res.status(429).json({ error: 'OTP already sent. Please wait before requesting again.' });
    }

    const otp = generateOtp();
    const bookingId = generateBookingId();
    console.log(`Generated OTP for ${phone}: bookingId=${bookingId}`);

    otpStore.set(phone, {
      code: otp,
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
      sentAt: Date.now(),
      attempts: 0,
      bookingData: { bookingId, service, vehicleType, price, date, timeSlot, name, phone, email, notes }
    });

    // Send OTP via WhatsApp
    const sent = await sendWhatsAppOtp(phone, otp);

    if (sent) {
      res.json({ success: true, message: 'OTP sent to your WhatsApp' });
    } else {
      otpStore.delete(phone);
      res.status(500).json({ error: 'Failed to send OTP. Please check your WhatsApp number.' });
    }
  } catch (err) {
    console.error('Error in send-otp:', err.message, err.stack);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// Verify OTP and confirm booking
app.post('/api/verify-otp', async (req, res) => {
  const { phone, otp } = req.body;

  if (!phone || !otp) {
    return res.status(400).json({ error: 'Phone and OTP required' });
  }

  const entry = otpStore.get(phone);

  if (!entry) {
    return res.status(400).json({ error: 'No OTP found. Please request a new one.' });
  }

  if (Date.now() > entry.expiresAt) {
    otpStore.delete(phone);
    return res.status(400).json({ error: 'OTP expired. Please request a new one.' });
  }

  if (entry.attempts >= 3) {
    otpStore.delete(phone);
    return res.status(400).json({ error: 'Too many failed attempts. Please request a new OTP.' });
  }

  if (entry.code !== otp) {
    entry.attempts++;
    return res.status(400).json({ error: `Incorrect OTP. ${3 - entry.attempts} attempt(s) remaining.` });
  }

  // OTP verified — save booking
  try {
    const booking = await saveBooking(entry.bookingData);
    otpStore.delete(phone);
    res.json({ success: true, booking });
  } catch (err) {
    if (err.code === 'SLOT_TAKEN') {
      otpStore.delete(phone);
      return res.status(409).json({ error: err.message });
    }
    console.error('Error saving booking after OTP:', err.message);
    res.status(500).json({ error: 'Verification succeeded but failed to save booking. Please contact support.' });
  }
});

// ── WhatsApp Functions ──

// Send OTP via WhatsApp plain text message
// TODO: Switch to Authentication template ('booking_otp') when using a live WhatsApp Business account.
// Template code is backed up in commit history — see "Use WhatsApp auth template for OTP" commit.
async function sendWhatsAppOtp(phone, otp) {
  const token = process.env.META_WHATSAPP_TOKEN;
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    console.log('WhatsApp API credentials not configured. Cannot send OTP.');
    return false;
  }

  const apiUrl = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone,
        type: 'text',
        text: {
          body: `Your RoadRunners booking verification code is: *${otp}*\n\nThis code expires in 5 minutes. Do not share it with anyone.`
        }
      })
    });
    const data = await response.json();
    if (data.error) {
      console.error('WhatsApp OTP error:', data.error);
      return false;
    }
    console.log('WhatsApp OTP sent to:', phone);
    return true;
  } catch (err) {
    console.error('WhatsApp OTP fetch error:', err.message);
    return false;
  }
}

// Send booking confirmation notifications (plain text — no templates needed)
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

  // Customer confirmation — plain text
  const customerBody = [
    `✅ *Booking Confirmed — RoadRunners Detailing*`,
    ``,
    `🆔  ${booking.id}`,
    `👤  ${booking.name}`,
    `✨  ${booking.service}`,
    `🚗  ${booking.vehicleType}`,
    `💰  ₹${booking.price}`,
    `📅  ${booking.date}`,
    `🕐  ${booking.timeSlot}`,
    ``,
    `See you at *RoadRunners Detailing*! 🚗`
  ].join('\n');

  try {
    const customerRes = await fetch(apiUrl, {
      method: 'POST', headers,
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: booking.phone,
        type: 'text',
        text: { body: customerBody }
      })
    });
    const customerData = await customerRes.json();
    if (customerData.error) console.error('Customer WhatsApp error:', JSON.stringify(customerData.error));
    else console.log('Customer confirmation sent to:', booking.phone);
  } catch (err) {
    console.error('Customer WhatsApp fetch error:', err.message);
  }

  // Owner notification — plain text
  if (ownerNumber) {
    const ownerBody = [
      `✅ *New Booking — RoadRunners Detailing*`,
      ``,
      `🆔  ${booking.id}`,
      `👤  ${booking.name}`,
      `📞  ${booking.phone}`,
      `📧  ${booking.email || 'N/A'}`,
      `✨  ${booking.service}`,
      `🚗  ${booking.vehicleType}`,
      `💰  ₹${booking.price}`,
      `📅  ${booking.date}`,
      `🕐  ${booking.timeSlot}`
    ].join('\n');

    try {
      const ownerRes = await fetch(apiUrl, {
        method: 'POST', headers,
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: ownerNumber,
          type: 'text',
          text: { body: ownerBody }
        })
      });
      const ownerData = await ownerRes.json();
      if (ownerData.error) console.error('Owner WhatsApp error:', JSON.stringify(ownerData.error));
      else console.log('Owner notification sent to:', ownerNumber);
    } catch (err) {
      console.error('Owner WhatsApp fetch error:', err.message);
    }
  }
}

// Static files — AFTER API routes so /api/* routes are matched first
app.use(express.static(__dirname));

app.listen(PORT, () => {
  console.log(`RoadRunners server running at http://localhost:${PORT}`);
});
