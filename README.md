# RoadRunners Auto Detailing — Website + Booking System

Car detailing business website for **RoadRunners Auto Detailing**, Avadi, Chennai. Includes an integrated online booking system with WhatsApp notifications and Google Sheets as the database.

Live site: https://road-runners.vercel.app/

## Features

- Full responsive website (homepage, services, packages, gallery, about, contact)
- **Online Booking System** — multi-step booking flow with service selection, date/time picker, customer details, mock payment, and confirmation
- **Google Sheets Database** — every booking is saved as a row in a Google Sheet (Dinesh can view/manage bookings directly in Google Sheets)
- **WhatsApp Notifications** via Meta Business API — sends booking confirmations to both the customer and the business owner
- Slot availability management — queries the sheet to prevent double-booking

## Getting Started

### Prerequisites

- Node.js 18+
- A Google account
- A Google Cloud project with the Sheets API enabled

### Installation

```bash
git clone https://github.com/mraigeneralist/RoadRunners.git
cd RoadRunners
npm install
```

## Google Sheets Setup

### Step 1: Create the Google Sheet

1. Go to [Google Sheets](https://sheets.google.com/) and create a new blank spreadsheet
2. Name it something like **"RoadRunners Bookings"**
3. In **Row 1**, add these headers in order:

| A | B | C | D | E | F | G | H | I | J | K | L |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Booking ID | Customer Name | Phone Number | Vehicle Number | Service | Vehicle Type | Price | Booking Date | Time Slot | Notes | Status | Created At |

4. Copy the **Sheet ID** from the URL — it's the long string between `/d/` and `/edit`:
   ```
   https://docs.google.com/spreadsheets/d/THIS_IS_YOUR_SHEET_ID/edit
   ```

### Step 2: Create a Google Service Account

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select an existing one)
3. Go to **APIs & Services > Library**, search for **Google Sheets API**, and **enable** it
4. Go to **APIs & Services > Credentials**
5. Click **Create Credentials > Service Account**
6. Give it a name (e.g., `roadrunners-sheets`) and click **Done**
7. Click on the newly created service account
8. Go to the **Keys** tab, click **Add Key > Create new key**
9. Choose **JSON** and download the file
10. From the JSON file, you need two values:
    - `client_email` — this is your `GOOGLE_SERVICE_ACCOUNT_EMAIL`
    - `private_key` — this is your `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`

### Step 3: Share the Sheet with the Service Account

1. Open your Google Sheet
2. Click **Share**
3. Paste the service account email (e.g., `roadrunners-sheets@your-project.iam.gserviceaccount.com`)
4. Give it **Editor** access
5. Click **Send** (uncheck "Notify people" if prompted)

This is required — without this step, the server cannot read or write to the sheet.

## Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

| Variable | Description |
|---|---|
| `GOOGLE_SHEET_ID` | The ID from your Google Sheet URL |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | `client_email` from the service account JSON |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | `private_key` from the service account JSON (keep the quotes, keep the `\n`) |
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
├── server.js          # Express server (API + Google Sheets + static files)
├── index.html         # Homepage with integrated booking modal
├── booking.js         # Booking flow JavaScript (multi-step form)
├── booking.css        # Booking modal styles
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
