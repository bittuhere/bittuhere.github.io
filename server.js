const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// Render Health Check (Ab 'Cannot GET /' nahi aayega)
app.get('/', (req, res) => {
    res.send("<h1>Anurag's Email Server is Live! 🚀</h1>");
});

app.post('/send-email', async (req, res) => {
    const { userEmail, subject, message } = req.body;

    // Check configuration
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.error("Missing Environment Variables!");
        return res.status(500).send({ message: "Config Missing" });
    }

    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    });

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: process.env.EMAIL_USER, 
        replyTo: userEmail,
        subject: `Contact Form: ${subject}`,
        text: `Naya message mila hai!\n\nFrom: ${userEmail}\n\nMessage:\n${message}`
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log("SUCCESS: Email sent to " + process.env.EMAIL_USER);
        res.status(200).send({ message: "Sent" });
    } catch (error) {
        console.error("NODEMAILER ERROR:", error.message);
        res.status(500).send({ message: "Error", details: error.message });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
