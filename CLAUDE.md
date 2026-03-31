# CLAUDE.md — RoadRunners Auto Detailing

## Project Overview

RoadRunners is a car detailing business in Avadi, Chennai, owned by Dinesh. This codebase is their full website and online booking system. Customers browse services, book an appointment (service + vehicle type + date + time), pay via Razorpay (UPI or card), and receive WhatsApp confirmation. Bookings are stored in Google Sheets.

Live: https://road-runners.vercel.app/
Repo: https://github.com/mraigeneralist/RoadRunners

## Tech Stack

- **Runtime:** Node.js
- **Server:** Express 5.2.1
- **Frontend:** Vanilla HTML/CSS/JS (no framework, no bundler)
- **Database:** Google Sheets via `googleapis` (service account auth)
- **Payments:** Razorpay Custom Checkout (`razorpay` SDK server-side, `Razorpay` JS client-side via CDN)
- **Notifications:** Meta WhatsApp Business Cloud API v19.0
- **Hosting:** Vercel (Node.js, not static)
- **Other deps:** `cors`, `dotenv`, `crypto` (built-in)

## Project Structure

```
RoadRunnersWebsite/
├── server.js          # Express server, all API routes, Google Sheets + Razorpay + WhatsApp logic
├── booking.js         # Client-side booking modal: 6-step flow, payment UI, Razorpay Custom Checkout
├── booking.css        # All booking modal styles (dark theme, gold accents)
├── index.html         # Homepage (hero, features, CTA, large inline CSS block)
├── services.html      # Services listing with WhatsApp quote links
├── packages.html      # Bookable packages with pricing by vehicle type
├── about.html         # About Dinesh, certifications (IDA, IDAA), testimonials
├── gallery.html       # Photo gallery with CSS grid masonry layout
├── contact.html       # Address, hours, embedded Google Maps (dark-filtered)
├── images/            # Dinesh.jpg + image.png through image10.png
├── package.json       # Scripts: start, dev (both run `node server.js`)
├── .env.example       # Template for all env vars
├── .env               # Actual secrets (git-ignored)
├── .gitignore         # Ignores node_modules/ and .env
└── README.md          # Setup guide (Google Sheets, Razorpay, WhatsApp, deploy)
```

All HTML pages load `booking.css` and `booking.js`. The booking modal is injected into the DOM on `DOMContentLoaded`. Any element with `data-booking-trigger` attribute or calling `window.openBooking()` opens it.

## Environment Variables

```bash
# Google Sheets (required)
GOOGLE_SHEET_ID=                        # Sheet ID from the URL: docs.google.com/spreadsheets/d/{THIS_PART}
GOOGLE_SERVICE_ACCOUNT_EMAIL=           # Service account email (needs Editor access to the sheet)
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=     # PEM key in quotes, \n preserved. The code does .replace(/\\n/g, '\n')

# Razorpay (required)
RAZORPAY_KEY_ID=                        # Public key (rzp_test_xxx or rzp_live_xxx), sent to frontend via /api/config
RAZORPAY_KEY_SECRET=                    # Secret key, server-only, used for HMAC signature verification
TEST_MODE=true                          # When "true", all Razorpay orders charge ₹1 (100 paise) instead of actual price

# WhatsApp (optional — booking works without it, notifications just won't send)
META_WHATSAPP_TOKEN=                    # Permanent access token from Meta Business
META_PHONE_NUMBER_ID=                   # The phone number ID in WhatsApp Business
META_WHATSAPP_BUSINESS_ACCOUNT_ID=      # Business account ID (currently not used in code, but kept for reference)
OWNER_WHATSAPP_NUMBER=917200039437      # Dinesh's WhatsApp with country code (91)

# Server
PORT=3000                               # Express listens here, Vercel ignores this
```

## Booking Flow (6 Steps)

### Step 1: Service & Vehicle Type (`renderStep1`)
- Shows 3 service cards: Basic Wash, Interior Deep Cleaning, Exterior Deep Cleaning
- After selecting a service, shows 4 vehicle type options with prices specific to that service
- Prices are hardcoded in `SERVICES` array (booking.js lines 5-24)
- Vehicle types: Hatchback, Sedan/Compact SUV, Lengthy Sedan/Mid SUV, MUV/SUV

### Step 2: Date Selection (`renderStep2`)
- Custom inline calendar (replaced native `<input type="date">` for dark theme consistency)
- All date calculations use IST (UTC+5:30) via `getNowIST()` helper — avoids UTC off-by-one issues
- Today is selectable if current IST time is before 7:30 PM (the last slot)
- Range: today (or tomorrow if past 7:30 PM IST) to 2 months from today
- Today is highlighted in gold text, selected date gets gold background
- Sets `state.date` as `YYYY-MM-DD` string

### Step 3: Time Slot (`renderStep3`)
- Fetches booked slots: `GET /api/slots/{date}` -> returns `{ bookedSlots: ["9:30 AM", ...] }`
- 11 slots in a 3-column grid: 9:30 AM through 7:30 PM
- Booked slots show "(Booked)", are grayed out (0.3 opacity) with strikethrough, not clickable

