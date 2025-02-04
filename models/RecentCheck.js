const mongoose = require("mongoose");

const recentCheckSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    searchEngine: { type: String, required: true, default: "google" }, // Default to Google
    keyword: { type: String, required: true },
    domain: { type: String, required: true },
    country: { type: String, required: true },
    device: { type: String, required: true },
    os: { type: String, required: true },
    rank: { type: Number, default: null },
    dateChecked: { type: Date, default: Date.now }
});


module.exports = mongoose.model("RecentCheck", recentCheckSchema);
