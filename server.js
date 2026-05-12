require('dotenv').config();
const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const nodemailer = require('nodemailer');
const cors       = require('cors');

const app    = express();
const server = http.createServer(app);
const PORT   = process.env.PORT || 3000;

// ── CORS ─────────────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
    origin: function(origin, cb) {
        if (!origin || ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
        cb(new Error('Not allowed by CORS'));
    }
}));
app.use(express.json());

// ── SOCKET.IO ─────────────────────────────────────────────────────────────────
const io = new Server(server, { cors: { origin: '*', methods: ['GET', 'POST'] } });

// ── NODEMAILER ────────────────────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_PASS }
});

// ── In-memory code store ──────────────────────────────────────────────────────
const pendingCodes = new Map();
function makeCode()   { return Math.floor(100000 + Math.random() * 900000).toString(); }
function makeRoomId() { return Math.floor(1000   + Math.random() * 9000).toString(); }

// ═════════════════════════════════════════════════════════════════════════════
//  EMAIL ROUTES
// ═════════════════════════════════════════════════════════════════════════════

// POST /send-code — send verification or password-reset code
app.post('/send-code', async (req, res) => {
    const { email, username, purpose } = req.body;
    if (!email || !username) return res.status(400).json({ ok: false, error: 'email and username required' });

    const code      = makeCode();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 min
    pendingCodes.set(email.toLowerCase(), { code, expiresAt, username, purpose: purpose || 'verify' });

    const isReset = purpose === 'reset';
    try {
        await transporter.sendMail({
            from   : `"Arcade Hub" <${process.env.GMAIL_USER}>`,
            to     : email,
            subject: isReset ? 'Arcade Hub - Password Reset Code' : 'Arcade Hub - Email Verification Code',
            html   : emailCodeTemplate(username, code, isReset)
        });
        res.json({ ok: true });
    } catch (err) {
        console.error('Mail error:', err.message);
        res.status(500).json({ ok: false, error: 'Failed to send email' });
    }
});

// POST /verify-code — check submitted code
app.post('/verify-code', (req, res) => {
    const { email, code } = req.body;
    if (!email || !code) return res.status(400).json({ ok: false, error: 'email and code required' });

    const entry = pendingCodes.get(email.toLowerCase());
    if (!entry) return res.status(400).json({ ok: false, error: 'No pending code. Request a new one.' });
    if (Date.now() > entry.expiresAt) {
        pendingCodes.delete(email.toLowerCase());
        return res.status(400).json({ ok: false, error: 'Code expired. Request a new one.' });
    }
    if (entry.code !== code.trim()) return res.status(400).json({ ok: false, error: 'Wrong code. Try again.' });

    pendingCodes.delete(email.toLowerCase());
    res.json({ ok: true, purpose: entry.purpose });
});

// POST /send-welcome — welcome email after registration
app.post('/send-welcome', async (req, res) => {
    const { email, username } = req.body;
    if (!email || !username) return res.status(400).json({ ok: false, error: 'email and username required' });
    try {
        await transporter.sendMail({
            from   : `"Arcade Hub" <${process.env.GMAIL_USER}>`,
            to     : email,
            subject: 'Welcome to Arcade Hub, ' + username + '!',
            html   : welcomeTemplate(username)
        });
        res.json({ ok: true });
    } catch (err) {
        console.error('Welcome mail error:', err.message);
        res.status(500).json({ ok: false, error: 'Failed to send' });
    }
});

// POST /contact — contact form
app.post('/contact', async (req, res) => {
    const { fromEmail, username, subject, message } = req.body;
    if (!fromEmail || !message) return res.status(400).json({ ok: false, error: 'fromEmail and message required' });
    try {
        await transporter.sendMail({
            from    : `"Arcade Hub" <${process.env.GMAIL_USER}>`,
            to      : process.env.GMAIL_USER,
            replyTo : fromEmail,
            subject : `[Arcade Hub] ${subject || 'Contact Form'} from ${username || fromEmail}`,
            html    : contactTemplate({ fromEmail, username, subject, message })
        });
        res.json({ ok: true });
    } catch (err) {
        console.error('Contact mail error:', err.message);
        res.status(500).json({ ok: false, error: 'Failed to send' });
    }
});

// GET /ping — UptimeRobot health check
app.get('/ping', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));
app.get('/',     (req, res) => res.send('Arcade Hub Server is running'));

// ═════════════════════════════════════════════════════════════════════════════
//  SOCKET.IO — MULTIPLAYER
// ═════════════════════════════════════════════════════════════════════════════

const carRooms = {}; // { roomId: { players:{sid:{id,x,z,r,n,color}} } }
const tttRooms = {}; // { roomId: { board, turn, status, players:{X:sid,O:sid}, names } }

function getCarPlayers(room) {
    const out = {};
    Object.values(room.players).forEach(p => { out[p.id] = { x:p.x, z:p.z, r:p.r, n:p.n, color:p.color }; });
    return out;
}
function getRoomList() {
    return Object.entries(carRooms).map(([id, r]) => ({
        id, playerCount: Object.keys(r.players).length
    }));
}
function checkTTTWinner(b) {
    const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
    for (const [a, bb, c] of lines) if (b[a] && b[a] === b[bb] && b[a] === b[c]) return b[a];
    return null;
}

