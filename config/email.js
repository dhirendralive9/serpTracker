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
    const resetLink = `${process.env.BASE_URL}/reset-password/${token}`;

    const emailData = {
        sender: { name: "SerpTracker", email: process.env.BREVO_SENDER_EMAIL },
        to: [{ email }],
        subject: "Reset Your Password - SerpTracker",
        htmlContent: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px; background: #f9f9f9;">
            <h2 style="color: #333;">Reset Your Password</h2>
            <p style="font-size: 16px; color: #555;">You requested to reset your password on <strong>SerpTracker</strong>.</p>
            <p style="font-size: 16px; color: #555;">Click the button below to set a new password:</p>
            <a href="${resetLink}" style="display: inline-block; padding: 12px 20px; background-color: #007bff; color: #fff; text-decoration: none; font-size: 16px; border-radius: 5px;">Reset Password</a>
            <p style="font-size: 14px; color: #777; margin-top: 20px;">If you didn’t request this, please ignore this email.</p>
            <p style="font-size: 14px; color: #777;">Thanks, <br> The SerpTracker Team</p>
        </div>
        `
    };

    try {
        await axios.post("https://api.brevo.com/v3/smtp/email", emailData, {
            headers: { "Content-Type": "application/json", "api-key": process.env.BREVO_API_KEY }
        });
        console.log(`✅ Password reset email sent to ${email}`);
    } catch (error) {
        console.error(`❌ Failed to send reset email:`, error.response ? error.response.data : error.message);
    }
}


module.exports = { sendVerificationEmail,sendResetEmail };
