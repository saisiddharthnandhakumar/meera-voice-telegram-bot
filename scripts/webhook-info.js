const { loadEnv } = require("./load-env");
loadEnv();

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error("Set TELEGRAM_BOT_TOKEN in .env first.");
    process.exit(1);
  }
  const res = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}

main();