io.on('connection', socket => {

    // ── CAR GAME ─────────────────────────────────────────────────────────────

    socket.on('car:create', ({ playerName, color }) => {
        const roomId = makeRoomId();
        carRooms[roomId] = { players: { [socket.id]: { id:'p1', x:0, z:0, r:0, n:playerName, color } } };
        socket.join(roomId);
        socket.carRoom = roomId;
        socket.carId   = 'p1';
        socket.emit('car:created', { roomId, myId: 'p1' });
        io.emit('car:rooms', getRoomList());
    });

    socket.on('car:join', ({ code, playerName, color }) => {
        const room = carRooms[code];
        if (!room) return socket.emit('car:error', 'Room not found!');
        const usedIds = Object.values(room.players).map(p => p.id);
        let slot = null;
        for (let i = 1; i <= 8; i++) { if (!usedIds.includes('p' + i)) { slot = 'p' + i; break; } }
        if (!slot) return socket.emit('car:error', 'Room is full!');
        room.players[socket.id] = { id:slot, x:5, z:5, r:0, n:playerName, color };
        socket.join(code);
        socket.carRoom = code;
        socket.carId   = slot;
        socket.emit('car:joined', { roomId:code, myId:slot, players:getCarPlayers(room) });
        socket.to(code).emit('car:player-joined', { id:slot, x:5, z:5, r:0, n:playerName, color });
        io.emit('car:rooms', getRoomList());
    });

    socket.on('car:pos', ({ x, z, r }) => {
        const room = carRooms[socket.carRoom];
        if (!room || !room.players[socket.id]) return;
        const p = room.players[socket.id];
        p.x = x; p.z = z; p.r = r;
        socket.to(socket.carRoom).emit('car:pos', { id:socket.carId, x, z, r });
    });

    socket.on('car:chat', ({ msg }) => {
        const room = carRooms[socket.carRoom];
        const n = room?.players[socket.id]?.n || '?';
        io.to(socket.carRoom).emit('car:chat', { n, msg, t: Date.now() });
    });

    socket.on('car:list', () => socket.emit('car:rooms', getRoomList()));

    // ── TTT GAME ──────────────────────────────────────────────────────────────

    socket.on('ttt:create', ({ playerName }) => {
        const roomId = makeRoomId();
        tttRooms[roomId] = {
            board: ['','','','','','','','',''],
            turn: 'X', status: 'waiting',
            players: { X: socket.id },
            names:   { X: playerName }
        };
        socket.join(roomId);
        socket.tttRoom   = roomId;
        socket.tttSymbol = 'X';
        socket.emit('ttt:created', { roomId });
    });

    socket.on('ttt:join', ({ code, playerName }) => {
        const room = tttRooms[code];
        if (!room)                    return socket.emit('ttt:error', 'Room not found!');
        if (room.status !== 'waiting') return socket.emit('ttt:error', 'Game already started!');
        room.players.O = socket.id;
        room.names.O   = playerName;
        room.status    = 'playing';
        socket.join(code);
        socket.tttRoom   = code;
        socket.tttSymbol = 'O';
        io.to(code).emit('ttt:state', { board:room.board, turn:room.turn, status:room.status, names:room.names });
    });

    socket.on('ttt:move', ({ index }) => {
        const room = tttRooms[socket.tttRoom];
        if (!room || room.status !== 'playing') return;
        if (room.turn !== socket.tttSymbol)     return;
        if (room.board[index] !== '')            return;
        room.board[index] = socket.tttSymbol;
        const winner = checkTTTWinner(room.board);
        if (winner)                      room.status = 'finished';
        else if (!room.board.includes('')) room.status = 'draw';
        else                             room.turn = room.turn === 'X' ? 'O' : 'X';
        io.to(socket.tttRoom).emit('ttt:state', { board:room.board, turn:room.turn, status:room.status, winner, names:room.names });
    });

    socket.on('ttt:rematch', () => {
        const room = tttRooms[socket.tttRoom];
        if (!room) return;
        room.board  = ['','','','','','','','',''];
        room.turn   = 'X';
        room.status = 'playing';
        // Swap symbols
        [room.players.X, room.players.O] = [room.players.O, room.players.X];
        [room.names.X,   room.names.O]   = [room.names.O,   room.names.X];
        const xSock = io.sockets.sockets.get(room.players.X);
        const oSock = io.sockets.sockets.get(room.players.O);
        if (xSock) xSock.tttSymbol = 'X';
        if (oSock) oSock.tttSymbol = 'O';
        io.to(socket.tttRoom).emit('ttt:state', { board:room.board, turn:room.turn, status:room.status, names:room.names });
    });

    socket.on('ttt:chat', ({ msg }) => {
        const room = tttRooms[socket.tttRoom];
        if (!room) return;
        const n = socket.tttSymbol === 'X' ? room.names.X : room.names.O;
        io.to(socket.tttRoom).emit('ttt:chat', { n: n || '?', msg, t: Date.now() });
    });

    // ── DISCONNECT ────────────────────────────────────────────────────────────

    socket.on('disconnect', () => {
        // Car cleanup
        if (socket.carRoom && carRooms[socket.carRoom]) {
            delete carRooms[socket.carRoom].players[socket.id];
            socket.to(socket.carRoom).emit('car:player-left', { id: socket.carId });
            if (Object.keys(carRooms[socket.carRoom].players).length === 0) delete carRooms[socket.carRoom];
            io.emit('car:rooms', getRoomList());
        }
        // TTT cleanup
        if (socket.tttRoom && tttRooms[socket.tttRoom]) {
            socket.to(socket.tttRoom).emit('ttt:opponent-left');
            delete tttRooms[socket.tttRoom];
        }
    });
});

