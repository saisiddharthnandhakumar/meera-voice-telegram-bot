const { loadEnv } = require("./load-env");
loadEnv();

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const deployedUrl = process.argv[2] || process.env.DEPLOYED_URL;

  if (!token) {
    console.error("Set TELEGRAM_BOT_TOKEN in .env first.");
    process.exit(1);
  }
  if (!deployedUrl) {
    console.error(
      "Usage: npm run set-webhook -- https://your-project.vercel.app\n" +
        "(or set DEPLOYED_URL in .env)"
    );
    process.exit(1);
  }

  const webhookUrl = deployedUrl.replace(/\/$/, "") + "/api/webhook";

  const res = await fetch(
    `https://api.telegram.org/bot${token}/setWebhook`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: secret || undefined,
      }),
    }
  );
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
  if (!data.ok) process.exit(1);
}

main();
