const express = require("express");
const path = require("path");
const connectDB = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const dashboardRoutes = require("./routes/dashboard");
const cookieParser = require("cookie-parser");
require("dotenv").config();

const jwt = require("jsonwebtoken");

const app = express();
connectDB();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));
app.set("view engine", "ejs");

// Routes

app.get("/", (req, res) => {
    const token = req.cookies.token;
    let user = null;

    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            user = decoded;
        } catch (error) {
            console.error("Invalid token:", error);
        }
    }

    res.render("index", { user });
});

app.use("/", authRoutes);

// Serve Register Page
app.get("/register", (req, res) => {
    res.render("register");
});

// Serve Login Page
app.get("/login", (req, res) => {
    res.render("login");
});


app.use("/dashboard", dashboardRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
