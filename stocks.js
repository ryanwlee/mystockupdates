require("dotenv").config();
const https = require("https");
const { google } = require("googleapis");
const stockList = require("./stockList");

// Google Sheets setup consts
const SPREADSHEET_ID = "1ih85AzACWKno0b9jmlmjpS8ma42rV33KsdidbXJP904";
const MST_TIMEZONE = "America/Denver";

async function getGoogleSheetAuth() {
  const credentials = {
    type: "service_account",
    project_id: process.env.GOOGLE_PROJECT_ID,
    private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
    private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    client_id: process.env.GOOGLE_CLIENT_ID,
    auth_uri: "https://accounts.google.com/o/oauth2/auth",
    token_uri: "https://oauth2.googleapis.com/token",
    auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
    client_x509_cert_url: process.env.GOOGLE_CERT_URL,
    universe_domain: "googleapis.com",
  };

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return auth;
}

function isSameDayMST(date1, date2) {
  const d1 = new Date(
    date1.toLocaleString("en-US", { timeZone: MST_TIMEZONE })
  );
  const d2 = new Date(
    date2.toLocaleString("en-US", { timeZone: MST_TIMEZONE })
  );
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

async function getLastFetchDate(sheets) {
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: "Portfolio!C1",
  });

  const rawText = result.data.values?.[0]?.[0] || "";
  const match = rawText.match(/Data from: (.+)/);
  if (!match) return null;

  const parsedDate = new Date(match[1]);
  return isNaN(parsedDate) ? null : parsedDate;
}

async function updateGoogleSheet(data, sheets) {
  const now = new Date();
  const nowMST = now.toLocaleString("en-US", { timeZone: MST_TIMEZONE });
  const fetchDateMST = new Date(data.fetchDate).toLocaleString("en-US", {
    timeZone: MST_TIMEZONE,
  });

  const currentPrices = data.stocks.map((stock) => [stock.currentPrice]);
  const fiftyTwoWeekHighs = data.stocks.map((stock) => [
    stock.fiftyTwoWeekHigh,
  ]);

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    resource: {
      valueInputOption: "USER_ENTERED",
      data: [
        {
          range: "Portfolio!A1",
          values: [[`Last Updated: ${nowMST}`]],
        },
        {
          range: "Portfolio!C1",
          values: [[`Data from: ${fetchDateMST}`]],
        },
        {
          range: "Portfolio!A3",
          values: [[nowMST]],
        },
        {
          range: "Portfolio!C3:C128",
          values: currentPrices,
        },
        {
          range: "Portfolio!D3:D128",
          values: fiftyTwoWeekHighs,
        },
      ],
    },
  });

  console.log("✅ Google Sheet updated successfully.");
}

function getStockData(symbol) {
  return new Promise((resolve, reject) => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`;

    const options = {
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
    };

    https
      .get(url, options, (res) => {
        let data = "";

        res.on("data", (chunk) => {
          data += chunk;
        });

        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            const price = parsed.chart.result[0].meta.regularMarketPrice;
            const high = parsed.chart.result[0].meta.fiftyTwoWeekHigh;
            resolve({ symbol, currentPrice: price, fiftyTwoWeekHigh: high });
          } catch (error) {
            reject(error);
          }
        });
      })
      .on("error", reject);
  });
}

async function main() {
  const auth = await getGoogleSheetAuth();
  const sheets = google.sheets({ version: "v4", auth });

  const lastFetchDate = await getLastFetchDate(sheets);
  const now = new Date();

  if (lastFetchDate && isSameDayMST(lastFetchDate, now)) {
    console.log("🟡 Already fetched data today (MST). Skipping update.");
    return;
  }

  console.log("🔄 Fetching new stock data...");
  const results = [];

  for (const symbol of stockList) {
    try {
      const data = await getStockData(symbol);
      results.push(data);
      console.log(`✅ Fetched ${symbol}`);
    } catch (error) {
      console.error(`❌ Error fetching ${symbol}:`, error.message);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  const stockData = {
    fetchDate: now.toISOString(),
    stocks: results,
  };

  console.log("📝 Updating Google Sheet...");
  await updateGoogleSheet(stockData, sheets);
}

main().catch(console.error);
