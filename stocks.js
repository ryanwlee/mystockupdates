require("dotenv").config();
const https = require("https");
const fs = require("fs");
const { google } = require("googleapis");
const stockList = require("./stockList");

// Google Sheets setup
const SPREADSHEET_ID = "1ih85AzACWKno0b9jmlmjpS8ma42rV33KsdidbXJP904";
const RANGE = "Sheet1!A2:D"; // Adjust based on your sheet structure

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

async function updateGoogleSheet(data) {
  try {
    const auth = await getGoogleSheetAuth();
    const sheets = google.sheets({ version: "v4", auth });

    // Prepare current prices and 52 week highs separately
    const currentPrices = data.stocks.map((stock) => [stock.currentPrice]);
    const fiftyTwoWeekHighs = data.stocks.map((stock) => [
      stock.fiftyTwoWeekHigh,
    ]);

    // Update last updated date in A1
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: "Portfolio!A1",
      valueInputOption: "USER_ENTERED",
      resource: {
        values: [[`Last Updated: ${new Date().toLocaleString()}`]],
      },
    });

    // Add fetch date in C1
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: "Portfolio!C1",
      valueInputOption: "USER_ENTERED",
      resource: {
        values: [[`Data from: ${new Date(data.fetchDate).toLocaleString()}`]],
      },
    });

    // Add current time at A3
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: "Portfolio!A3",
      valueInputOption: "USER_ENTERED",
      resource: {
        values: [[new Date().toLocaleString()]],
      },
    });

    // Update current prices (Column C)
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: "Portfolio!C3:C128",
      valueInputOption: "USER_ENTERED",
      resource: { values: currentPrices },
    });

    // Update 52 week highs (Column D)
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: "Portfolio!D3:D128",
      valueInputOption: "USER_ENTERED",
      resource: { values: fiftyTwoWeekHighs },
    });

    console.log("Google Sheet updated successfully!");
  } catch (error) {
    console.error("Error updating Google Sheet:", error.message);
    if (error.response) {
      console.error("Error details:", error.response.data);
    }
  }
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
            resolve({
              symbol,
              currentPrice: price,
              fiftyTwoWeekHigh: high,
            });
          } catch (error) {
            reject(error);
          }
        });
      })
      .on("error", reject);
  });
}

function isSameDay(date1, date2) {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

async function main() {
  let stockData;

  // Check if we already have today's data
  try {
    if (fs.existsSync("stockPrice.json")) {
      const fileContent = fs.readFileSync("stockPrice.json", "utf8");
      const existingData = JSON.parse(fileContent);

      if (
        existingData.fetchDate &&
        isSameDay(new Date(existingData.fetchDate), new Date())
      ) {
        console.log("Already fetched data today. Using existing data.");
        stockData = existingData;
      }
    }
  } catch (error) {
    console.log(
      "No existing data found or error reading file. Fetching new data..."
    );
  }

  // Fetch new data if needed
  if (!stockData) {
    console.log("Fetching stock prices...");
    const results = [];

    for (const symbol of stockList) {
      try {
        const data = await getStockData(symbol);
        results.push(data);
        console.log(`Fetched ${symbol}`);
      } catch (error) {
        console.error(`Error fetching ${symbol}:`, error.message);
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    stockData = {
      fetchDate: new Date().toISOString(),
      stocks: results,
    };

    fs.writeFileSync("stockPrice.json", JSON.stringify(stockData, null, 2));
    console.log("\nDone! Results saved to stockPrice.json");
    console.log(`Successfully fetched ${results.length} stocks`);
  }

  // Update Google Sheet
  console.log("\nUpdating Google Sheet...");
  await updateGoogleSheet(stockData);
}

main().catch(console.error);
