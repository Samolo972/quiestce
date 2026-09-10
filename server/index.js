/**
 * Point d'entrée : serveur HTTP (fichiers statiques du front, QR codes) + Socket.io.
 */
const path = require('path');
const http = require('http');
const express = require('express');
const QRCode = require('qrcode');
const { Server } = require('socket.io');
const config = require('./config');
const registerSocketHandlers = require('./socket');
const { roomCount } = require('./rooms/roomManager');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  // Les messages sont petits (anecdotes <= 280 caractères) : on limite la taille
  maxHttpBufferSize: 10_000,
});

// Derrière nginx : le protocole réel (https) vient de ses en-têtes
app.set('trust proxy', 'loopback');

app.use(express.static(path.join(__dirname, '..', 'public')));

// QR code d'invitation d'une partie, affiché dans le lobby
app.get('/qr/:code', async (req, res) => {
  const code = String(req.params.code).toUpperCase();
  if (!/^[A-Z0-9]{4,6}$/.test(code)) return res.status(400).send('Code invalide');
  const url = `${req.protocol}://${req.get('host')}/?code=${code}`;
  const svg = await QRCode.toString(url, {
    type: 'svg',
    margin: 1,
    color: { dark: '#2b0c66', light: '#ffffff' },
  });
  res.type('image/svg+xml').set('Cache-Control', 'public, max-age=86400').send(svg);
});

// Pratique pour vérifier que le service tourne (curl http://127.0.0.1:3001/health)
app.get('/health', (req, res) => {
  res.json({ ok: true, rooms: roomCount(), uptime: Math.round(process.uptime()) });
});

registerSocketHandlers(io);

server.listen(config.PORT, config.HOST, () => {
  console.log(`« Qui a dit ça ? » lancé sur http://${config.HOST || 'localhost'}:${config.PORT}`);
});
