const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

app.post('/send-email', async (req, res) => {
    const { userEmail, subject, message } = req.body;

    // 1. Explicit SMTP Configuration (Timeout se bachne ke liye)
    const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465, // Secure port
        secure: true, // Use SSL/TLS
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        },
        // Connection timeout settings
        connectionTimeout: 10000, // 10 seconds
        greetingTimeout: 5000,
        socketTimeout: 15000
    });

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: process.env.EMAIL_USER,
        replyTo: userEmail,
        subject: `Naya Message: ${subject}`,
        text: `Sender: ${userEmail}\n\nMessage:\n${message}`
    };

    try {
        // 2. Transporter ko verify karein (Debug ke liye)
        await transporter.verify();
        console.log("Server is ready to send messages");

        await transporter.sendMail(mailOptions);
        console.log("Email Sent Successfully!");
        res.status(200).send({ message: "Sent" });
    } catch (error) {
        console.error("DETAILED ERROR:", error);
        res.status(500).send({ 
            message: "Connection Failed", 
            error: error.code, // Timeout error dikhayega
            details: error.message 
        });
    }
});

app.listen(process.env.PORT || 10000, () => console.log("Email server ready!"));
