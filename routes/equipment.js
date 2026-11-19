const express = require("express");
const { ObjectId } = require("mongodb");
const { getDb } = require("../db");
const {
  verifyToken,
  verifyOwner,
  verifyAdmin,
} = require("../middleware/auth");

const router = express.Router();

const CATEGORIES = [
  "Construction Equipment",
  "Photography Equipment",
  "Vehicles & Transportation",
  "Agriculture Equipment",
  "Electronics",
  "Event Equipment",
];
const RENTAL_TYPES = ["Daily", "Weekly", "Monthly"];

const equipmentCollection = async () =>
  (await getDb()).collection("equipment");

// Makes the search text safe to use in a search pattern
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ---------- PUBLIC: 6 newest approved items (Home page) ----------
router.get("/featured", async (req, res) => {
  try {
    const col = await equipmentCollection();
    const items = await col
      .find({ status: "approved" })
      .sort({ createdAt: -1 })
      .limit(6)
      .toArray();
    res.json(items);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ---------- PUBLIC: all approved items with search, filter, sort, pagination ----------
router.get("/", async (req, res) => {
  try {
    const {
      search,
      category,
      rentalType,
      minPrice,
      maxPrice,
      availability,
      sort,
      page = 1,
      limit = 9,
    } = req.query;

    const query = { status: "approved" };

    if (search) {
      const regex = new RegExp(escapeRegex(search), "i");
      query.$or = [{ name: regex }, { location: regex }, { category: regex }];
    }
    if (category) query.category = category;
    if (rentalType) query.rentalType = rentalType;
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = Number(minPrice);
      if (maxPrice) query.price.$lte = Number(maxPrice);
    }
    if (availability === "available") query.quantity = { $gt: 0 };
    if (availability === "unavailable") query.quantity = { $lte: 0 };

    const sortOptions = {
      price_asc: { price: 1 },
      price_desc: { price: -1 },
      newest: { createdAt: -1 },
    };

    const pageNum = Math.max(Number(page) || 1, 1);
    const limitNum = Math.min(Math.max(Number(limit) || 9, 1), 50);

    const col = await equipmentCollection();
    const total = await col.countDocuments(query);
    const items = await col
      .find(query)
      .sort(sortOptions[sort] || { createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .toArray();

    res.json({
      items,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ---------- OWNER: my own equipment ----------
router.get("/mine", verifyToken, verifyOwner, async (req, res) => {
  try {
    const col = await equipmentCollection();
    const items = await col
      .find({ ownerId: req.user.id })
      .sort({ createdAt: -1 })
      .toArray();
    res.json(items);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ---------- OWNER: add new equipment (status always starts as pending) ----------
router.post("/", verifyToken, verifyOwner, async (req, res) => {
  try {
    const b = req.body;
    const required = [
      "name", "description", "category", "location", "price",
      "rentalType", "quantity", "condition", "brand", "model", "image", "terms",
    ];
    for (const field of required) {
      if (b[field] === undefined || b[field] === "") {
        return res.status(400).json({ message: `${field} is required` });
      }
    }
    if (!CATEGORIES.includes(b.category)) {
      return res.status(400).json({ message: "Invalid category" });
    }
    if (!RENTAL_TYPES.includes(b.rentalType)) {
      return res.status(400).json({ message: "Invalid rental type" });
    }
    if (!(Number(b.price) > 0) || !(Number(b.quantity) >= 0)) {
      return res.status(400).json({ message: "Invalid price or quantity" });
    }

    const doc = {
      name: String(b.name).trim(),
      description: String(b.description).trim(),
      category: b.category,
      location: String(b.location).trim(),
      price: Number(b.price),
      rentalType: b.rentalType,
      quantity: Number(b.quantity),
      condition: String(b.condition).trim(),
      brand: String(b.brand).trim(),
      model: String(b.model).trim(),
      image: String(b.image).trim(),
      terms: String(b.terms).trim(),
      status: "pending",
      // Owner info comes from the verified token, never from the request body
      ownerId: req.user.id,
      ownerName: req.user.name,
      ownerEmail: req.user.email,
      createdAt: new Date(),
    };

    const col = await equipmentCollection();
    const result = await col.insertOne(doc);
    res.status(201).json({ insertedId: result.insertedId });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ---------- ADMIN: approve or reject ----------
router.patch("/:id/status", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    if (!["pending", "approved", "rejected"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid id" });
    }
    const col = await equipmentCollection();
    const result = await col.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { status } }
    );
    if (result.matchedCount === 0) {
      return res.status(404).json({ message: "Equipment not found" });
    }
    res.json({ message: `Status changed to ${status}` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ---------- PRIVATE: one item's details (keep this LAST) ----------
router.get("/:id", verifyToken, async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid id" });
    }
    const col = await equipmentCollection();
    const item = await col.findOne({ _id: new ObjectId(req.params.id) });
    if (!item) return res.status(404).json({ message: "Equipment not found" });

    // Pending or rejected items are only visible to their owner and admins
    const canSee = req.user.role === "admin" || item.ownerId === req.user.id;
    if (item.status !== "approved" && !canSee) {
      return res.status(404).json({ message: "Equipment not found" });
    }
    res.json(item);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;