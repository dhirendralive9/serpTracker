const axios = require("axios");

async function sendVerificationEmail(email, name, token) {
    // Validate email format before sending
    if (!email || !email.includes("@")) {
        console.error("❌ Invalid email format:", email);
        return;
    }

    // Get sender email and base URL from .env
    const senderEmail = process.env.SENDER_EMAIL;
    const baseUrl = process.env.BASE_URL; // Example: https://seo.dhirendrabiswal.com

    const verificationLink = `${baseUrl}/verify/${token}`;

    const emailData = {
        sender: { name: "SERP Tracker", email: senderEmail },
        to: [{ email }], // Only email, without name
        subject: "Verify Your Email - SERP Tracker",
        htmlContent: `
            <div style="font-family: Arial, sans-serif; text-align: center;">
                <h2>Welcome to SERP Tracker, ${name}!</h2>
                <p>Please verify your email by clicking the button below:</p>
                <a href="${verificationLink}" style="display:inline-block; padding:10px 20px; color:white; background-color:#007BFF; text-decoration:none; border-radius:5px;">Verify Email</a>
                <p>If the button doesn't work, copy and paste this link into your browser:</p>
                <p>${verificationLink}</p>
                <p>Thank you for registering!</p>
            </div>
        `,
    };

    try {
        const response = await axios.post("https://api.brevo.com/v3/smtp/email", emailData, {
            headers: { "api-key": process.env.BREVO_API_KEY, "Content-Type": "application/json" }
        });
        console.log("✅ Verification email sent successfully:", response.data);
    } catch (error) {
        console.error("❌ Failed to send verification email:", error.response ? error.response.data : error.message);
    }
}



// Function to send a password reset email
async function sendResetEmail(email, token) {
    if (!email || !email.includes("@")) {
        console.error("❌ Invalid email format:", email);
        return;
    }

    // Get sender email and base URL from .env
    const senderEmail = process.env.SENDER_EMAIL; // Example: no-reply@yourdomain.com
    const baseUrl = process.env.BASE_URL; // Example: https://seo.dhirendrabiswal.com

    if (!senderEmail) {
        console.error("❌ Missing sender email. Check your .env file.");
        return;
    }

    const resetLink = `${baseUrl}/reset-password/${token}`;

    const emailData = {
        sender: { name: "SERP Tracker", email: senderEmail },
        to: [{ email }], // Correct structure for Brevo
        subject: "Reset Your Password - SERP Tracker",
        htmlContent: `
            <div style="font-family: Arial, sans-serif; text-align: center;">
                <h2>Password Reset Request</h2>
                <p>Click the button below to reset your password:</p>
                <a href="${resetLink}" style="display:inline-block; padding:10px 20px; color:white; background-color:#007BFF; text-decoration:none; border-radius:5px;">Reset Password</a>
                <p>If you didn’t request this, please ignore this email.</p>
            </div>
        `,
    };

    try {
        const response = await axios.post("https://api.brevo.com/v3/smtp/email", emailData, {
            headers: { "api-key": process.env.BREVO_API_KEY, "Content-Type": "application/json" }
        });
        console.log("✅ Password reset email sent successfully:", response.data);
    } catch (error) {
        console.error("❌ Failed to send reset email:", error.response ? error.response.data : error.message);
    }
}


module.exports = { sendVerificationEmail,sendResetEmail };
