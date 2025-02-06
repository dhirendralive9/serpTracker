const mongoose = require("mongoose");

const keywordSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    searchEngine: { type: String, enum: ["google", "bing"], required: true, default: "google" },
    keyword: { type: String, required: true },
    domain: { type: String, required: true },
    country: { type: String, required: true },
    device: { type: String, required: true },
    os: { type: String, required: true },
    frequency: { type: Number, required: true, default: 1 },
    rank: { type: Number, default: null }, // Current ranking
    lastChecked: { type: Date, default: Date.now },
    history: { type: mongoose.Schema.Types.ObjectId, ref: "KeywordHistory" } // Only one history object per keyword
});

module.exports = mongoose.model("Keyword", keywordSchema);
