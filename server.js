const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
const PORT = 6969;

const uploadFolder = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadFolder)) fs.mkdirSync(uploadFolder, { recursive: true });

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadFolder),
  filename: (_, file, cb) => cb(null, file.originalname),
});
const upload = multer({ storage });

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Secure password (generated at startup)
let serverPassword = '';
function generatePassword(length = 12) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}';
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const iface of Object.values(nets)) {
    for (const config of iface) {
      if (config.family === 'IPv4' && !config.internal) return config.address;
    }
  }
  return 'localhost';
}

function authMiddleware(req, res, next) {
  const clientPassword = req.headers['x-auth-password'];
  if (clientPassword !== serverPassword) {
    return res.status(401).send('Unauthorized: Incorrect or missing password');
  }
  next();
}

app.post('/upload', authMiddleware, upload.array('files'), (req, res) => {
  if (!req.files || req.files.length === 0) return res.status(400).send('No files uploaded.');
  const names = req.files.map(f => f.originalname);
  res.send(`Uploaded: ${names.join(', ')}`);
});

app.get('/files', authMiddleware, (req, res) => {
  fs.readdir(uploadFolder, (err, files) => {
    if (err) return res.status(500).send('Error reading files.');
    res.json(files);
  });
});

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

