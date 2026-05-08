require('dotenv').config();
const express  = require('express');
const nodemailer = require('nodemailer');
const cors     = require('cors');
const crypto   = require('crypto');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── CORS: only allow YOUR website domain ──────────────────────────────────
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim());

app.use(cors({
    origin: function(origin, cb) {
        // Allow Render health-check (no origin) and your site
        if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
        cb(new Error('Not allowed by CORS'));
    }
}));
app.use(express.json());

// ── Nodemailer transporter ────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.GMAIL_USER,   // your gmail address
        pass: process.env.GMAIL_PASS    // the 16-char App Password
    }
});

// ── In-memory store for codes (key = email, value = { code, expiresAt }) ─
// For production you'd use Firebase/Redis, but this works fine for your use case
const pendingCodes = new Map();

// ── Helper: generate 6-digit code ─────────────────────────────────────────
function makeCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// ── ROUTE 1: Send verification email ──────────────────────────────────────
// POST /send-code   body: { email: "user@example.com", username: "bittu" }
app.post('/send-code', async (req, res) => {
    const { email, username } = req.body;

    if (!email || !username) {
        return res.status(400).json({ ok: false, error: 'email and username required' });
    }

    const code      = makeCode();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    pendingCodes.set(email.toLowerCase(), { code, expiresAt, username });

    try {
        await transporter.sendMail({
            from   : `"Arcade Hub" <${process.env.GMAIL_USER}>`,
            to     : email,
            subject: '🎮 Your Arcade Hub Verification Code',
            html   : `
                <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;
                            background:#0d0b22;color:#ffffff;border-radius:16px;
                            padding:32px;border:1px solid rgba(0,243,255,0.3);">
                    <h2 style="color:#00f3ff;letter-spacing:2px;margin-top:0;">
                        🎮 ARCADE HUB
                    </h2>
                    <p>Hey <strong>${username}</strong>! Welcome to Arcade Hub.</p>
                    <p>Your verification code is:</p>
                    <div style="font-size:2.5rem;font-weight:900;letter-spacing:8px;
                                text-align:center;color:#00f3ff;background:rgba(0,243,255,0.1);
                                border-radius:12px;padding:20px;margin:20px 0;">
                        ${code}
                    </div>
                    <p style="color:rgba(255,255,255,0.5);font-size:0.85rem;">
                        This code expires in <strong>10 minutes</strong>.<br>
                        If you didn't sign up, ignore this email.
                    </p>
                </div>
            `
        });

        res.json({ ok: true });
    } catch (err) {
        console.error('Mail error:', err.message);
        res.status(500).json({ ok: false, error: 'Failed to send email' });
    }
});

// ── ROUTE 2: Verify the code ───────────────────────────────────────────────
// POST /verify-code   body: { email: "user@example.com", code: "123456" }
app.post('/verify-code', (req, res) => {
    const { email, code } = req.body;

    if (!email || !code) {
        return res.status(400).json({ ok: false, error: 'email and code required' });
    }

    const entry = pendingCodes.get(email.toLowerCase());

    if (!entry) {
        return res.status(400).json({ ok: false, error: 'No pending code for this email. Request a new one.' });
    }

    if (Date.now() > entry.expiresAt) {
        pendingCodes.delete(email.toLowerCase());
        return res.status(400).json({ ok: false, error: 'Code expired. Request a new one.' });
    }

    if (entry.code !== code.trim()) {
        return res.status(400).json({ ok: false, error: 'Wrong code. Try again.' });
    }

    // ✅ Code is correct
    pendingCodes.delete(email.toLowerCase());
    res.json({ ok: true });
});

// ── ROUTE 3: Health check (for UptimeRobot ping) ──────────────────────────
app.get('/ping', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.get('/', (req, res) => res.send('Arcade Hub Email Server is running ✅'));

// ── Start ─────────────────────────────────────────────────────────────────
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
