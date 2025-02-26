// Required Modules
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');
const TelegramBot = require('node-telegram-bot-api');
const geoip = require('geoip-lite');
const dotenv = require('dotenv');

// Load Environment Variables
dotenv.config();

// Initialize Express App
const app = express();

// Configuration Variables
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;
const HOST_URL = process.env.HOST_URL || 'https://yourdomain.com';

// Initialize Telegram Bot
if (!BOT_TOKEN) {
  console.error("❌ ERROR: BOT_TOKEN is missing in .env file!");
  process.exit(1);
}
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '20mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '20mb' }));

// ✅ Home Route
app.get('/', (req, res) => {
  res.send('🚀 Server is running on Vercel!');
});

// ✅ Handle Bot Commands
bot.on('message', async (msg) => {
  try {
    console.log("📩 Received Message:", msg);
    const chatId = msg.chat.id;
    const command = msg.text.split(' ')[0];

    switch (command) {
      case '/start':
        console.log("✅ Start command received!");
        await sendWelcomeMessage(chatId);
        break;
      case '/status':
        await bot.sendMessage(chatId, "✅ Bot is online and running!");
        break;
      case '/help':
        await sendHelpMessage(chatId);
        break;
      case '/info':
        await sendUserInfo(chatId, msg);
        break;
      default:
        await bot.sendMessage(chatId, "❌ Unknown command! Try /help to see available commands.");
    }
  } catch (err) {
    console.error("❌ Bot Error:", err);
    if (ADMIN_CHAT_ID) {
      bot.sendMessage(ADMIN_CHAT_ID, `🚨 Bot Error: ${err.message}`);
    }
  }
});

// ✅ Function to Send Welcome Message
async function sendWelcomeMessage(chatId) {
  await bot.sendMessage(
    chatId,
    "👋 Welcome! Your bot is running.\n\nHere are some commands you can use:\n" +
    "🔹 /status - Check if the bot is online\n" +
    "🔹 /info - Get your chat details\n" +
    "🔹 /help - See all available commands"
  );
}

// ✅ Function to Send Help Message
async function sendHelpMessage(chatId) {
  await bot.sendMessage(
    chatId,
    "📖 Available Commands:\n" +
    "🔹 /start - Start the bot\n" +
    "🔹 /status - Check bot status\n" +
    "🔹 /info - Get your chat ID and name\n" +
    "🔹 /help - Show this help menu"
  );
}

// ✅ Function to Send User Info
async function sendUserInfo(chatId, msg) {
  await bot.sendMessage(
    chatId,
    `ℹ️ **User Info:**\n\n` +
    `👤 Name: ${msg.from.first_name} ${msg.from.last_name || ''}\n` +
    `🆔 Chat ID: ${chatId}`
  );
}

// ✅ Error Handling for Uncaught Exceptions
process.on('uncaughtException', (err) => {
  console.error('❌ Critical Server Error:', err);
  if (ADMIN_CHAT_ID) {
    bot.sendMessage(ADMIN_CHAT_ID, `🚨 Server Crash: ${err.message}`);
  }
});
bot.on('message', (msg) => {
  console.log("Received message:", msg);
  // Other processing logic here
});

// ✅ Start the Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  if (ADMIN_CHAT_ID) {
    bot.sendMessage(ADMIN_CHAT_ID, '✅ Server started successfully!');
  }
});
