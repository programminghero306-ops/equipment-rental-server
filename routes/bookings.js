const express = require("express");
const Stripe = require("stripe");
const { ObjectId } = require("mongodb");
const { getDb } = require("../db");
const { verifyToken, verifyRenter } = require("../middleware/auth");

const router = express.Router();

const DAY = 24 * 60 * 60 * 1000;
const PHONE_RE = /^[0-9+\-\s()]{7,20}$/;

const getStripe = () => {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("Stripe is not configured");
  }
  return new Stripe(process.env.STRIPE_SECRET_KEY);
};

const clientUrl = () =>
  (process.env.CLIENT_URL || "http://localhost:3000").replace(/\/$/, "");

const todayUtc = () => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

const parseDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
};

// Price is always calculated here on the server
function calculate(item, start, end, quantity) {
  const days = Math.round((end - start) / DAY) + 1;
  const periods =
    item.rentalType === "Weekly"
      ? Math.ceil(days / 7)
      : item.rentalType === "Monthly"
      ? Math.ceil(days / 30)
      : days;
  const total = Math.round(item.price * periods * quantity * 100) / 100;
  return { days, periods, total };
}

// How many units are already taken by paid bookings that overlap these dates
async function bookedQuantity(db, equipmentId, start, end) {
  const result = await db
    .collection("bookings")
    .aggregate([
      {
        $match: {
          equipmentId,
          paymentStatus: "paid",
          bookingStatus: "confirmed",
          startDate: { $lte: end },
          endDate: { $gte: start },
        },
      },
      { $group: { _id: null, qty: { $sum: "$quantity" } } },
    ])
    .toArray();
  return result[0] ? result[0].qty : 0;
}

// Confirmed bookings whose end date has passed become "completed"
async function completeExpired(db, filter = {}) {
  await db.collection("bookings").updateMany(
    { ...filter, bookingStatus: "confirmed", endDate: { $lt: todayUtc() } },
    { $set: { bookingStatus: "completed" } }
  );
}

async function createCheckoutSession(booking, email) {
  const stripe = getStripe();
  const start = booking.startDate.toISOString().slice(0, 10);
  const end = booking.endDate.toISOString().slice(0, 10);

  return stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: email,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: Math.round(booking.totalAmount * 100),
          product_data: {
            name: booking.equipmentName,
            description: `${booking.quantity} unit(s), ${start} to ${end}`,
          },
        },
      },
    ],
    metadata: {
      bookingId: booking._id.toString(),
      customerId: booking.customerId,
    },
    success_url: `${clientUrl()}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${clientUrl()}/payment/cancel`,
  });
}

