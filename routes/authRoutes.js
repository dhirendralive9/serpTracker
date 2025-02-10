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
    const { name, username, email, password, confirmPassword, "g-recaptcha-response": recaptchaToken } = req.body;

    // Ensure reCAPTCHA response exists
    if (!recaptchaToken) {
        req.flash("error", "❌ Please complete the reCAPTCHA verification.");
        return res.redirect("/register");
    }

    // Verify reCAPTCHA with Google
    try {
        const recaptchaVerifyUrl = `https://www.google.com/recaptcha/api/siteverify?secret=${process.env.RECAPTCHA_SECRET_KEY}&response=${recaptchaToken}`;
        const recaptchaRes = await axios.post(recaptchaVerifyUrl);

        if (!recaptchaRes.data.success) {
            console.log("❌ reCAPTCHA verification failed:", recaptchaRes.data);
            req.flash("error", "❌ reCAPTCHA verification failed. Please try again.");
            return res.redirect("/register");
        }
    } catch (error) {
        console.error("❌ reCAPTCHA Verification Error:", error);
        req.flash("error", "❌ Error verifying reCAPTCHA. Please try again later.");
        return res.redirect("/register");
    }

    // Check if passwords match
    if (password !== confirmPassword) {
        req.flash("error", "❌ Passwords do not match. Please try again.");
        return res.redirect("/register");
    }

    try {
        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            req.flash("error", "❌ Email already registered. Try logging in.");
            return res.redirect("/register");
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create new user
        const verificationToken = crypto.randomBytes(32).toString("hex");
        const newUser = new User({
            name,
            username,
            email,
            password: hashedPassword,
            isVerified: false,
            verificationToken
        });

        await newUser.save();

        // Send verification email
        await sendVerificationEmail(email,name, verificationToken);

        req.flash("success", "✅ Registration successful! Please check your email to verify your account.");
        res.redirect("/login");
    } catch (error) {
        console.error("❌ Registration Error:", error);
        req.flash("error", "❌ Something went wrong. Please try again.");
        res.redirect("/register");
    }
});


// Login User
router.post("/login", async (req, res) => {
    console.log("✅ Login route hit.");

    const { email, password, "g-recaptcha-response": recaptchaToken } = req.body;
    console.log("📌 Received Data:", { email });

    // Ensure reCAPTCHA response exists
    if (!recaptchaToken) {
        console.log("❌ No reCAPTCHA response received.");
        return res.render("login", { error: "❌ Please complete the reCAPTCHA verification." });
    }

    // Verify reCAPTCHA with Google
    try {
        const recaptchaVerifyUrl = `https://www.google.com/recaptcha/api/siteverify?secret=${process.env.RECAPTCHA_SECRET_KEY}&response=${recaptchaToken}`;
        const recaptchaRes = await axios.post(recaptchaVerifyUrl);

        if (!recaptchaRes.data.success) {
            console.log("❌ reCAPTCHA verification failed:", recaptchaRes.data);
            return res.render("login", { error: "❌ reCAPTCHA verification failed. Please try again." });
        }
    } catch (error) {
        console.error("❌ reCAPTCHA Verification Error:", error);
        return res.render("login", { error: "❌ Error verifying reCAPTCHA. Please try again later." });
    }

    try {
        // Check if user exists
        const user = await User.findOne({ email });
        if (!user) {
            console.log("❌ User not found.");
            return res.render("login", { error: "❌ Invalid email or password." });
        }

        // Check if the account is verified
        if (!user.isVerified) {
            console.log("❌ Email not verified.");
            req.flash("error", "❌ Please verify your email before logging in. ");
            return res.render("login", { error: "❌ Please verify your email before logging in.",user:null });
        }

        // Compare passwords
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            console.log("❌ Incorrect password.");
            return res.render("login", { error: "❌ Invalid email or password.",user:null });
        }

        // Generate JWT token
        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" });

        // Store token in a cookie
        res.cookie("token", token, { httpOnly: true });

        console.log("✅ Login successful.");
        return res.redirect("/dashboard");
    } catch (error) {
        console.error("❌ Login Error:", error);
        return res.render("login", { error: "❌ Something went wrong. Please try again." , user:null});
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
    res.render("login", { error: null, user: null,messages: req.flash() }); // Ensure 'user' is passed
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
    res.render("forgot-password", { error: null, success: null, user: req.user || null });
});

