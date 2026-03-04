const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

app.post('/send-email', async (req, res) => {
    const { userEmail, subject, message } = req.body;

    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    });

    const mailOptions = {
        from: process.env.EMAIL_USER, 
        to: process.env.EMAIL_USER, // Hamesha aapko hi milega
        replyTo: userEmail,         // User ka email taaki aap reply kar sakein
        subject: `New Message: ${subject}`,
        text: `Aapko ek naya message mila hai!\n\nSender's Email: ${userEmail}\n\nMessage:\n${message}`
    };

    try {
        await transporter.sendMail(mailOptions);
        res.status(200).send({ message: "Sent" });
    } catch (error) {
        console.log(error);
        res.status(500).send({ message: "Failed" });
    }
});

app.listen(process.env.PORT || 10000);
