const express = require("express");

const healthRouter = require("./routes/health");
const purposesRouter = require("./routes/purposes");
const {
    purposeNoticesRouter,
    noticesRouter
} = require("./routes/notices");
const consentRouter = require("./routes/consent");

const app = express();

app.use(express.json());

app.use("/health", healthRouter);
app.use("/purposes", purposesRouter);
app.use("/purposes", purposeNoticesRouter);
app.use("/notices", noticesRouter);
app.use("/consent", consentRouter);

app.use((req, res) => {
    res.status(404).json({
        error: "Route not found"
    });
});

app.use((err, req, res, next) => {
    if (err.name === "ZodError") {
        return res.status(400).json({
            error: "Invalid request data"
        });
    }

    console.error(err);

    res.status(500).json({
        error: "Something went wrong"
    });
});

if (require.main === module) {
    app.listen(3000, () => {
        console.log("Server running on http://localhost:3000");
    });
}

module.exports = app;