// ---------- CUSTOMER: start a booking and get the Stripe payment link ----------
router.post("/checkout", verifyToken, verifyRenter, async (req, res) => {
  try {
    const b = req.body;
    if (!ObjectId.isValid(b.equipmentId)) {
      return res.status(400).json({ message: "Invalid equipment" });
    }

    const start = parseDate(b.startDate);
    const end = parseDate(b.endDate);
    const quantity = Number(b.quantity);
    const phone = String(b.phone || "").trim();
    const address = String(b.address || "").trim();
    const notes = String(b.notes || "").trim();

    if (!start || !end) {
      return res.status(400).json({ message: "Please choose valid start and end dates" });
    }
    if (start < todayUtc()) {
      return res.status(400).json({ message: "Start date cannot be in the past" });
    }
    if (end < start) {
      return res.status(400).json({ message: "End date must be on or after the start date" });
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      return res.status(400).json({ message: "Quantity must be at least 1" });
    }
    if (!PHONE_RE.test(phone)) {
      return res.status(400).json({ message: "Please enter a valid contact number" });
    }
    if (address.length < 5) {
      return res.status(400).json({ message: "Please enter your delivery address" });
    }

    const db = await getDb();
    const item = await db
      .collection("equipment")
      .findOne({ _id: new ObjectId(b.equipmentId), status: "approved" });
    if (!item) {
      return res.status(404).json({ message: "Equipment not found" });
    }

    // Availability check
    const booked = await bookedQuantity(db, item._id.toString(), start, end);
    const available = Math.max(item.quantity - booked, 0);
    if (quantity > available) {
      return res.status(400).json({
        message:
          available === 0
            ? "This equipment is fully booked for those dates"
            : `Only ${available} unit(s) available for those dates`,
      });
    }

    const { days, periods, total } = calculate(item, start, end, quantity);

    const bookings = db.collection("bookings");
    const booking = {
      equipmentId: item._id.toString(),
      equipmentName: item.name,
      equipmentImage: item.image,
      category: item.category,
      ownerId: item.ownerId,
      ownerName: item.ownerName,
      ownerEmail: item.ownerEmail,
      customerId: req.user.id,
      customerName: req.user.name,
      customerEmail: req.user.email,
      startDate: start,
      endDate: end,
      quantity,
      rentalType: item.rentalType,
      unitPrice: item.price,
      days,
      periods,
      totalAmount: total,
      phone,
      address,
      notes,
      paymentStatus: "unpaid",
      bookingStatus: "pending",
      createdAt: new Date(),
    };

    const inserted = await bookings.insertOne(booking);

    try {
      const session = await createCheckoutSession(
        { ...booking, _id: inserted.insertedId },
        req.user.email
      );
      await bookings.updateOne(
        { _id: inserted.insertedId },
        { $set: { stripeSessionId: session.id } }
      );
      res.status(201).json({ url: session.url, bookingId: inserted.insertedId });
    } catch (stripeError) {
      console.error("Stripe error:", stripeError.message);
      await bookings.deleteOne({ _id: inserted.insertedId });
      res.status(500).json({ message: "Could not start the payment. Please try again." });
    }
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ---------- CUSTOMER: confirm payment after Stripe sends them back ----------
router.post("/confirm", verifyToken, verifyRenter, async (req, res) => {
  try {
    const sessionId = String(req.body.sessionId || "");
    if (!sessionId.startsWith("cs_")) {
      return res.status(400).json({ message: "Invalid payment session" });
    }

    // Ask Stripe directly, so a fake request cannot mark a booking as paid
    const session = await getStripe().checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== "paid") {
      return res.status(400).json({ message: "Payment has not been completed" });
    }

    const meta = session.metadata || {};
    if (!ObjectId.isValid(meta.bookingId) || meta.customerId !== req.user.id) {
      return res.status(403).json({ message: "This payment does not belong to you" });
    }

    const db = await getDb();
    const bookings = db.collection("bookings");
    const payments = db.collection("payments");

    const booking = await bookings.findOne({
      _id: new ObjectId(meta.bookingId),
      customerId: req.user.id,
    });
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    // One payment record per Stripe session, even if this route runs twice
    await payments.createIndex({ stripeSessionId: 1 }, { unique: true });
    try {
      await payments.insertOne({
        bookingId: booking._id.toString(),
        equipmentId: booking.equipmentId,
        equipmentName: booking.equipmentName,
        customerId: booking.customerId,
        customerName: booking.customerName,
        customerEmail: booking.customerEmail,
        ownerId: booking.ownerId,
        amount: session.amount_total / 100,
        currency: session.currency,
        transactionId: session.payment_intent,
        stripeSessionId: session.id,
        paymentStatus: "paid",
        paidAt: new Date(),
      });
    } catch (err) {
      if (err.code !== 11000) throw err; // 11000 means it was already saved
    }

    await bookings.updateOne(
      { _id: booking._id },
      {
        $set: {
          paymentStatus: "paid",
          bookingStatus:
            booking.bookingStatus === "completed" ? "completed" : "confirmed",
          transactionId: session.payment_intent,
          paidAt: new Date(),
        },
      }
    );

    const updated = await bookings.findOne({ _id: booking._id });
    res.json({ booking: updated });
  } catch (err) {
    console.error("Confirm error:", err.message);
    res.status(500).json({ message: "Could not verify the payment" });
  }
});

// ---------- CUSTOMER: my own bookings ----------
router.get("/mine", verifyToken, verifyRenter, async (req, res) => {
  try {
    const db = await getDb();
    await completeExpired(db, { customerId: req.user.id });
    const items = await db
      .collection("bookings")
      .find({ customerId: req.user.id })
      .sort({ createdAt: -1 })
      .toArray();
    res.json(items);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ---------- CUSTOMER: pay for an unpaid booking ----------
router.post("/:id/pay", verifyToken, verifyRenter, async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid id" });
    }
    const db = await getDb();
    const bookings = db.collection("bookings");

    const booking = await bookings.findOne({
      _id: new ObjectId(req.params.id),
      customerId: req.user.id,
      paymentStatus: "unpaid",
      bookingStatus: "pending",
    });
    if (!booking) {
      return res.status(404).json({ message: "Booking not found or already paid" });
    }
    if (booking.startDate < todayUtc()) {
      return res.status(400).json({
        message: "The start date has passed. Please make a new booking.",
      });
    }

    const item = await db
      .collection("equipment")
      .findOne({ _id: new ObjectId(booking.equipmentId), status: "approved" });
    const booked = await bookedQuantity(db, booking.equipmentId, booking.startDate, booking.endDate);
    if (!item || booking.quantity > item.quantity - booked) {
      return res.status(400).json({
        message: "This equipment is no longer available for those dates",
      });
    }

    const session = await createCheckoutSession(booking, req.user.email);
    await bookings.updateOne(
      { _id: booking._id },
      { $set: { stripeSessionId: session.id } }
    );
    res.json({ url: session.url });
  } catch (err) {
    console.error("Pay error:", err.message);
    res.status(500).json({ message: "Could not start the payment. Please try again." });
  }
});

// ---------- CUSTOMER: cancel an unpaid booking ----------
router.patch("/:id/cancel", verifyToken, verifyRenter, async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid id" });
    }
    const db = await getDb();
    const result = await db.collection("bookings").updateOne(
      {
        _id: new ObjectId(req.params.id),
        customerId: req.user.id,
        paymentStatus: "unpaid",
        bookingStatus: "pending",
      },
      { $set: { bookingStatus: "cancelled" } }
    );
    if (result.matchedCount === 0) {
      return res.status(404).json({ message: "Booking not found or already paid" });
    }
    res.json({ message: "Booking cancelled" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
module.exports.completeExpired = completeExpired;