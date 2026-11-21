const express = require("express");
const { ObjectId } = require("mongodb");
const { getDb } = require("../db");
const { verifyToken } = require("../middleware/auth");

const router = express.Router();

// Public: get latest reviews (supports optional ?equipmentId=... filter)
router.get("/", async (req, res) => {
  try {
    const { equipmentId } = req.query;
    const filter = {};

    if (equipmentId) {
      filter.equipmentId = ObjectId.isValid(equipmentId)
        ? new ObjectId(equipmentId)
        : equipmentId;
    }

    const db = await getDb();
    const reviews = await db
      .collection("reviews")
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(equipmentId ? 50 : 8)
      .toArray();

    res.json(reviews);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Protected: Post a new review (requires login)
router.post("/", verifyToken, async (req, res) => {
  try {
    const { rating, comment, equipmentId, equipmentName } = req.body;

    // Validation
    if (!rating || !comment || comment.trim() === "") {
      return res.status(400).json({ message: "Rating and comment are required." });
    }

    const numRating = Number(rating);
    if (isNaN(numRating) || numRating < 1 || numRating > 5) {
      return res.status(400).json({ message: "Rating must be a number between 1 and 5." });
    }

    const db = await getDb();

    // Construct the review object
    const newReview = {
      userId: req.user.id,
      customerName: req.user.name || "Anonymous",
      customerEmail: req.user.email,
      customerImage:
        req.user.image ||
        `https://ui-avatars.com/api/?name=${encodeURIComponent(
          req.user.name || "User"
        )}&background=random`,
      rating: numRating,
      comment: comment.trim(),
      createdAt: new Date(),
    };

    // Attach equipment info if provided
    if (equipmentId) {
      newReview.equipmentId = ObjectId.isValid(equipmentId)
        ? new ObjectId(equipmentId)
        : equipmentId;
    }
    if (equipmentName) {
      newReview.equipmentName = equipmentName;
    }

    const result = await db.collection("reviews").insertOne(newReview);

    res.status(201).json({
      ok: true,
      message: "Review posted successfully",
      reviewId: result.insertedId,
      review: { _id: result.insertedId, ...newReview },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
