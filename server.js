const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// Status check ke liye
app.get('/', (req, res) => { res.send("Email Server is Running!"); });

// Email bhejne ka Route
app.post('/send-email', async (req, res) => {
    const { to, subject, text } = req.body;

    // 1. Transporter setup (Aapki details Render ke Environment se aayengi)
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER, // Render par set karein
            pass: process.env.EMAIL_PASS  // Aapka App Password
        }
    });

    // 2. Mail Options
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: to,
        subject: subject,
        text: text
    };

    // 3. Email bhejna
    try {
        await transporter.sendMail(mailOptions);
        res.status(200).send({ message: "Sent" });
    } catch (error) {
        console.log("Error:", error);
        res.status(500).send({ message: "Failed" });
    }
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`Server live on port ${PORT}`));