router.post("/forgot-password", async (req, res) => {
    console.log("✅ Forgot Password route hit.");

    const { email, "g-recaptcha-response": recaptchaToken } = req.body;
    console.log("📌 Received Email:", email);

    // Ensure reCAPTCHA response exists
    if (!recaptchaToken) {
        console.log("❌ No reCAPTCHA response received.");
        req.flash("error", "❌ Please complete the reCAPTCHA verification.");
        return res.redirect("/forgot-password");
    }

    // Verify reCAPTCHA with Google
    try {
        const recaptchaVerifyUrl = `https://www.google.com/recaptcha/api/siteverify?secret=${process.env.RECAPTCHA_SECRET_KEY}&response=${recaptchaToken}`;
        const recaptchaRes = await axios.post(recaptchaVerifyUrl);

        if (!recaptchaRes.data.success) {
            console.log("❌ reCAPTCHA verification failed:", recaptchaRes.data);
            req.flash("error", "❌ reCAPTCHA verification failed. Please try again.");
            return res.redirect("/forgot-password");
        }
    } catch (error) {
        console.error("❌ reCAPTCHA Verification Error:", error);
        req.flash("error", "❌ Error verifying reCAPTCHA. Please try again later.");
        return res.redirect("/forgot-password");
    }

    try {
        // Check if user exists
        const user = await User.findOne({ email });
        if (!user) {
            console.log("⚠️ User does not exist, but showing success message to maintain ambiguity.");
            req.flash("success", "✅ Please check your email for the password reset link if your account exists.");
            return res.redirect("/forgot-password");
        }

        // Ensure account is verified before sending reset email
        if (!user.isVerified) {
            console.log("❌ Account is not verified.");
            req.flash("error", "❌ Please verify your email before resetting your password.");
            return res.redirect("/forgot-password");
        }

        // Generate password reset token
        const resetToken = crypto.randomBytes(32).toString("hex");
        user.resetPasswordToken = resetToken;
        user.resetPasswordExpires = Date.now() + 3600000; // Token expires in 1 hour
        await user.save();

        // Send password reset email
        await sendResetEmail(email, resetToken);
        console.log("📨 Password reset email sent.");

        req.flash("success", "✅ Please check your email for the password reset link.");
        return res.redirect("/forgot-password");
    } catch (error) {
        console.error("❌ Forgot Password Error:", error);
        req.flash("error", "❌ Something went wrong. Please try again.");
        return res.redirect("/forgot-password");
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

// GET Route: Show Resend Activation Page
router.get("/resend-activation", (req, res) => {
    res.render("resend-activation", { messages: req.flash() ,user: req.user || null });
});

// POST Route: Handle Activation Email Resend Request
router.post("/resend-activation", async (req, res) => {
    console.log("✅ Resend Activation route hit.");

    const { email, "g-recaptcha-response": recaptchaToken } = req.body;

    // Ensure reCAPTCHA response exists
    if (!recaptchaToken) {
        req.flash("error", "❌ Please complete the reCAPTCHA verification.");
        return res.redirect("/resend-activation");
    }

    // Verify reCAPTCHA with Google
    try {
        const recaptchaVerifyUrl = `https://www.google.com/recaptcha/api/siteverify?secret=${process.env.RECAPTCHA_SECRET_KEY}&response=${recaptchaToken}`;
        const recaptchaRes = await axios.post(recaptchaVerifyUrl);

        if (!recaptchaRes.data.success) {
            console.log("❌ reCAPTCHA verification failed:", recaptchaRes.data);
            req.flash("error", "❌ reCAPTCHA verification failed. Please try again.");
            return res.redirect("/resend-activation");
        }
    } catch (error) {
        console.error("❌ reCAPTCHA Verification Error:", error);
        req.flash("error", "❌ Error verifying reCAPTCHA. Please try again later.");
        return res.redirect("/resend-activation");
    }

    try {
        const user = await User.findOne({ email });

        // Show generic success message for security reasons
        req.flash("success", "✅ Expect an email shortly if you're registered and not activated.");
        res.redirect("/resend-activation");

        if (!user) {
            console.log("⚠️ User does not exist, but showing success message to maintain security.");
            return;
        }

        // If user is already verified, do not resend email
        if (user.isVerified) {
            console.log("⚠️ User is already verified. No email sent.");
            return;
        }

        // Generate new verification token and update the database
        const verificationToken = crypto.randomBytes(32).toString("hex");
        user.verificationToken = verificationToken;
        await user.save();
         var name = user.name;
        // Send new verification email using the existing function
        await sendVerificationEmail(email,name, verificationToken);
        console.log("📨 Verification email sent again.");
    } catch (error) {
        console.error("❌ Resend Activation Error:", error);
        req.flash("error", "❌ Something went wrong. Please try again.");
        res.redirect("/resend-activation");
    }
});


module.exports = router;
