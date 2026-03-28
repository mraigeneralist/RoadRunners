require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const BOOKINGS_FILE = path.join(DATA_DIR, 'bookings.json');

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Ensure data directory and bookings file exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(BOOKINGS_FILE)) fs.writeFileSync(BOOKINGS_FILE, '[]');

function readBookings() {
  return JSON.parse(fs.readFileSync(BOOKINGS_FILE, 'utf8'));
}

function writeBookings(bookings) {
  fs.writeFileSync(BOOKINGS_FILE, JSON.stringify(bookings, null, 2));
}

function generateBookingId() {
  const year = new Date().getFullYear();
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `RR-${year}-${rand}`;
}

// Get booked slots for a specific date
app.get('/api/slots/:date', (req, res) => {
  const bookings = readBookings();
  const bookedSlots = bookings
    .filter(b => b.date === req.params.date && b.status !== 'cancelled')
    .map(b => b.timeSlot);
  res.json({ bookedSlots });
});

// Create a booking
app.post('/api/bookings', async (req, res) => {
  const { service, vehicleType, price, date, timeSlot, name, phone, vehicleNumber, notes } = req.body;

  if (!service || !vehicleType || !price || !date || !timeSlot || !name || !phone || !vehicleNumber) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const bookings = readBookings();

  // Check if slot is already taken
  const slotTaken = bookings.some(b => b.date === date && b.timeSlot === timeSlot && b.status !== 'cancelled');
  if (slotTaken) {
    return res.status(409).json({ error: 'This time slot is already booked' });
  }

  const booking = {
    id: generateBookingId(),
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
    createdAt: new Date().toISOString()
  };

  bookings.push(booking);
  writeBookings(bookings);

  // Send WhatsApp notifications (non-blocking)
  sendWhatsAppNotifications(booking).catch(err => {
    console.error('WhatsApp notification error:', err.message);
  });

  res.json({ success: true, booking });
});

// Get all bookings (for admin)
app.get('/api/bookings', (req, res) => {
  const bookings = readBookings();
  // Sort by date ascending, then by time
  bookings.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.timeSlot.localeCompare(b.timeSlot);
  });
  res.json({ bookings });
});

// Serve admin page
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
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
