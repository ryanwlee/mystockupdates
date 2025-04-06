const fs = require("fs");
const raw = fs.readFileSync("client_secret.json", "utf8");
const parsed = JSON.parse(raw);
console.log(JSON.stringify(parsed.private_key).replace(/\\n/g, "\\n")); // safe for .env or GitHub Secret
