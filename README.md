# RoadRunners Auto Detailing — Website + Booking System

Car detailing business website for **RoadRunners Auto Detailing**, Avadi, Chennai. Includes an integrated online booking system with WhatsApp notifications.

Live site: https://road-runners.vercel.app/

## Features

- Full responsive website (homepage, services, packages, gallery, about, contact)
- **Online Booking System** — multi-step booking flow with service selection, date/time picker, customer details, mock payment, and confirmation
- **Admin Dashboard** at `/admin` — view all bookings in a sortable table with stats
- **WhatsApp Notifications** via Meta Business API — sends booking confirmations to both the customer and the business owner
- Slot availability management (prevents double-booking)
- **Supabase** database for persistent booking storage

## Getting Started

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com/) project (free tier works fine)

### Installation

```bash
git clone https://github.com/mraigeneralist/RoadRunners.git
cd RoadRunners
npm install
```

### Supabase Setup

1. Create a new project at [supabase.com](https://supabase.com/)
2. Go to **SQL Editor** and run the following to create the `bookings` table:

```sql
create table bookings (
  id uuid primary key default gen_random_uuid(),
  booking_id text unique not null,
  customer_name text not null,
  customer_phone text not null,
  vehicle_number text not null,
  service text not null,
  vehicle_type text not null,
  price integer not null,
  booking_date date not null,
  time_slot text not null,
  notes text,
  status text not null default 'confirmed',
  created_at timestamptz not null default now()
);

-- Index for fast slot availability lookups
create index idx_bookings_date_slot on bookings (booking_date, time_slot)
  where status != 'cancelled';

-- Enable Row Level Security (recommended)
alter table bookings enable row level security;

-- Policy: allow the anon key to insert and read (used by the Express server)
create policy "Allow insert" on bookings for insert with check (true);
create policy "Allow select" on bookings for select using (true);
```

3. Go to **Settings > API** and copy your **Project URL** and **anon (public) key**

### Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL (e.g., `https://abc123.supabase.co`) |
| `SUPABASE_ANON_KEY` | Your Supabase anon/public key |
| `META_WHATSAPP_TOKEN` | Permanent access token from Meta Developer Console |
| `META_PHONE_NUMBER_ID` | Phone Number ID from your WhatsApp Business App |
| `META_WHATSAPP_BUSINESS_ACCOUNT_ID` | Your WhatsApp Business Account ID |
| `OWNER_WHATSAPP_NUMBER` | Dinesh's number in international format (e.g., `919176347862`) |
| `PORT` | Server port (default: `3000`) |

### Run Locally

```bash
npm start
```

Then open http://localhost:3000

### Admin Dashboard

Visit http://localhost:3000/admin to see all bookings.

## WhatsApp Business API Setup

This project uses the **Meta WhatsApp Business Cloud API** to send booking notifications. Before notifications work, you must create and get approval for **two message templates** in [Meta Business Manager](https://business.facebook.com/):

### Template 1: `customer_booking_confirmation`

This is sent to the customer after a successful booking.

**Template body (with parameters):**
```
Hi {{1}}! Your booking at RoadRunners is confirmed!
Booking ID: {{2}}
Service: {{3}}
Vehicle Type: {{4}}
Date: {{5}}
Time: {{6}}
Amount Paid: {{7}}
We'll see you soon! For any changes, call us.
```

Parameters (in order):
1. Customer name
2. Booking ID
3. Service name
4. Vehicle type
5. Date
6. Time slot
7. Price (e.g., ₹2,699)

### Template 2: `owner_booking_alert`

This is sent to the owner (Dinesh) for every new booking.

**Template body (with parameters):**
```
New Booking Alert!
Customer: {{1}}
Phone: {{2}}
Vehicle No: {{3}}
Service: {{4}}
Type: {{5}}
Date: {{6}}
Time: {{7}}
Amount: {{8}}
Booking ID: {{9}}
```

Parameters (in order):
1. Customer name
2. Phone number
3. Vehicle number
4. Service name
5. Vehicle type
6. Date
7. Time slot
8. Price
9. Booking ID

### Template Approval Notes

- Both templates must be in **English (en)**
- Template category: **Utility**
- Templates typically take 1-24 hours to get approved
- WhatsApp notifications will fail silently until templates are approved — bookings will still work

## Project Structure

```
├── server.js          # Express server (API + Supabase queries + static files)
├── index.html         # Homepage with integrated booking modal
├── booking.js         # Booking flow JavaScript (multi-step form)
├── booking.css        # Booking modal styles
├── admin.html         # Admin dashboard for viewing bookings
├── about.html         # About page
├── services.html      # Services page
├── packages.html      # Packages page
├── gallery.html       # Gallery page
├── contact.html       # Contact page
├── images/            # Site images
├── .env.example       # Environment variables template
└── package.json
```

## Deployment

The site was originally static on Vercel. With the booking system, you now need a Node.js server. Options:

1. **Railway / Render / Fly.io** — deploy the Node.js app directly
2. **Vercel** — use Vercel Serverless Functions (would need to refactor the API routes into `/api/` directory)

Make sure to set the environment variables in your hosting platform's dashboard.

## Merging to Main

```bash
git checkout main
git merge feature/booking-system
git push origin main
```
