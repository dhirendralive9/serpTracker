const mongoose = require("mongoose");

const Top100Schema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    keyword: { type: String, required: true },
    searchEngine: { type: String, required: true },
    country: { type: String, required: true },
    device: { type: String, required: true },
    os: { type: String, required: true },
    results: { type: Array, required: true }, // Stores top 100 results
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Top100", Top100Schema);