### Step 4: Customer Details (`renderStep4`)
- Full Name (required, any string)
- WhatsApp Number (10 digits, must start with 6-9, regex: `/^[6-9]\d{9}$/`)
- Email Address (optional)
- Special Notes (optional textarea)
- Continue button enables only when name and phone are valid

### Step 5: Review & Pay (`renderStep5`)
- Shows booking summary then payment UI
- "Edit Details" button at top-right to go back to step 4
- Two payment tabs: UPI (default) and Card

**UPI — Mobile:**
- UPI ID text input + "Pay" button (collect flow)
- App grid buttons: GPay, PhonePe, Paytm, BHIM (intent flow)

**UPI — Desktop:**
- Auto-generates QR code via `POST /api/create-upi-qr` on load
- QR has 15-minute expiry. Polls `POST /api/payment-status` every 3 seconds
- UPI ID input as fallback

**Card:**
- Fields: Card Number (formatted 4-4-4-4), Expiry (MM / YY), CVV, Cardholder Name
- Uses Razorpay Custom Checkout (`rzp.createPayment()` with raw card details)
- Razorpay handles PCI compliance

**Payment processing (`processPayment`):**
1. `POST /api/create-order` -> Razorpay order created, returns `orderId`, `bookingId`
2. `rzp.createPayment(payload)` with method-specific fields
3. On `payment.success`: `POST /api/verify-payment` with signature
4. Server verifies HMAC SHA256: `sha256(order_id|payment_id)` vs `razorpay_signature`
5. On verification: booking saved to Sheets, WhatsApp notifications sent
6. Transitions to step 6

### Step 6: Confirmation (`renderStep6`)
- Checkmark animation, "Booking Confirmed!" title
- Shows booking ID (format: `RR-YYYY-NNNN`), service, date, time, amount
- "You will receive a WhatsApp confirmation shortly" note
- "Done" button closes modal

## API Routes (server.js)

| Method | Route | Request Body | Response | Notes |
|--------|-------|-------------|----------|-------|
| `GET` | `/api/config` | — | `{ razorpayKeyId }` | Public key, safe to expose |
| `GET` | `/api/slots/:date` | — | `{ bookedSlots: string[] }` | Filters Sheet rows by date col (H), excludes cancelled |
| `POST` | `/api/create-order` | `{ service, vehicleType, price, date, timeSlot, name, phone, vehicleNumber, notes }` | `{ orderId, amount, currency, bookingId }` | Checks slot availability first, returns 409 if taken. Amount = 100 paise in test mode |
| `POST` | `/api/verify-payment` | `{ razorpay_order_id, razorpay_payment_id, razorpay_signature, bookingId, ...bookingData }` | `{ success: true, booking }` | HMAC SHA256 verification, then saves to Sheets + sends WhatsApp |
| `POST` | `/api/create-upi-qr` | Same as create-order | `{ qrCodeId, qrImageUrl, bookingId, amount }` | Desktop UPI flow, QR expires in 15 min |
| `POST` | `/api/close-qr` | `{ qrCodeId }` | `{ success: true }` | Closes active QR, silently succeeds even if already expired |
| `POST` | `/api/payment-status` | `{ orderId?, qrCodeId?, bookingId, ...bookingData }` | `{ status: "paid"/"pending", booking? }` | Polls Razorpay for payment status, saves booking on paid |

Static files served via `express.static(__dirname)` — placed AFTER API routes so `/api/*` matches first (Express 5 requirement).

## Google Sheets Structure

**Sheet name:** `Sheet1` (hardcoded in `SHEET_RANGE`)
**Data range:** `A2:L` (row 1 is headers)

| Column | Header | Example |
|--------|--------|---------|
| A | Booking ID | `RR-2026-4821` |
| B | Customer Name | `Rajesh Kumar` |
| C | Phone Number | `919176347862` |
| D | Email | `rajesh@gmail.com` |
| E | Service | `Interior Deep Cleaning + Basic Wash` |
| F | Vehicle Type | `Sedan / Compact SUV` |
| G | Price | `2699` |
| H | Booking Date | `2026-04-15` |
| I | Time Slot | `2:00 PM` |
| J | Notes | (optional text) |
| K | Status | `confirmed` |
| L | Created At | `2026-03-30T15:45:22.123Z` |

**Idempotency:** `saveBooking()` checks if booking ID already exists in column A before writing. Duplicate calls return the existing row.

**Slot conflict check:** Before writing, checks if any non-cancelled row has the same date (col H) + time slot (col I). Throws `SLOT_TAKEN` error if found.

## Razorpay Integration

**How it works:**
- Uses Razorpay **Custom Checkout** (not Standard Checkout). This means the payment UI is entirely custom-built in `booking.js` — no Razorpay popup/iframe.
- The Razorpay JS SDK (`new Razorpay({ key })`) is loaded via CDN in the HTML pages.
- `rzp.createPayment(payload)` submits payment data directly. Events `payment.success` and `payment.error` handle the result.

