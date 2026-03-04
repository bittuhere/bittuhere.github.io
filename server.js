const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => { res.send("<h1>Email Server is Ready!</h1>"); });

app.post('/send-email', async (req, res) => {
    const { userEmail, subject, message } = req.body;

    // 1. New Transport Strategy (Port 587 use kar rahe hain)
    const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 587,
        secure: false, // Port 587 ke liye false hona chahiye
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        },
        tls: {
            rejectUnauthorized: false // Certificate issues bypass karne ke liye
        },
        connectionTimeout: 20000 // Time limit badha di hai (20s)
    });

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: process.env.EMAIL_USER,
        replyTo: userEmail,
        subject: `Form: ${subject}`,
        text: `From: ${userEmail}\n\nMessage: ${message}`
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log("SUCCESS: Email sent!");
        res.status(200).send({ message: "Sent" });
    } catch (error) {
        console.error("DETAILED ERROR:", error.message);
        res.status(500).send({ message: "Connection Failed", details: error.message });
    }
});

app.listen(process.env.PORT || 10000);
