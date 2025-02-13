const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth");
const Keyword = require("../models/Keyword");
const axios = require("axios");
const RecentCheck = require("../models/RecentCheck");
const Top100 = require("../models/Top100");
const User = require("../models/User");

const searchEngineEndpoints = {
    google: "https://api.dataforseo.com/v3/serp/google/organic/live/advanced",
    bing: "https://api.dataforseo.com/v3/serp/bing/organic/live/advanced",
    yahoo: "https://api.dataforseo.com/v3/serp/yahoo/organic/live/advanced",
    youtube: "https://api.dataforseo.com/v3/serp/youtube/organic/live/advanced"
};



const { XMLHttpRequest } = require("xmlhttprequest");
// Dashboard Route
router.get("/", authMiddleware, async (req, res) => {
    try {
        const trackedKeywords = await Keyword.find({ user: req.user.id }).sort({ date: -1 });
        console.log(req.user);
        const user = await User.findById(req.user.id).select("name");
        res.render("dashboard", { username: req.user.username, trackedKeywords,name:user.name });
    } catch (error) {
        console.error("Error loading dashboard:", error);
        res.status(500).send("Server Error");
    }
});

// Map country codes to DataForSEO's location codes
const locationCodes = {
    USA: 2840,
    UK: 2826,
    Australia: 2036,
    Canada: 2124,
    India: 2356
};


router.get("/check", authMiddleware, async (req, res) => {
    try {
        const recentChecks = await RecentCheck.find({ user: req.user.id }).sort({ dateChecked: -1 });
        res.render("check", { keyword: null, domain: null, rank: undefined, recentChecks });
    } catch (error) {
        console.error("❌ Error fetching recent checks:", error);
        res.status(500).send("Server Error");
    }
});


// Encode credentials in Base64
const authHeader = "Basic " + Buffer.from(`${process.env.DATAFORSEO_USERNAME}:${process.env.DATAFORSEO_PASSWORD}`).toString("base64");


const KeywordHistory = require("../models/KeywordHistory");

router.post("/track", authMiddleware, async (req, res) => {
    const { keyword, domain, country, device_os, frequency, searchEngine } = req.body;
    const [device, os] = device_os.split("/");
    const location_code = locationCodes[country];
    const apiEndpoint = searchEngineEndpoints[searchEngine || "google"];

    try {
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

                    // Save keyword to database
                    const newKeyword = new Keyword({
                        user: req.user.id,
                        searchEngine,
                        keyword,
                        domain,
                        country,
                        device,
                        os,
                        frequency: parseInt(frequency, 10),
                        rank // Store initial rank
                    });

                    const savedKeyword = await newKeyword.save();

                    // Create or update KeywordHistory entry
                    const historyEntry = await KeywordHistory.findOneAndUpdate(
                        { keywordId: savedKeyword._id },
                        { 
                            $push: { history: { position: rank, checkedAt: new Date() } } 
                        },
                        { upsert: true, new: true }
                    );

                    // Attach history ID to the keyword
                    await Keyword.updateOne(
                        { _id: savedKeyword._id },
                        { $set: { history: historyEntry._id } }
                    );

                    res.redirect("/dashboard");

                } catch (error) {
                    console.error("❌ Error processing SERP response:", error);
                    res.status(500).send("Server Error");
                }
            }
        };

        xhr.send(requestData);

    } catch (error) {
        console.error("❌ Error sending SERP request:", error);
        res.status(500).send("Server Error");
    }
});