**Signature verification (server.js line 188-191):**
```
expected = HMAC-SHA256(RAZORPAY_KEY_SECRET, "order_id|payment_id")
Compare expected === razorpay_signature from client
```

**Test mode:** When `TEST_MODE=true`, `create-order` and `create-upi-qr` set amount to 100 paise (₹1). The `actualPrice` is stored in Razorpay order notes for reference. The booking still records the real price in Google Sheets.

**UPI QR flow (desktop):**
1. `POST /api/create-upi-qr` creates a `upi_qr` via `razorpay.qrCode.create()`, single-use, 15-min expiry
2. Frontend shows QR image and polls `/api/payment-status` every 3s
3. When `qr.payments_amount_received > 0`, payment is confirmed
4. On step change or modal close, `POST /api/close-qr` closes the QR

## WhatsApp Notifications (Meta Cloud API)

**When sent:** After successful payment verification + booking save, called async with `.catch()` so failures don't block the booking response.

**Endpoint:** `https://graph.facebook.com/v19.0/{phoneNumberId}/messages`

**Template 1: `customer_booking_confirmation`** (sent to customer's phone)
Parameters: name, booking ID, service, vehicle type, date, time slot, price

**Template 2: `owner_booking_alert`** (sent to `OWNER_WHATSAPP_NUMBER`)
Parameters: name, phone, email, service, vehicle type, date, time slot, price, booking ID

**If credentials missing:** Logs "WhatsApp API credentials not configured" and skips silently. Booking still succeeds.

**Template approval:** Templates must be pre-approved in Meta Business Manager (Category: Utility, Language: en). Takes 1-24 hours. See README.md for exact template body text.

## Running Locally

```bash
npm install
cp .env.example .env
# Fill in all values in .env (at minimum: Google Sheets + Razorpay)
npm start
# Open http://localhost:3000
```

Set `TEST_MODE=true` to avoid real charges. Use Razorpay test keys (`rzp_test_*`) and test card `4111 1111 1111 1111` (any future expiry, any CVV).

## Deploying to Vercel

No `vercel.json` exists — Vercel auto-detects `package.json` with `"start": "node server.js"` and runs it as a Node.js server.

1. Push to GitHub
2. Import project in Vercel dashboard
3. Add all env vars from `.env.example` in Vercel project settings
4. For `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`: paste the full PEM key with `\n` as literal characters (Vercel handles newline conversion)
5. Deploy

The static files are served by Express (`express.static(__dirname)`), not by Vercel's static hosting.

## Things to Watch Out For

1. **Express 5 route order matters.** Static middleware is placed AFTER API routes (server.js line 396). Moving it before would cause `/api/config` etc. to try serving a file instead.

2. **No `box-sizing: border-box` globally.** It was added only inside `.booking-overlay *` (booking.css line 2). Other page elements use default content-box. Don't assume border-box outside the modal.

3. **Services/prices are hardcoded** in `booking.js` lines 5-24. There's no admin panel or database for managing them — any price change requires a code edit and redeploy.

4. **Booking ID collisions are possible.** `generateBookingId()` uses `Math.random()` for the 4-digit suffix (`RR-YYYY-NNNN`). Low probability but not zero. Idempotency check only prevents duplicate saves of the *same* ID, not collisions between different bookings.

5. **Google Sheets API has rate limits.** 500 read/write requests per 100 seconds. Every slot check, booking save, and payment status poll hits the Sheets API. High traffic could cause failures.

6. **Slot race condition window.** Slot availability is checked at order creation AND at booking save, but there's a gap between the two where another booking could claim the slot. The second check in `saveBooking()` is the authoritative guard.

7. **WhatsApp phone format.** The frontend prepends `91` to the 10-digit phone number before sending to the server. The server stores and sends this directly to WhatsApp. The format is `91XXXXXXXXXX` (no `+`).

11. **IST date calculations.** All date logic in the calendar uses IST (UTC+5:30) via `getNowIST()` and `toDateStr()` helpers. This avoids off-by-one errors from UTC timezone differences. Today is bookable if IST time is before 7:30 PM.

12. **UPI app icons use Razorpay CDN.** The GPay, PhonePe, Paytm, and BHIM logos are loaded from `cdn.razorpay.com/app/` with inline fallback to styled letter icons if the CDN fails.

8. **No cancellation/refund flow.** Bookings can only be cancelled by manually editing the Google Sheet (set column K to "cancelled"). There's no refund API integration.

9. **`index.html` is very large** (~69KB) with extensive inline CSS. All page-level styles are inline in each HTML file, not in separate CSS files. Only the booking modal styles are in `booking.css`.

10. **Razorpay CDN script** must be loaded in the HTML pages for the Custom Checkout to work. It's loaded via `<script src="https://checkout.razorpay.com/v1/razorpay.js">` in the HTML files.
