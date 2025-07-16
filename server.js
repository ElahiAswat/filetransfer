const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const os = require('os');
const clipboard = require('clipboardy');

const app = express();
const PORT = 6969;

const uploadFolder = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadFolder)) fs.mkdirSync(uploadFolder, { recursive: true });

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadFolder),
  filename: (_, file, cb) => cb(null, file.originalname),
});
const upload = multer({ storage });

// Serve static files except 'uploads' (uploads served via download route)
app.use(express.static(path.join(__dirname, 'public'), {
  // No static serving of uploads folder here
  // So files under uploads/ are NOT publicly accessible directly
}));

// Password storage (set at startup)
let serverPassword = '';

// Generate secure password
function generatePassword(length = 12) {
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lower = 'abcdefghijklmnopqrstuvwxyz';
  const digits = '0123456789';
  const symbols = '!@#$%^&*()_+{}[]<>?';
  const all = upper + lower + digits + symbols;

  const pick = (set) => set[Math.floor(Math.random() * set.length)];
  let password = [
    pick(upper),
    pick(lower),
    pick(digits),
    pick(symbols),
  ];
  for (let i = password.length; i < length; i++) {
    password.push(pick(all));
  }
  return password.sort(() => Math.random() - 0.5).join('');
}

// Get local IPv4 address
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const iface of Object.values(interfaces)) {
    for (const config of iface) {
      if (config.family === 'IPv4' && !config.internal) {
        return config.address;
      }
    }
  }
  return 'localhost';
}

// Authentication middleware
function authMiddleware(req, res, next) {
  const clientPassword = req.headers['x-auth-password'];
  if (clientPassword !== serverPassword) {
    return res.status(401).send('Unauthorized: Incorrect or missing password');
  }
  next();
}

// Upload endpoint (protected)
app.post('/upload', authMiddleware, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).send('No file uploaded.');
  res.send('File uploaded successfully.');
});

// List files endpoint (protected)
app.get('/files', authMiddleware, (req, res) => {
  fs.readdir(uploadFolder, (err, files) => {
    if (err) return res.status(500).send('Error reading files.');
    res.json(files);
  });
});

// Download endpoint (protected)
app.get('/download/:filename', authMiddleware, (req, res) => {
  const filename = req.params.filename;
  if (filename.includes('..') || filename.includes('/')) {
    return res.status(400).send('Invalid filename');
  }
  const filePath = path.join(uploadFolder, filename);

  fs.access(filePath, fs.constants.R_OK, (err) => {
    if (err) return res.status(404).send('File not found');
    res.download(filePath);
  });
});

app.listen(PORT, async () => {
  serverPassword = generatePassword();
  const ip = getLocalIP();
  const serverText = `http://${ip}:${PORT}\n${serverPassword}`;

  // Dynamically import clipboardy (works with CommonJS)
  const clipboard = await import('clipboardy');
  clipboard.default.writeSync(serverText);

  console.log(`Server running at http://${ip}:${PORT}`);
});
