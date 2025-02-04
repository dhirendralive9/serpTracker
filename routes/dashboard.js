const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth");
const Keyword = require("../models/Keyword");
const axios = require("axios");
const RecentCheck = require("../models/RecentCheck");


const { XMLHttpRequest } = require("xmlhttprequest");
// Dashboard Route
router.get("/", authMiddleware, async (req, res) => {
    try {
        const trackedKeywords = await Keyword.find({ user: req.user.id }).sort({ date: -1 });
        res.render("dashboard", { username: req.user.username, trackedKeywords });
    } catch (error) {
        console.error("Error loading dashboard:", error);
        res.status(500).send("Server Error");
    }
});

// Map country codes to DataForSEO's location codes
const locationCodes = {
    USA: 2840,
    UK: 2826,
    Australia: 2782,
    Canada: 2841,
    India: 2793
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

// Handle keyword tracking request
router.post("/track", authMiddleware, async (req, res) => {
    const { keyword, domain, country, device_os, frequency, searchEngine } = req.body;
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
                        return res.redirect("/dashboard");
                    }

                    // Extract ranking data
                    const results = response.tasks[0].result[0].items;
                    const position = results.findIndex(item => item.url && item.url.includes(domain)) + 1;
                    rank = position > 0 ? position : null;

                    // Store keyword tracking in the database
                    const newKeyword = new Keyword({
                        user: req.user.id,
                        searchEngine,
                        keyword,
                        domain,
                        country,
                        device,
                        os,
                        frequency: parseInt(frequency, 10),
                        rank
                    });

                    newKeyword.save().then(() => {
                        res.redirect("/dashboard");
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




module.exports = router;
