const cron = require("node-cron");
const { XMLHttpRequest } = require("xmlhttprequest");
const Keyword = require("../models/Keyword"); // Ensure correct path to Keyword model
require("dotenv").config();

const locationCodes = {
    USA: 2840,
    UK: 2826,
    Australia: 2782,
    Canada: 2841,
    India: 2793
};

// API Auth
const authHeader = "Basic " + Buffer.from(`${process.env.DATAFORSEO_USERNAME}:${process.env.DATAFORSEO_PASSWORD}`).toString("base64");

// Search Engine Endpoints
const searchEngineEndpoints = {
    google: "https://api.dataforseo.com/v3/serp/google/organic/live/advanced",
    bing: "https://api.dataforseo.com/v3/serp/bing/organic/live/advanced"
};

// Function to update keyword rankings
async function updateKeywordRankings() {
    console.log("🔄 Running scheduled keyword ranking updates...");

    const today = new Date();
    
    try {
        // Find keywords that need an update based on frequency
        const keywordsToUpdate = await Keyword.find({
            lastChecked: { $lte: new Date(today.setDate(today.getDate() - 1)) } // Check only those due for update
        });

        if (keywordsToUpdate.length === 0) {
            console.log("✅ No keywords due for an update.");
            return;
        }

        for (const keywordObj of keywordsToUpdate) {
            const { keyword, domain, country, device, os, searchEngine, frequency } = keywordObj;

            const location_code = locationCodes[country];
            const apiEndpoint = searchEngineEndpoints[searchEngine || "google"]; // Default to Google

            // Prepare API request
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

            // Make API request using XMLHttpRequest
            const xhr = new XMLHttpRequest();
            xhr.open("POST", apiEndpoint, true);
            xhr.setRequestHeader("Authorization", authHeader);
            xhr.setRequestHeader("Content-Type", "application/json");

            xhr.onreadystatechange = async function () {
                if (xhr.readyState === 4) {
                    try {
                        const response = JSON.parse(xhr.responseText);
                        let rank = null;

                        // Handle API errors
                        if (!response.tasks || response.tasks.length === 0 || !response.tasks[0].result || !response.tasks[0].result[0].items) {
                            console.warn(`⚠️ No ranking data found for ${keyword}`);
                        } else {
                            // Extract ranking data
                            const results = response.tasks[0].result[0].items;
                            const position = results.findIndex(item => item.url && item.url.includes(domain)) + 1;
                            rank = position > 0 ? position : null;
                        }

                        // Update keyword ranking and last checked date
                        await Keyword.updateOne(
                            { _id: keywordObj._id },
                            { $set: { rank, lastChecked: new Date() } }
                        );

                        console.log(`✅ Updated rank for ${keyword} (${searchEngine.toUpperCase()}): ${rank !== null ? rank : "Not in Top 100"}`);
                    } catch (error) {
                        console.error(`❌ Error processing SERP response for ${keyword}:`, error);
                    }
                }
            };

            // Send the request
            xhr.send(requestData);
        }
    } catch (error) {
        console.error("❌ Error updating keyword rankings:", error);
    }
}

// Schedule cron job to run daily at 3 AM
cron.schedule("0 3 * * *", () => {
    updateKeywordRankings();
}, {
    scheduled: true,
    timezone: "UTC"
});

console.log("⏳ Cron job for keyword ranking updates scheduled at 3 AM UTC");

module.exports = { updateKeywordRankings };
