const mongoose = require("mongoose");
const crypto = require("crypto");

const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    isVerified: { type: Boolean, default: false },
    verificationToken: { type: String },
    resetPasswordToken: { type: String },
    resetPasswordExpires: { type: Date }
});

// Generate a random reset password token
UserSchema.methods.generateResetToken = function () {
    return crypto.randomBytes(32).toString("hex");
};

module.exports = mongoose.model("User", UserSchema);
