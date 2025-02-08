const mongoose = require("mongoose");
const schedule = require("node-schedule");
const XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;
const Keyword = require("../models/Keyword");
const KeywordHistory = require("../models/KeywordHistory");

require("dotenv").config();

const authHeader = "Basic " + Buffer.from(`${process.env.DATAFORSEO_USERNAME}:${process.env.DATAFORSEO_PASSWORD}`).toString("base64");

const searchEngineEndpoints = {
    google: "https://api.dataforseo.com/v3/serp/google/organic/live/advanced",
    bing: "https://api.dataforseo.com/v3/serp/bing/organic/live/advanced",
    yahoo: "https://api.dataforseo.com/v3/serp/yahoo/organic/live/advanced",
    youtube: "https://api.dataforseo.com/v3/serp/youtube/organic/live/advanced"
};

const locationCodes = {
    "USA": 2840,
    "UK": 2826,
    "Australia": 2805,
    "Canada": 2842,
    "India": 2847
};

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI);

console.log("⏳ Cron job for keyword ranking updates scheduled at 3 AM UTC");

// Function to update keyword rankings
async function updateKeywordRankings() {
    console.log("🚀 Running Cron Job: Fetching Keyword Rankings");

    const keywords = await Keyword.find({});
    for (const keywordObj of keywords) {
        const { keyword, domain, country, device, os, searchEngine } = keywordObj;
        const location_code = locationCodes[country];
        let apiEndpoint = searchEngineEndpoints[searchEngine || "google"];

        const requestData = JSON.stringify([
            searchEngine === "youtube"
                ? { keyword, location_code, language_code: "en", os, block_depth: 20 }
                : { keyword, location_code, language_code: "en", device, os, depth: 100 }
        ]);

        const xhr = new XMLHttpRequest();
        xhr.open("POST", apiEndpoint, true);
        xhr.setRequestHeader("Authorization", authHeader);
        xhr.setRequestHeader("Content-Type", "application/json");

        xhr.onreadystatechange = async function () {
            if (xhr.readyState === 4) {
                try {
                    const response = JSON.parse(xhr.responseText);
                    if (!response.tasks || response.tasks.length === 0 || !response.tasks[0].result || !response.tasks[0].result[0].items) {
                        console.warn(`⚠️ No ranking data available for ${keyword}`);
                        return;
                    }

                    const results = response.tasks[0].result[0].items;
                    const position = results.findIndex(item => item.url && item.url.includes(domain)) + 1;
                    const rank = position > 0 ? position : null;

                    console.log(`✅ ${keyword} (${searchEngine}) Rank: ${rank}`);

                    // Update Keyword Collection (latest ranking)
                    await Keyword.updateOne(
                        { _id: keywordObj._id },
                        { rank, lastChecked: new Date() } // Store the latest rank with timestamp
                    );

                    // Update Keyword History Collection
                    const historyEntry = await KeywordHistory.findOne({ keywordId: keywordObj._id });

                    if (historyEntry) {
                        // If history exists, update the history array
                        await KeywordHistory.updateOne(
                            { _id: historyEntry._id },
                            { $push: { history: { date: new Date(), position: rank } } }
                        );
                    } else {
                        // If history does not exist, create a new entry
                        const newHistory = new KeywordHistory({
                            keywordId: keywordObj._id,
                            history: [{ date: new Date(), position: rank }]
                        });
                        await newHistory.save();
                    }

                } catch (error) {
                    console.error("❌ Error processing SERP response:", error);
                }
            }
        };

        xhr.send(requestData);
    }
}

// Schedule the job to run daily at 3 AM UTC
schedule.scheduleJob("0 3 * * *", updateKeywordRankings);

// **Execute the cron function immediately if run manually**
if (require.main === module) {
    updateKeywordRankings();
}