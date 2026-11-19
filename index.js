require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion } = require("mongodb");

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(
  cors({
    origin: [process.env.CLIENT_URL, "http://localhost:3000"],
    credentials: true,
  })
);
app.use(express.json());

// Database connection
const client = new MongoClient(process.env.MONGODB_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: false,
    deprecationErrors: true,
  },
});

let db;
async function getDb() {
  if (!db) {
    await client.connect();
    db = client.db("equipmentRental");
  }
  return db;
}

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

// Start the server (only when run directly)
if (require.main === module) {
  app.listen(port, () => console.log(`Server running on port ${port}`));
}

module.exports = app;