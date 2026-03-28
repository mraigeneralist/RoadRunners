require('dotenv').config();
const express = require('express');
const cors = require('cors');
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

// Column order: A=Booking ID, B=Customer Name, C=Phone Number, D=Vehicle Number,
//               E=Service, F=Vehicle Type, G=Price, H=Booking Date,
//               I=Time Slot, J=Notes, K=Status, L=Created At

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

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

// Get booked slots for a specific date
app.get('/api/slots/:date', async (req, res) => {
  try {
    const rows = await getAllRows();
    // H = index 7 (Booking Date), I = index 8 (Time Slot), K = index 10 (Status)
    const bookedSlots = rows
      .filter(r => r[7] === req.params.date && (r[10] || 'confirmed') !== 'cancelled')
      .map(r => r[8]);
    res.json({ bookedSlots });
  } catch (err) {
    console.error('Error fetching slots:', err.message);
    res.status(500).json({ error: 'Failed to fetch available slots' });
  }
});

// Create a booking
app.post('/api/bookings', async (req, res) => {
  const { service, vehicleType, price, date, timeSlot, name, phone, vehicleNumber, notes } = req.body;

  if (!service || !vehicleType || !price || !date || !timeSlot || !name || !phone || !vehicleNumber) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Check if slot is already taken
    const rows = await getAllRows();
    const slotTaken = rows.some(
      r => r[7] === date && r[8] === timeSlot && (r[10] || 'confirmed') !== 'cancelled'
    );

    if (slotTaken) {
      return res.status(409).json({ error: 'This time slot is already booked' });
    }

    const bookingId = generateBookingId();
    const createdAt = new Date().toISOString();

    // Append row to Google Sheet
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
    console.error('Error creating booking:', err.message);
    res.status(500).json({ error: 'Failed to create booking' });
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

  // Template 1: Customer confirmation
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

  // Template 2: Owner alert
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

app.listen(PORT, () => {
  console.log(`RoadRunners server running at http://localhost:${PORT}`);
});
