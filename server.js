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

// Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

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

// Expose Razorpay key ID to frontend (public key, safe to expose)
app.get('/api/config', (req, res) => {
  res.json({ razorpayKeyId: process.env.RAZORPAY_KEY_ID });
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
  const { service, vehicleType, price, date, timeSlot, name, phone, vehicleNumber, notes } = req.body;

  if (!service || !vehicleType || !price || !date || !timeSlot || !name || !phone || !vehicleNumber) {
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
        vehicleNumber,
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
    service, vehicleType, price, date, timeSlot, name, phone, vehicleNumber, notes
  } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: 'Missing payment verification fields' });
  }

  // Verify signature
  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  if (expectedSignature !== razorpay_signature) {
    return res.status(400).json({ error: 'Payment verification failed' });
  }

  // Payment is verified — save to Google Sheets
  try {
    // Double-check slot isn't taken (race condition guard)
    const rows = await getAllRows();
    const slotTaken = rows.some(
      r => r[7] === date && r[8] === timeSlot && (r[10] || 'confirmed') !== 'cancelled'
    );

    if (slotTaken) {
      return res.status(409).json({ error: 'This time slot was just booked by someone else. Your payment will be refunded.' });
    }

    const createdAt = new Date().toISOString();

    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_RANGE}!A:L`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [[
          bookingId,
          name,
          phone,
          vehicleNumber,
          service,
          vehicleType,
          price,
          date,
          timeSlot,
          notes || '',
          'confirmed',
          createdAt
        ]]
      }
    });

    const booking = {
      id: bookingId,
      service,
      vehicleType,
      price,
      date,
      timeSlot,
      name,
      phone,
      vehicleNumber,
      notes: notes || '',
      status: 'confirmed',
      createdAt
    };

    // Send WhatsApp notifications (non-blocking)
    sendWhatsAppNotifications(booking).catch(err => {
      console.error('WhatsApp notification error:', err.message);
    });

    res.json({ success: true, booking });
  } catch (err) {
    console.error('Error saving booking:', err.message);
    res.status(500).json({ error: 'Payment verified but failed to save booking. Please contact support.' });
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
            { type: 'text', text: booking.vehicleNumber },
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