router.post("/check", authMiddleware, async (req, res) => {
    const { keyword, domain, country, device_os, searchEngine } = req.body;
    const [device, os] = device_os.split("/");

    // Get DataForSEO location code
    const location_code = locationCodes[country];

    // Define API endpoint based on selected search engine
    let apiEndpoint;
    switch (searchEngine) {
        case "google":
            apiEndpoint = "https://api.dataforseo.com/v3/serp/google/organic/live/advanced";
            break;
        case "bing":
            apiEndpoint = "https://api.dataforseo.com/v3/serp/bing/organic/live/advanced";
            break;
        case "yahoo":
            apiEndpoint = "https://api.dataforseo.com/v3/serp/yahoo/organic/live/advanced";
            break;
        default:
            return res.status(400).send("Invalid search engine selected.");
    }

    try {
        // Prepare the request payload
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

        // Initialize XMLHttpRequest
        const xhr = new XMLHttpRequest();
        xhr.open("POST", apiEndpoint, true);
        xhr.setRequestHeader("Authorization", authHeader);
        xhr.setRequestHeader("Content-Type", "application/json");

        xhr.onreadystatechange = function () {
            if (xhr.readyState === 4) {
                try {
                    const response = JSON.parse(xhr.responseText);

                    let rank = null;

                    // Handle API errors
                    if (!response.tasks || response.tasks.length === 0 || !response.tasks[0].result || !response.tasks[0].result[0].items) {
                        console.warn("⚠️ No ranking data available.");
                        return res.render("check", { keyword, domain, rank: null });
                    }

                    // Extract ranking data
                    const results = response.tasks[0].result[0].items;
                    const position = results.findIndex(item => item.url && item.url.includes(domain)) + 1;
                    rank = position > 0 ? position : null;

                    // Store recent check in the database
                    const newCheck = new RecentCheck({
                        user: req.user.id,
                        searchEngine,
                        keyword,
                        domain,
                        country,
                        device,
                        os,
                        rank
                    });

                    newCheck.save().then(async () => {
                        // Fetch updated list of recent checks
                        const recentChecks = await RecentCheck.find({ user: req.user.id }).sort({ dateChecked: -1 });

                        // Render check page with results
                        res.render("check", { keyword, domain, rank, recentChecks });
                    }).catch(error => {
                        console.error("❌ Error saving to database:", error);
                        res.status(500).send("Server Error");
                    });

                } catch (error) {
                    console.error("❌ Error processing SERP response:", error);
                    res.status(500).send("Server Error");
                }
            }
        };

        // Send the request
        xhr.send(requestData);

    } catch (error) {
        console.error("❌ Error sending SERP request:", error);
        res.status(500).send("Server Error");
    }
});


router.post("/check/delete/:id", authMiddleware, async (req, res) => {
    try {
        await RecentCheck.findOneAndDelete({ _id: req.params.id, user: req.user.id });
        res.redirect("/dashboard/check");
    } catch (error) {
        console.error("❌ Error deleting recent check:", error);
        res.status(500).send("Server Error");
    }
});

// Delete keyword and its history
router.post("/delete/:id", async (req, res) => {
    try {
        const keywordId = req.params.id;

        // Delete keyword from Keyword collection
        const deletedKeyword = await Keyword.findByIdAndDelete(keywordId);
        if (!deletedKeyword) {
            return res.status(404).send("Keyword not found");
        }

        // Delete all history entries related to the keyword
        await KeywordHistory.deleteMany({ keywordId });

        console.log(`✅ Deleted keyword and its history: ${deletedKeyword.keyword}`);
        res.redirect("/dashboard");
    } catch (error) {
        console.error("❌ Error deleting keyword:", error);
        res.status(500).send("Server Error");
    }
});

router.post("/top100", authMiddleware, async (req, res) => {
    const { keyword, country, device_os, searchEngine } = req.body;
    const [device, os] = device_os.split("/");
    const location_code = locationCodes[country];
    let apiEndpoint = searchEngineEndpoints[searchEngine || "google"];

    if (searchEngine === "youtube") {
        apiEndpoint = "https://api.dataforseo.com/v3/serp/youtube/organic/live/advanced";
    }

    try {
        const requestData = JSON.stringify([
            searchEngine === "youtube"
                ? {
                    keyword,
                    location_code,
                    language_code: "en",
                    os,
                    block_depth: 20 // Correct for YouTube
                }
                : {
                    keyword,
                    location_code,
                    language_code: "en",
                    device,
                    os,
                    depth: 100
                }
        ]);

        //console.log("🔍 Sending API request for:", searchEngine, "Payload:", requestData);

        const xhr = new XMLHttpRequest();
        xhr.open("POST", apiEndpoint, true);
        xhr.setRequestHeader("Authorization", authHeader);
        xhr.setRequestHeader("Content-Type", "application/json");

        xhr.onreadystatechange = async function () {
            if (xhr.readyState === 4) {
                try {
                    const response = JSON.parse(xhr.responseText);
                    console.log("🔹 Raw API Response:", response);
        
                    // Ensure results is always defined as an empty array initially
                    let results = [];
        
                    if (response.tasks && response.tasks.length > 0 && response.tasks[0].result && response.tasks[0].result[0].items) {
                        results = response.tasks[0].result[0].items.map((item) => ({
                            url: item.url || "N/A",
                            title: item.title || "No Title Available",
                            description: item.description || "No description available",
                            thumbnail: searchEngine === "youtube" ? item.thumbnail_url : null
                        }));
                    } else {
                        console.warn("⚠️ No ranking data available for", searchEngine);
                    }
        
                    console.log("✅ Storing results in session:", results);

                    const top100Entry = new Top100({
                        user: req.user.id,
                        keyword,
                        searchEngine,
                        country,
                        device,
                        os,
                        results
                    });

                    await top100Entry.save();
        
                    req.session.results = results;
                    req.session.keyword = keyword;
                    req.session.searchEngine = searchEngine;
        
                    res.redirect("/dashboard/top100");
        
                } catch (error) {
                    console.error("❌ Error processing SERP response:", error);
                    res.status(500).send("Server Error");
                }
            }
        };
        

        xhr.send(requestData);
    } catch (error) {
        console.error("❌ Error sending SERP request:", error);
        res.status(500).send("Server Error");
    }
});


