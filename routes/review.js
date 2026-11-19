const express = require("express");
const { getDb } = require("../db");

const router = express.Router();

// Public: latest reviews for the Home page
router.get("/", async (req, res) => {
  try {
    const db = await getDb();
    const reviews = await db
      .collection("reviews")
      .find({})
      .sort({ createdAt: -1 })
      .limit(8)
      .toArray();
    res.json(reviews);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;