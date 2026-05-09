        require('dotenv').config();
const express    = require('express');
const nodemailer = require('nodemailer');
const cors       = require('cors');
const crypto     = require('crypto');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── CORS: only allow your website domain ─────────────────────────────────────
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim());
app.use(cors({
    origin: function(origin, cb) {
        if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
        cb(new Error('Not allowed by CORS'));
    }
}));
app.use(express.json({ limit: '2mb' }));

// ── Nodemailer ────────────────────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_PASS }
});

// ── In-memory code store (email → { code, expiresAt, purpose }) ──────────────
const pendingCodes = new Map();

function makeCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// ── Shared email template wrapper ─────────────────────────────────────────────
function wrapEmail(body) {
    return `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;
                background:#0d0b22;color:#fff;border-radius:16px;
                padding:0;border:1px solid rgba(0,243,255,.25);overflow:hidden;">
        <div style="background:linear-gradient(90deg,#0d0b22,#1a0a2e);
                    padding:22px 28px;border-bottom:1px solid rgba(0,243,255,.15);">
            <h1 style="margin:0;font-size:1.6rem;letter-spacing:4px;color:#00f3ff;">
                🎮 ARCADE HUB
            </h1>
        </div>
        <div style="padding:28px;">${body}</div>
        <div style="background:rgba(0,0,0,.3);padding:14px 28px;
                    border-top:1px solid rgba(255,255,255,.07);
                    font-size:.72rem;color:rgba(255,255,255,.3);text-align:center;">
            Arcade Hub by bittuhere · bittuhere.github.io<br>
            You received this because you have an Arcade Hub account.
        </div>
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// ROUTE 1: Send verification / reset code
// POST /send-code  { email, username, purpose: 'verify' | 'reset' }
// ─────────────────────────────────────────────────────────────────────────────
app.post('/send-code', async (req, res) => {
    const { email, username, purpose = 'verify' } = req.body;
    if (!email || !username) return res.status(400).json({ ok: false, error: 'email and username required' });

    const code      = makeCode();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 min
    pendingCodes.set(email.toLowerCase(), { code, expiresAt, username, purpose });

    const isReset   = purpose === 'reset';
    const subject   = isReset ? '🔑 Your Arcade Hub Password Reset Code' : '✅ Verify Your Arcade Hub Email';
    const heading   = isReset ? '🔑 Password Reset' : '📧 Email Verification';
    const bodyText  = isReset
        ? `Hey <strong>${username}</strong>! You requested a password reset.`
        : `Hey <strong>${username}</strong>! Please verify your email address to unlock full access.`;
    const footNote  = isReset
        ? `If you didn't request a reset, ignore this — your password is unchanged.`
        : `If you didn't sign up for Arcade Hub, just ignore this email.`;

    try {
        await transporter.sendMail({
            from   : `"Arcade Hub" <${process.env.GMAIL_USER}>`,
            to     : email,
            subject,
            html   : wrapEmail(`
                <h2 style="color:#00f3ff;margin-top:0;letter-spacing:2px;">${heading}</h2>
                <p style="color:rgba(255,255,255,.8);">${bodyText}</p>
                <p style="color:rgba(255,255,255,.6);">Your 6-digit code is:</p>
                <div style="font-size:2.6rem;font-weight:900;letter-spacing:10px;
                            text-align:center;color:#00f3ff;
                            background:rgba(0,243,255,.08);border:1px solid rgba(0,243,255,.25);
                            border-radius:12px;padding:22px 10px;margin:20px 0;">
                    ${code}
                </div>
                <p style="color:rgba(255,255,255,.4);font-size:.82rem;">
                    ⏳ This code expires in <strong>10 minutes</strong>.<br>
                    ${footNote}
                </p>
            `)
        });
        res.json({ ok: true });
    } catch (err) {
        console.error('send-code error:', err.message);
        res.status(500).json({ ok: false, error: 'Failed to send email' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// ROUTE 2: Verify code
// POST /verify-code  { email, code }
// ─────────────────────────────────────────────────────────────────────────────
app.post('/verify-code', (req, res) => {
    const { email, code } = req.body;
    if (!email || !code) return res.status(400).json({ ok: false, error: 'email and code required' });

    const entry = pendingCodes.get(email.toLowerCase());
    if (!entry)               return res.status(400).json({ ok: false, error: 'No pending code. Please request a new one.' });
    if (Date.now() > entry.expiresAt) {
        pendingCodes.delete(email.toLowerCase());
        return res.status(400).json({ ok: false, error: 'Code expired. Please request a new one.' });
    }
    if (entry.code !== code.trim()) return res.status(400).json({ ok: false, error: 'Wrong code. Try again.' });

    pendingCodes.delete(email.toLowerCase());
    res.json({ ok: true, purpose: entry.purpose || 'verify' });
});

// ─────────────────────────────────────────────────────────────────────────────
// ROUTE 3: Send welcome email after registration
// POST /send-welcome  { email, username }
// ─────────────────────────────────────────────────────────────────────────────
app.post('/send-welcome', async (req, res) => {
    const { email, username } = req.body;
    if (!email || !username) return res.status(400).json({ ok: false, error: 'email and username required' });

    try {
        await transporter.sendMail({
            from   : `"Arcade Hub" <${process.env.GMAIL_USER}>`,
            to     : email,
            subject: '🎮 Welcome to Arcade Hub, ' + username + '!',
            html   : wrapEmail(`
                <h2 style="color:#00f3ff;margin-top:0;letter-spacing:2px;">
                    🎉 Welcome Aboard!
                </h2>
                <p style="color:rgba(255,255,255,.85);font-size:1rem;line-height:1.6;">
                    Hey <strong style="color:#00f3ff;">${username}</strong>!<br>
                    Your Arcade Hub account has been successfully created. You're all set to play!
                </p>
                <div style="background:rgba(0,243,255,.06);border:1px solid rgba(0,243,255,.2);
                            border-radius:12px;padding:18px 20px;margin:20px 0;">
                    <div style="font-size:.85rem;color:rgba(255,255,255,.5);
                                letter-spacing:2px;margin-bottom:10px;">YOUR ACCOUNT</div>
                    <div style="font-size:1.2rem;color:#fff;">
                        👤 Username: <strong style="color:#00f3ff;">${username}</strong>
                    </div>
                </div>
                <p style="color:rgba(255,255,255,.7);font-size:.9rem;line-height:1.6;">
                    🎮 Play single & multiplayer games<br>
                    🏆 Compete on leaderboards<br>
                    📚 Access fair copies &amp; study tools<br>
                    🧠 Take the weekly quiz
                </p>
                <div style="margin-top:24px;text-align:center;">
                    <a href="https://bittuhere.github.io"
                       style="display:inline-block;background:linear-gradient(90deg,#00f3ff,#0066ff);
                              color:#000;font-weight:900;letter-spacing:2px;text-decoration:none;
                              padding:13px 32px;border-radius:50px;font-size:1rem;">
                        🕹 PLAY NOW
                    </a>
                </div>
                <p style="color:rgba(255,255,255,.3);font-size:.75rem;margin-top:20px;text-align:center;">
                    Don't forget to verify your email to unlock all features!
                </p>
            `)
        });
        res.json({ ok: true });
    } catch (err) {
        console.error('send-welcome error:', err.message);
        res.status(500).json({ ok: false, error: 'Failed to send welcome email' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// ROUTE 4: Contact form (primary — formsubmit is fallback in the SPA)
// POST /send-contact  { fromEmail, username, subject, message }
// ─────────────────────────────────────────────────────────────────────────────
app.post('/send-contact', async (req, res) => {
    const { fromEmail, username, subject, message } = req.body;
    if (!fromEmail || !message) return res.status(400).json({ ok: false, error: 'fromEmail and message required' });

    const istTime = new Date().toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata', weekday: 'long', year: 'numeric',
        month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true
    });

    try {
        await transporter.sendMail({
            from   : `"Arcade Hub Contact" <${process.env.GMAIL_USER}>`,
            replyTo: fromEmail,
            to     : process.env.GMAIL_USER,
            subject: `🎮 [Arcade Hub] ${subject || 'Contact Form'} — ${username || fromEmail}`,
            html   : wrapEmail(`
                <h2 style="color:#00f3ff;margin-top:0;">📬 Contact Form Message</h2>
                <table style="width:100%;border-collapse:collapse;font-size:.88rem;">
                    <tr><td style="color:rgba(255,255,255,.5);padding:5px 0;width:90px;">👤 From</td>
                        <td style="color:#fff;">${username || 'Unknown'} &lt;${fromEmail}&gt;</td></tr>
                    <tr><td style="color:rgba(255,255,255,.5);padding:5px 0;">📋 Subject</td>
                        <td style="color:#fff;">${subject || '—'}</td></tr>
                    <tr><td style="color:rgba(255,255,255,.5);padding:5px 0;">🕐 Time</td>
                        <td style="color:#fff;">${istTime}</td></tr>
                </table>
                <div style="background:rgba(255,255,255,.05);border-left:3px solid #00f3ff;
                            border-radius:0 10px 10px 0;padding:16px;margin:18px 0;">
                    <div style="color:rgba(255,255,255,.4);font-size:.75rem;
                                letter-spacing:2px;margin-bottom:8px;">MESSAGE</div>
                    <div style="color:rgba(255,255,255,.85);white-space:pre-wrap;
                                line-height:1.6;font-size:.9rem;">${message}</div>
                </div>
            `)
        });
        res.json({ ok: true });
    } catch (err) {
        console.error('send-contact error:', err.message);
        res.status(500).json({ ok: false, error: 'Failed to send email' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// ROUTE 5: Health check (UptimeRobot pings this to keep server awake)
// ─────────────────────────────────────────────────────────────────────────────
app.get('/ping', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));
app.get('/',     (req, res) => res.send('Arcade Hub Email Server ✅ Running'));

app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
