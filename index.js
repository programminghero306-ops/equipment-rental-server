const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const express = require("express");
const cors = require("cors");
const { getDb } = require("./db");
const {
  verifyToken,
  verifyRenter,
  verifyOwner,
  verifyAdmin,
} = require("./middleware/auth");

const app = express();
const port = process.env.PORT || 5000;

// Middleware
const allowedOrigins = [
  process.env.CLIENT_URL,
  "http://localhost:3000",
  "https://equipment-rental-client.vercel.app",
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

app.get("/", (req, res) => {
  res.send("Equipment Rental API v4 is running");
});
app.get("/health", async (req, res) => {
  try {
    await getDb();
    res.json({ ok: true, message: "Database connected" });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

// Test routes for token and role checks (we will remove these later)
app.get("/me", verifyToken, (req, res) => {
  res.json({ user: req.user });
});

app.get("/test/admin", verifyToken, verifyAdmin, (req, res) => {
  res.json({ message: "Hello admin", user: req.user });
});

app.get("/test/owner", verifyToken, verifyOwner, (req, res) => {
  res.json({ message: "Hello owner", user: req.user });
});

// Equipment routes
app.use("/equipment", require("./routes/equipment"));

app.use("/reviews", require("./routes/review"));

app.use("/users", require("./routes/users"));

app.use("/bookings", require("./routes/bookings"));

app.use("/favorites", require("./routes/favorites"));
// Start the server (only when run directly)
if (require.main === module) {
  app.listen(port, () => console.log(`Server running on port ${port}`));
}

module.exports = app;