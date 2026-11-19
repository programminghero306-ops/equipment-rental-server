const { createRemoteJWKSet, jwtVerify } = require("jose");
const { getDb } = require("../db");

const AUTH_URL = (process.env.AUTH_URL || "").replace(/\/$/, "");
const JWKS = createRemoteJWKSet(new URL(`${AUTH_URL}/api/auth/jwks`));

// 1. Checks the token is real and finds the user in the database
const verifyToken = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).send({ message: "Unauthorized: no token" });
  }

  try {
    const token = header.split(" ")[1];
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: AUTH_URL,
      audience: AUTH_URL,
    });

    const db = await getDb();
    const user = await db.collection("user").findOne({ email: payload.email });
    if (!user) {
      return res.status(401).send({ message: "Unauthorized: user not found" });
    }

    req.user = {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role || "customer",
    };
    next();
  } catch (err) {
    console.error("Token error:", err.message);
    return res.status(401).send({ message: "Unauthorized: invalid token" });
  }
};

// 2. Checks the user has one of the allowed roles
const verifyRole = (...allowedRoles) => (req, res, next) => {
  if (!req.user || !allowedRoles.includes(req.user.role)) {
    return res.status(403).send({ message: "Forbidden: access denied" });
  }
  next();
};

const verifyRenter = verifyRole("customer"); // "renter" in the assignment = customer
const verifyOwner = verifyRole("owner");
const verifyAdmin = verifyRole("admin");

module.exports = { verifyToken, verifyRenter, verifyOwner, verifyAdmin };