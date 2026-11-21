const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const { MongoClient, ServerApiVersion } = require("mongodb");

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

module.exports = { getDb };