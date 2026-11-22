const express = require("express");
const { ObjectId } = require("mongodb");
const { getDb } = require("../db");
const { verifyToken, verifyRenter } = require("../middleware/auth");

const router = express.Router();

// ---------- CUSTOMER: ids of everything I saved (for the heart button) ----------
router.get("/ids", verifyToken, verifyRenter, async (req, res) => {
  try {
    const db = await getDb();
    const favorites = await db
      .collection("favorites")
      .find({ customerId: req.user.id })
      .toArray();
    res.json(favorites.map((f) => f.equipmentId));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ---------- CUSTOMER: my favorite equipment (full details) ----------
router.get("/", verifyToken, verifyRenter, async (req, res) => {
  try {
    const db = await getDb();
    const favorites = await db
      .collection("favorites")
      .find({ customerId: req.user.id })
      .sort({ createdAt: -1 })
      .toArray();

    const ids = favorites
      .map((f) => f.equipmentId)
      .filter((id) => ObjectId.isValid(id))
      .map((id) => new ObjectId(id));

    const equipment = await db
      .collection("equipment")
      .find({ _id: { $in: ids }, status: "approved" })
      .toArray();

    // Keep the newest favorite first
    const byId = new Map(equipment.map((e) => [e._id.toString(), e]));
    res.json(favorites.map((f) => byId.get(f.equipmentId)).filter(Boolean));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ---------- CUSTOMER: add a favorite ----------
router.post("/", verifyToken, verifyRenter, async (req, res) => {
  try {
    const { equipmentId } = req.body;
    if (!ObjectId.isValid(equipmentId)) {
      return res.status(400).json({ message: "Invalid equipment" });
    }

    const db = await getDb();
    const item = await db
      .collection("equipment")
      .findOne({ _id: new ObjectId(equipmentId), status: "approved" });
    if (!item) {
      return res.status(404).json({ message: "Equipment not found" });
    }

    // Saving the same item twice does nothing
    await db.collection("favorites").updateOne(
      { customerId: req.user.id, equipmentId },
      { $setOnInsert: { createdAt: new Date() } },
      { upsert: true }
    );
    res.status(201).json({ message: "Added to favorites" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ---------- CUSTOMER: remove a favorite ----------
router.delete("/:equipmentId", verifyToken, verifyRenter, async (req, res) => {
  try {
    const db = await getDb();
    await db
      .collection("favorites")
      .deleteOne({ customerId: req.user.id, equipmentId: req.params.equipmentId });
    res.json({ message: "Removed from favorites" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;