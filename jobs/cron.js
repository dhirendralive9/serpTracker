const Keyword = require("../models/Keyword");
const KeywordHistory = require("../models/KeywordHistory");

async function updateKeywordRankings() {
    console.log("🔄 Running scheduled keyword ranking updates...");

    const today = new Date();
    
    try {
        const keywordsToUpdate = await Keyword.find({
            lastChecked: { $lte: new Date(today.setDate(today.getDate() - 1)) }
        });

        if (keywordsToUpdate.length === 0) {
            console.log("✅ No keywords due for an update.");
            return;
        }

        for (const keywordObj of keywordsToUpdate) {
            const { keyword, domain, country, device, os, searchEngine } = keywordObj;

            const location_code = locationCodes[country];
            const apiEndpoint = searchEngineEndpoints[searchEngine || "google"];

            const requestData = JSON.stringify([
                {
                    keyword,
                    location_code,
                    language_code: "en",
                    device,
                    os,
                    depth: 100
                }
            ]);

            const xhr = new XMLHttpRequest();
            xhr.open("POST", apiEndpoint, true);
            xhr.setRequestHeader("Authorization", authHeader);
            xhr.setRequestHeader("Content-Type", "application/json");

            xhr.onreadystatechange = async function () {
                if (xhr.readyState === 4) {
                    try {
                        const response = JSON.parse(xhr.responseText);
                        let rank = null;

                        if (response.tasks && response.tasks[0].result && response.tasks[0].result[0].items) {
                            const results = response.tasks[0].result[0].items;
                            const position = results.findIndex(item => item.url && item.url.includes(domain)) + 1;
                            rank = position > 0 ? position : null;
                        }

                        // Store ranking history
                        const historyEntry = new KeywordHistory({
                            keywordId: keywordObj._id,
                            position: rank
                        });

                        await historyEntry.save();

                        // Update keyword rank & add history reference
                        await Keyword.updateOne(
                            { _id: keywordObj._id },
                            { 
                                $set: { rank, lastChecked: new Date() },
                                $push: { history: historyEntry._id } 
                            }
                        );

                        console.log(`✅ Updated rank for ${keyword} (${searchEngine.toUpperCase()}): ${rank !== null ? rank : "Not in Top 100"}`);
                    } catch (error) {
                        console.error(`❌ Error processing SERP response for ${keyword}:`, error);
                    }
                }
            };

            xhr.send(requestData);
        }
    } catch (error) {
        console.error("❌ Error updating keyword rankings:", error);
    }
}
