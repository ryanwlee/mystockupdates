# mystockupdates

Stock price updater for Google Sheets. This project fetches current prices + 52-week highs from Yahoo Finance for a configured list of symbols, then writes the results into a Google Sheet via the Google Sheets API.

## What it does

- **Fetches quotes**: Calls the Yahoo Finance chart API for each symbol in `stockList.js`.
- **Writes to Google Sheets**: Batch-updates specific ranges on the `Portfolio` sheet tab.
- **Runs at most once/day (MST)**: Reads `Portfolio!C1` (`Data from: ...`) and skips if the sheet already has data for “today” in `America/Denver`.

## Requirements

- **Node.js** (any modern Node 18+ should work)
- A **Google Cloud** project with:
  - **Google Sheets API enabled**
  - A **Service Account**
  - Access granted to the target spreadsheet (share the sheet with the service account email)

## Setup

### 1) Install dependencies

```bash
npm install
```

### 2) Create a `.env`

Create a `.env` file in the project root with the Service Account fields:

```bash
GOOGLE_PROJECT_ID="..."
GOOGLE_PRIVATE_KEY_ID="..."
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_CLIENT_EMAIL="...@...gserviceaccount.com"
GOOGLE_CLIENT_ID="..."
GOOGLE_CERT_URL="https://www.googleapis.com/robot/v1/metadata/x509/...@...gserviceaccount.com"
```

Notes:
- `GOOGLE_PRIVATE_KEY` must preserve newlines. This project converts literal `\n` into real newlines at runtime.
- Don’t commit `.env` or any key JSON into source control.

### 3) Point at your Google Sheet

The target sheet is currently hardcoded in `stocks.js`:

- `SPREADSHEET_ID`
- Ranges on the `Portfolio` tab:
  - `Portfolio!A1` (Last Updated)
  - `Portfolio!C1` (Data from)
  - `Portfolio!A3` (timestamp)
  - `Portfolio!C3:C128` (current prices)
  - `Portfolio!D3:D128` (52-week highs)

If your sheet layout differs, update the ranges and/or list length.

## Run

```bash
npm start
```

This runs `node stocks.js` (warnings suppressed via `NODE_NO_WARNINGS=1` in the npm script).

## App structure

- **`stocks.js`**: Main script
  - Authenticates to Google Sheets using service-account credentials from `.env`
  - Checks last fetch date in `Portfolio!C1`
  - Fetches Yahoo Finance data for each symbol (1 second delay between requests)
  - Batch-updates the spreadsheet ranges
- **`stockList.js`**: List of Yahoo Finance symbols to fetch (stocks, ETFs, crypto, etc.)
- **`privatekey.js`**: Helper script to print a JSON private key as a single-line `\n`-escaped string (useful when copying into `.env` / GitHub secrets)
- **`stockPrice.json`**: Example output format for fetched data (local snapshot)
- **`stocks.csv`**: Example/export data (not used by the runtime script)
- **`client_secret.json`**: Local credential JSON (not required by `stocks.js` if `.env` is set)
- **`package.json`**: NPM scripts + dependencies (`dotenv`, `googleapis`)

## Troubleshooting

- **403 / permission errors**: Ensure the spreadsheet is shared with the service account email (`GOOGLE_CLIENT_EMAIL`).
- **Invalid private key**: Make sure `GOOGLE_PRIVATE_KEY` includes the full key and uses `\n` between lines.
- **Nothing updates**: If you already ran today (MST), the script will skip with “Already fetched data today (MST).”