// ═════════════════════════════════════════════════════════════════════════════
//  EMAIL TEMPLATES
// ═════════════════════════════════════════════════════════════════════════════
function emailCodeTemplate(username, code, isReset) {
    return `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;background:#0d0b22;color:#fff;border-radius:16px;border:1px solid rgba(0,243,255,.25);overflow:hidden;">
    <div style="background:linear-gradient(90deg,#0d0b22,#1a0a2e);padding:22px 28px;border-bottom:1px solid rgba(0,243,255,.15);">
      <h1 style="margin:0;font-size:1.5rem;letter-spacing:5px;color:#00f3ff;">ARCADE HUB</h1>
    </div>
    <div style="padding:28px;">
      <h2 style="color:#00f3ff;margin-top:0;">${isReset ? 'Password Reset' : 'Email Verification'}</h2>
      <p>Hey <strong>${username}</strong>! ${isReset ? 'You requested a password reset.' : 'Please verify your email.'}</p>
      <div style="font-size:2.6rem;font-weight:900;letter-spacing:10px;text-align:center;color:#00f3ff;background:rgba(0,243,255,.08);border:1px solid rgba(0,243,255,.25);border-radius:12px;padding:22px 10px;margin:20px 0;">${code}</div>
      <p style="color:rgba(255,255,255,.4);font-size:.82rem;">Expires in <strong>10 minutes</strong>. ${isReset ? 'If you did not request this, ignore.' : 'If you did not sign up, ignore.'}</p>
    </div>
    <div style="background:rgba(0,0,0,.3);padding:14px 28px;border-top:1px solid rgba(255,255,255,.07);font-size:.72rem;color:rgba(255,255,255,.3);text-align:center;">
      Arcade Hub &middot; bittuhere.github.io
    </div>
  </div>`;
}

function welcomeTemplate(username) {
    return `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;background:#0d0b22;color:#fff;border-radius:16px;border:1px solid rgba(0,243,255,.25);overflow:hidden;">
    <div style="background:linear-gradient(90deg,#0d0b22,#1a0a2e);padding:22px 28px;border-bottom:1px solid rgba(0,243,255,.15);">
      <h1 style="margin:0;font-size:1.5rem;letter-spacing:5px;color:#00f3ff;">ARCADE HUB</h1>
    </div>
    <div style="padding:28px;">
      <h2 style="color:#00f3ff;margin-top:0;">Welcome Aboard!</h2>
      <p>Hey <strong style="color:#00f3ff;">${username}</strong>! Your Arcade Hub account is ready. You are all set to play!</p>
      <div style="text-align:center;margin-top:24px;">
        <a href="https://bittuhere.github.io" style="display:inline-block;background:linear-gradient(90deg,#00f3ff,#0066ff);color:#000;font-weight:900;letter-spacing:2px;text-decoration:none;padding:13px 32px;border-radius:50px;">PLAY NOW</a>
      </div>
    </div>
  </div>`;
}

function contactTemplate({ fromEmail, username, subject, message }) {
    return `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;background:#0d0b22;color:#fff;border-radius:16px;border:1px solid rgba(0,243,255,.25);overflow:hidden;">
    <div style="padding:22px 28px;background:linear-gradient(90deg,#0d0b22,#1a0a2e);border-bottom:1px solid rgba(0,243,255,.15);">
      <h1 style="margin:0;font-size:1.5rem;letter-spacing:5px;color:#00f3ff;">ARCADE HUB</h1>
    </div>
    <div style="padding:28px;">
      <h2 style="color:#00f3ff;margin-top:0;">Contact Form Message</h2>
      <p><strong>From:</strong> ${username || 'Unknown'} &lt;${fromEmail}&gt;</p>
      <p><strong>Subject:</strong> ${subject || 'General Inquiry'}</p>
      <div style="background:rgba(255,255,255,.05);border-left:3px solid #00f3ff;padding:16px;border-radius:0 10px 10px 0;margin-top:12px;white-space:pre-wrap;line-height:1.6;">${message}</div>
    </div>
  </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
server.listen(PORT, () => console.log(`Arcade Hub server running on port ${PORT}`));
