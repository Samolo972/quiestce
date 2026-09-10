/**
 * Point d'entrée : serveur HTTP (fichiers statiques du front) + Socket.io.
 */
const path = require('path');
const http = require('http');
const express = require('express');
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

app.use(express.static(path.join(__dirname, '..', 'public')));

// Pratique pour vérifier que le service tourne (curl http://127.0.0.1:3001/health)
app.get('/health', (req, res) => {
  res.json({ ok: true, rooms: roomCount(), uptime: Math.round(process.uptime()) });
});

registerSocketHandlers(io);

server.listen(config.PORT, config.HOST, () => {
  console.log(`« Qui a dit ça ? » lancé sur http://${config.HOST || 'localhost'}:${config.PORT}`);
});
