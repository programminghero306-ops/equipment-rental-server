require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { getDb } = require("./db");

const app = express();
const port = process.env.PORT || 5000;

// Middleware
const allowedOrigins = [
  process.env.CLIENT_URL,
  "http://localhost:3000",
  "https://equipment-rental-client.vercel.app",
  "https://equipment-rental-client-lovat.vercel.app",
]
  .filter(Boolean)
  .map((url) => url.replace(/\/$/, ""));

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);
app.use(express.json());

// Routes
app.get("/", (req, res) => {
  res.send("Equipment Rental API is running");
});

app.get("/health", async (req, res) => {
  try {
    await getDb();
    res.json({ ok: true, message: "Database connected" });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

app.use("/equipment", require("./routes/equipment"));
app.use("/reviews", require("./routes/reviews"));
app.use("/users", require("./routes/users"));
app.use("/bookings", require("./routes/bookings"));
app.use("/favorites", require("./routes/favorites"));
app.use("/analytics", require("./routes/analytics"));

// Unknown routes
app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// Start the server (only when run directly)
if (require.main === module) {
  app.listen(port, () => console.log(`Server running on port ${port}`));
}

module.exports = app;