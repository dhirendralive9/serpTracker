const mongoose = require("mongoose");

const keywordHistorySchema = new mongoose.Schema({
    keywordId: { type: mongoose.Schema.Types.ObjectId, ref: "Keyword", required: true },
    position: { type: Number, default: null },
    checkedAt: { type: Date, default: Date.now } // Timestamp for when the ranking was checked
});

module.exports = mongoose.model("KeywordHistory", keywordHistorySchema);
