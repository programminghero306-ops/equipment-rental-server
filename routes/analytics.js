const express = require("express");
const { getDb } = require("../db");
const { verifyToken, verifyOwner, verifyAdmin } = require("../middleware/auth");

const router = express.Router();
const MONTHS = 6;

const round = (n) => Math.round((n || 0) * 100) / 100;

// The last N calendar months, oldest first
function lastMonths(count) {
  const now = new Date();
  const list = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    list.push({
      key: d.toISOString().slice(0, 7),
      label: d.toLocaleString("en-US", {
        month: "short",
        year: "2-digit",
        timeZone: "UTC",
      }),
      start: d,
    });
  }
  return list;
}

const monthMap = (rows, field) => new Map(rows.map((r) => [r._id, r[field]]));

// Confirmed bookings whose end date has passed become "completed"
async function completeExpired(db) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  await db.collection("bookings").updateMany(
    { bookingStatus: "confirmed", endDate: { $lt: today } },
    { $set: { bookingStatus: "completed" } }
  );
}

const byMonth = (dateField, valueExpr) => [
  {
    $group: {
      _id: { $dateToString: { format: "%Y-%m", date: `$${dateField}` } },
      value: valueExpr,
    },
  },
];

// ---------- ADMIN: platform-wide numbers ----------
router.get("/admin", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const db = await getDb();
    await completeExpired(db);

    const months = lastMonths(MONTHS);
    const since = months[0].start;

    const [
      totalUsers,
      totalEquipment,
      totalBookings,
      pendingApprovals,
      completedRentals,
      revenueRows,
      bookingRows,
      paymentRows,
      roleRows,
      statusRows,
    ] = await Promise.all([
      db.collection("user").countDocuments(),
      db.collection("equipment").countDocuments(),
      db.collection("bookings").countDocuments({ paymentStatus: "paid" }),
      db.collection("equipment").countDocuments({ status: "pending" }),
      db.collection("bookings").countDocuments({ bookingStatus: "completed" }),
      db
        .collection("payments")
        .aggregate([{ $group: { _id: null, total: { $sum: "$amount" } } }])
        .toArray(),
      db
        .collection("bookings")
        .aggregate([
          { $match: { paymentStatus: "paid", createdAt: { $gte: since } } },
          ...byMonth("createdAt", { $sum: 1 }),
        ])
        .toArray(),
      db
        .collection("payments")
        .aggregate([
          { $match: { paidAt: { $gte: since } } },
          ...byMonth("paidAt", { $sum: "$amount" }),
        ])
        .toArray(),
      db
        .collection("user")
        .aggregate([
          { $group: { _id: { $ifNull: ["$role", "customer"] }, value: { $sum: 1 } } },
        ])
        .toArray(),
      db
        .collection("equipment")
        .aggregate([{ $group: { _id: "$status", value: { $sum: 1 } } }])
        .toArray(),
    ]);

    const bookingsByMonth = monthMap(bookingRows, "value");
    const revenueByMonth = monthMap(paymentRows, "value");

    res.json({
      stats: {
        totalUsers,
        totalEquipment,
        totalBookings,
        pendingApprovals,
        completedRentals,
        totalRevenue: round(revenueRows[0] ? revenueRows[0].total : 0),
      },
      monthly: months.map((m) => ({
        month: m.label,
        bookings: bookingsByMonth.get(m.key) || 0,
        revenue: round(revenueByMonth.get(m.key)),
      })),
      usersByRole: roleRows.map((r) => ({ name: r._id, value: r.value })),
      equipmentByStatus: statusRows.map((r) => ({ name: r._id, value: r.value })),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ---------- OWNER: my own rental business ----------
router.get("/owner", verifyToken, verifyOwner, async (req, res) => {
  try {
    const db = await getDb();
    await completeExpired(db);

    const ownerId = req.user.id;
    const months = lastMonths(MONTHS);
    const since = months[0].start;

    const [
      totalListed,
      pendingEquipment,
      totalRentals,
      activeRentals,
      completedRentals,
      earningRows,
      monthlyRows,
      topRows,
      statusRows,
    ] = await Promise.all([
      db.collection("equipment").countDocuments({ ownerId }),
      db.collection("equipment").countDocuments({ ownerId, status: "pending" }),
      db.collection("bookings").countDocuments({ ownerId, paymentStatus: "paid" }),
      db.collection("bookings").countDocuments({ ownerId, bookingStatus: "confirmed" }),
      db.collection("bookings").countDocuments({ ownerId, bookingStatus: "completed" }),
      db
        .collection("payments")
        .aggregate([
          { $match: { ownerId } },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ])
        .toArray(),
      db
        .collection("payments")
        .aggregate([
          { $match: { ownerId, paidAt: { $gte: since } } },
          ...byMonth("paidAt", { $sum: "$amount" }),
        ])
        .toArray(),
      db
        .collection("payments")
        .aggregate([
          { $match: { ownerId } },
          { $group: { _id: "$equipmentName", value: { $sum: "$amount" } } },
          { $sort: { value: -1 } },
          { $limit: 5 },
        ])
        .toArray(),
      db
        .collection("equipment")
        .aggregate([
          { $match: { ownerId } },
          { $group: { _id: "$status", value: { $sum: 1 } } },
        ])
        .toArray(),
    ]);

    const earningsByMonth = monthMap(monthlyRows, "value");

    res.json({
      stats: {
        totalListed,
        pendingEquipment,
        totalRentals,
        activeRentals,
        completedRentals,
        totalEarnings: round(earningRows[0] ? earningRows[0].total : 0),
      },
      monthly: months.map((m) => ({
        month: m.label,
        earnings: round(earningsByMonth.get(m.key)),
      })),
      topEquipment: topRows.map((r) => ({ name: r._id, earnings: round(r.value) })),
      equipmentByStatus: statusRows.map((r) => ({ name: r._id, value: r.value })),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;