const express = require("express");

const healthRouter = require("./routes/health");
const pool = require("./db");

const app = express();

app.use(express.json());

app.use("/health", healthRouter);

app.use((req, res) => {
    res.status(404).json({
        error: "Route not found"
    });
});

app.use((err, req, res, next) => {
    console.error(err);

    res.status(500).json({
        error: "Something went wrong"
    });
});

app.listen(3000, () => {
    console.log("Server running on http://localhost:3000");
});