const mongoose = require("mongoose");

const keywordHistorySchema = new mongoose.Schema({
    keywordId: { type: mongoose.Schema.Types.ObjectId, ref: "Keyword", required: true },
    history: [
        {
            position: { type: Number, default: null },
            checkedAt: { type: Date, default: Date.now }
        }
    ]
});

module.exports = mongoose.model("KeywordHistory", keywordHistorySchema);
