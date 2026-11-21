const express = require("express");
const { ObjectId } = require("mongodb");
const { getDb } = require("../db");
const { verifyToken, verifyAdmin } = require("../middleware/auth");

const router = express.Router();
const ROLES = ["customer", "owner", "admin"];

// ---------- ADMIN: list all users ----------
router.get("/", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const db = await getDb();
    const users = await db
      .collection("user")
      .find(
        {},
        { projection: { name: 1, email: 1, image: 1, role: 1, createdAt: 1 } }
      )
      .sort({ createdAt: -1 })
      .toArray();

    res.json(users.map((u) => ({ ...u, role: u.role || "customer" })));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ---------- ADMIN: change a user's role ----------
router.patch("/:id/role", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const role = String(req.body.role || "").toLowerCase().trim();
    if (!ROLES.includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid id" });
    }
    // Stops an admin from locking themselves out
    if (req.params.id === req.user.id) {
      return res.status(400).json({ message: "You cannot change your own role" });
    }

    const db = await getDb();
    const result = await db
      .collection("user")
      .updateOne(
        { _id: new ObjectId(req.params.id) },
        { $set: { role, updatedAt: new Date() } }
      );
    if (result.matchedCount === 0) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json({ message: `Role changed to ${role}` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ---------- ADMIN: remove a user ----------
router.delete("/:id", verifyToken, verifyAdmin, async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid id" });
    }
    if (req.params.id === req.user.id) {
      return res.status(400).json({ message: "You cannot delete your own account" });
    }

    const db = await getDb();
    const _id = new ObjectId(req.params.id);
    const result = await db.collection("user").deleteOne({ _id });
    if (result.deletedCount === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    // Also remove their login sessions and sign-in records
    const ids = [req.params.id, _id];
    await db.collection("session").deleteMany({ userId: { $in: ids } });
    await db.collection("account").deleteMany({ userId: { $in: ids } });

    res.json({ message: "User deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;