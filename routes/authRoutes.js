const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const recaptcha = require("../config/recaptcha");
const axios = require("axios");
const crypto = require("crypto");


const { sendVerificationEmail,sendResetEmail } = require("../config/email");

require("dotenv").config();

const router = express.Router();

router.post("/register", async (req, res) => {
    console.log("✅ Register route hit.");

    const { name, username, email, password, "g-recaptcha-response": recaptchaToken } = req.body;
    console.log("📌 Received Data:", { name, username, email });

    // Ensure reCAPTCHA response exists
    if (!recaptchaToken) {
        console.log("❌ No reCAPTCHA response received.");
        return res.render("register", { user: null, error: "❌ Please complete the reCAPTCHA verification." });
    }

    // Verify reCAPTCHA with Google
    try {
        const recaptchaVerifyUrl = `https://www.google.com/recaptcha/api/siteverify?secret=${process.env.RECAPTCHA_SECRET_KEY}&response=${recaptchaToken}`;
        const recaptchaRes = await axios.post(recaptchaVerifyUrl);

        if (!recaptchaRes.data.success) {
            console.log("❌ reCAPTCHA verification failed:", recaptchaRes.data);
            return res.render("register", { user: null, error: "❌ reCAPTCHA verification failed. Please try again." });
        }
    } catch (error) {
        console.error("❌ reCAPTCHA Verification Error:", error);
        return res.render("register", { user: null, error: "❌ Error verifying reCAPTCHA. Please try again later." });
    }

    try {
        // Check if email or username already exists
        const existingUser = await User.findOne({ $or: [{ email }, { username }] });
        if (existingUser) {
            console.log("⚠️ User already exists.");
            return res.render("register", { user: null, error: "❌ Email or username already in use." });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        console.log("🔑 Password hashed.");

        // Generate a unique email verification token
        const verificationToken = crypto.randomBytes(32).toString("hex");
        console.log("📩 Generated verification token:", verificationToken);

        // Create new user
        const newUser = new User({
            name,
            username,
            email,
            password: hashedPassword,
            isVerified: false,
            verificationToken
        });

        await newUser.save();
        console.log("✅ User saved to database.");

        // Send verification email
        await sendVerificationEmail(email, name, verificationToken);
        console.log("📨 Verification email sent.");

        // Redirect to login with verification alert
        return res.redirect("/login?warning=" + encodeURIComponent("✅ Registration successful! Please verify your email."));
    } catch (error) {
        console.error("❌ Registration Error:", error);
        return res.render("register", { user: null, error: "❌ Something went wrong. Please try again." });
    }
});


// Login User
router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.redirect("/login?error=" + encodeURIComponent("❌ All fields are required."));
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.redirect("/login?error=" + encodeURIComponent("❌ Invalid email or password."));
        }

        if (!user.isVerified) {
            return res.redirect("/login?error=" + encodeURIComponent("❌ Please verify your email before logging in."));
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.redirect("/login?error=" + encodeURIComponent("❌ Invalid email or password."));
        }

        // Generate JWT Token
        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" });

        res.cookie("token", token, { httpOnly: true });
        res.redirect("/dashboard");
    } catch (error) {
        console.error("❌ Login Error:", error);
        res.redirect("/login?error=" + encodeURIComponent("❌ Something went wrong. Please try again."));
    }
});




// Logout User
router.get("/logout", (req, res) => {
    res.clearCookie("token").redirect("/");
});

router.get("/register", (req, res) => {
    res.render("register", { user: null, error: null, warning: null }); // Ensure 'user' is passed
});


router.get("/login", (req, res) => {
    res.render("login", { error: null, user: null }); // Ensure 'user' is passed
});


router.get("/verify/:token", async (req, res) => {
    try {
        const user = await User.findOne({ verificationToken: req.params.token });

        if (!user) {
            return res.redirect("/login?error=" + encodeURIComponent("❌ Invalid or expired verification link."));
        }

        user.isVerified = true;
        user.verificationToken = undefined; // Remove token after verification
        await user.save();

        res.redirect("/login?success=" + encodeURIComponent("✅ Your email is verified. Please continue to login."));
    } catch (error) {
        console.error("❌ Verification Error:", error);
        res.redirect("/login?error=" + encodeURIComponent("❌ Something went wrong. Please try again."));
    }
});

router.get("/forgot-password", (req, res) => {
    res.render("forgot-password", { 
        user: null, 
        warning: req.query.warning || null 
    });
});

router.post("/forgot-password", async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });

        if (user && user.isVerified) {
            user.resetPasswordToken = user.generateResetToken();
            user.resetPasswordExpires = Date.now() + 3600000; // 1 hour expiry
            await user.save();

            await sendResetEmail(user.email, user.resetPasswordToken);
        }

        // Redirect to show a warning message
        res.redirect("/forgot-password?warning=" + encodeURIComponent("✅ Please check your email to recover your account if registered."));
    } catch (error) {
        console.error("❌ Forgot Password Error:", error);
        res.redirect("/forgot-password?warning=" + encodeURIComponent("❌ Something went wrong. Please try again."));
    }
});


// Route to render the password reset page
router.get("/reset-password/:token", async (req, res) => {
    try {
        const user = await User.findOne({
            resetPasswordToken: req.params.token,
            resetPasswordExpires: { $gt: Date.now() } // Ensure token is not expired
        });

        if (!user) {
            return res.redirect("/login?error=" + encodeURIComponent("❌ Invalid or expired reset token."));
        }

        res.render("reset-password", { token: req.params.token, user: null });
    } catch (error) {
        console.error("❌ Error loading reset page:", error);
        res.redirect("/login?error=" + encodeURIComponent("❌ Something went wrong. Please try again."));
    }
});


// Route to handle password reset
router.post("/reset-password/:token", async (req, res) => {
    try {
        const user = await User.findOne({
            resetPasswordToken: req.params.token,
            resetPasswordExpires: { $gt: Date.now() } // Ensure token is not expired
        });

        if (!user) {
            return res.redirect("/reset-password/" + req.params.token + "?error=" + encodeURIComponent("❌ Invalid or expired reset token."));
        }

        const hashedPassword = await bcrypt.hash(req.body.password, 10);

        // Update user's password
        user.password = hashedPassword;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();

        res.redirect("/login?success=" + encodeURIComponent("✅ Your password has been reset. Please log in with your new password."));
    } catch (error) {
        console.error("❌ Password Reset Error:", error);
        res.redirect("/reset-password/" + req.params.token + "?error=" + encodeURIComponent("❌ Something went wrong. Please try again."));
    }
});



module.exports = router;
