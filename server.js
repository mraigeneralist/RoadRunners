require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// Supabase client (server-side only — uses anon key, never exposed to frontend)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

function generateBookingId() {
  const year = new Date().getFullYear();
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `RR-${year}-${rand}`;
}

// Get booked slots for a specific date
app.get('/api/slots/:date', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('bookings')
      .select('time_slot')
      .eq('booking_date', req.params.date)
      .neq('status', 'cancelled');

    if (error) throw error;

    const bookedSlots = data.map(b => b.time_slot);
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
    const { data: existing, error: checkError } = await supabase
      .from('bookings')
      .select('id')
      .eq('booking_date', date)
      .eq('time_slot', timeSlot)
      .neq('status', 'cancelled')
      .limit(1);

    if (checkError) throw checkError;

    if (existing && existing.length > 0) {
      return res.status(409).json({ error: 'This time slot is already booked' });
    }

    const bookingId = generateBookingId();

    const { data, error } = await supabase
      .from('bookings')
      .insert({
        booking_id: bookingId,
        customer_name: name,
        customer_phone: phone,
        vehicle_number: vehicleNumber,
        service,
        vehicle_type: vehicleType,
        price,
        booking_date: date,
        time_slot: timeSlot,
        notes: notes || null,
        status: 'confirmed'
      })
      .select()
      .single();

    if (error) throw error;

    // Map to the shape the frontend expects
    const booking = {
      id: data.booking_id,
      service: data.service,
      vehicleType: data.vehicle_type,
      price: data.price,
      date: data.booking_date,
      timeSlot: data.time_slot,
      name: data.customer_name,
      phone: data.customer_phone,
      vehicleNumber: data.vehicle_number,
      notes: data.notes || '',
      status: data.status,
      createdAt: data.created_at
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

// Get all bookings (for admin)
app.get('/api/bookings', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .order('booking_date', { ascending: true })
      .order('time_slot', { ascending: true });

    if (error) throw error;

    // Map to the shape the frontend expects
    const bookings = data.map(b => ({
      id: b.booking_id,
      service: b.service,
      vehicleType: b.vehicle_type,
      price: b.price,
      date: b.booking_date,
      timeSlot: b.time_slot,
      name: b.customer_name,
      phone: b.customer_phone,
      vehicleNumber: b.vehicle_number,
      notes: b.notes || '',
      status: b.status,
      createdAt: b.created_at
    }));

    res.json({ bookings });
  } catch (err) {
    console.error('Error fetching bookings:', err.message);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
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