router.get("/top100", authMiddleware, (req, res) => {
    res.render("top100", {
        results: req.session.results || [],  // Ensure results is always an array
        keyword: req.session.keyword || "",
        searchEngine: req.session.searchEngine || "google"
    });

    // Clear session data after rendering to avoid stale results
    req.session.results = null;
    req.session.keyword = null;
    req.session.searchEngine = null;
});

router.get("/top100/history", authMiddleware, async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    try {
        const total = await Top100.countDocuments({ user: req.user.id });
        const history = await Top100.find({ user: req.user.id })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        res.render("top100_history", {
            history,
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit)
        });
    } catch (error) {
        console.error("❌ Error fetching history:", error);
        res.status(500).send("Server Error");
    }
});

// Delete entry
router.post("/top100/history/delete/:id", authMiddleware, async (req, res) => {
    try {
        await Top100.findOneAndDelete({ _id: req.params.id, user: req.user.id });
        res.redirect("/dashboard/top100/history");
    } catch (error) {
        console.error("❌ Error deleting entry:", error);
        res.status(500).send("Server Error");
    }
});

router.post("/top100/history/fetch/:id", authMiddleware, async (req, res) => {
    try {
        const entry = await Top100.findById(req.params.id);
        if (!entry) {
            return res.status(404).send("Entry not found.");
        }

        const { keyword, country, device, os, searchEngine } = entry;
        const location_code = locationCodes[country];
        let apiEndpoint = searchEngineEndpoints[searchEngine || "google"];

        if (searchEngine === "youtube") {
            apiEndpoint = "https://api.dataforseo.com/v3/serp/youtube/organic/live/advanced";
        }

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
                        return res.redirect("/dashboard/top100/history");
                    }

                    const results = response.tasks[0].result[0].items.map((item) => ({
                        url: item.url || "N/A",
                        title: item.title || "No Title Available",
                        description: item.description || "No description available",
                        thumbnail: searchEngine === "youtube" ? item.thumbnail_url : null
                    }));

                    const newEntry = new Top100({
                        user: req.user.id,
                        keyword,
                        searchEngine,
                        country,
                        device,
                        os,
                        results
                    });

                    await newEntry.save();

                    req.session.results = results;
                    req.session.keyword = keyword;
                    req.session.searchEngine = searchEngine;

                    res.redirect("/dashboard/top100");

                } catch (error) {
                    console.error("❌ Error processing SERP response:", error);
                    res.status(500).send("Server Error");
                }
            }
        };

        xhr.send(requestData);
    } catch (error) {
        console.error("❌ Error fetching data:", error);
        res.status(500).send("Server Error");
    }
});

router.get("/:keywordId", authMiddleware, async (req, res) => {
    try {
        const keyword = await Keyword.findById(req.params.keywordId);
        if (!keyword) return res.status(404).send("Keyword not found.");

        const historyEntry = await KeywordHistory.findOne({ keywordId: req.params.keywordId });
        const history = historyEntry ? historyEntry.history : [];

        // Convert checkedAt field for rendering in EJS
        const formattedHistory = history
            .filter(entry => entry.checkedAt && entry.position !== null) // Remove invalid data
            .map(entry => ({
                checkedAt: entry.checkedAt, // Ensure valid date format
                position: entry.position
            }));

        console.log("✅ Data being sent to keyword_stats.ejs:", JSON.stringify(formattedHistory, null, 2)); // Debug log

        res.render("keyword_stats", {
            keyword,
            history: formattedHistory, // Send formatted history to EJS
            page: 1,
            limit: 10,
            totalPages: Math.ceil(history.length / 10)
        });
    } catch (error) {
        console.error("❌ Error fetching keyword stats:", error);
        res.status(500).send("Server Error");
    }
});



module.exports = router;
