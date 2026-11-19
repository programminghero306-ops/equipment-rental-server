require("dotenv").config();
const { getDb } = require("./db");

const terms =
  "A refundable security deposit is required. Equipment must be returned on time and in the same condition. Late returns are charged extra per day.";

const item = (name, category, location, price, rentalType, quantity, brand, model, condition, description) => ({
  name,
  category,
  location,
  price,
  rentalType,
  quantity,
  brand,
  model,
  condition,
  description,
  terms,
  image: `https://picsum.photos/seed/${encodeURIComponent(name)}/800/600`,
});

const equipment = [
  item("CAT 320 Excavator", "Construction Equipment", "Dhaka", 3200, "Monthly", 2, "Caterpillar", "320", "Excellent", "Powerful 20-ton excavator for digging, trenching and site preparation. Operator available on request."),
  item("Concrete Mixer 350L", "Construction Equipment", "Chattogram", 35, "Daily", 8, "Bosch", "GBM 350", "Good", "Reliable 350 litre drum mixer, ideal for small and medium building projects."),
  item("Canon EOS R5 Camera Kit", "Photography Equipment", "Dhaka", 60, "Daily", 3, "Canon", "EOS R5", "Excellent", "Full-frame mirrorless camera with 24-70mm lens, two batteries and a 128GB card."),
  item("DJI Mavic 3 Drone", "Photography Equipment", "Sylhet", 80, "Daily", 2, "DJI", "Mavic 3", "Excellent", "4K aerial drone with 46 minutes of flight time. Includes 3 batteries and a carrying case."),
  item("Toyota Hiace 12-Seater Van", "Vehicles & Transportation", "Dhaka", 95, "Daily", 4, "Toyota", "Hiace 2022", "Good", "Air-conditioned 12-seater van for tours, events and group travel. Driver optional."),
  item("Royal Enfield Classic 350", "Vehicles & Transportation", "Cox's Bazar", 25, "Daily", 5, "Royal Enfield", "Classic 350", "Good", "Well-maintained touring motorcycle with two helmets included."),
  item("Kubota Mini Tractor", "Agriculture Equipment", "Rajshahi", 700, "Weekly", 2, "Kubota", "B2441", "Good", "Compact 24 HP tractor suited to small farms, with plough and trailer attachments."),
  item("Power Tiller", "Agriculture Equipment", "Khulna", 180, "Weekly", 6, "Yanmar", "TF85", "Good", "Easy-to-use power tiller for soil preparation in paddy and vegetable fields."),
  item("Epson 4K Projector", "Electronics", "Dhaka", 40, "Daily", 5, "Epson", "EH-TW7100", "Excellent", "Bright 3000 lumen 4K projector for presentations, events and movie nights."),
  item("Portable Generator 5kVA", "Electronics", "Chattogram", 300, "Weekly", 3, "Honda", "EG5500", "Good", "Quiet 5kVA petrol generator for events, shops and construction sites."),
  item("Professional PA Sound System", "Event Equipment", "Dhaka", 120, "Daily", 3, "Yamaha", "Stagepas 600", "Excellent", "Complete sound system with two speakers, mixer and two wireless microphones."),
  item("Event Tent 10x10m", "Event Equipment", "Sylhet", 250, "Weekly", 4, "Eurotent", "Premium 10x10", "Good", "Waterproof white tent for weddings, markets and outdoor events. Setup crew available."),
];

const reviews = [
  { customerName: "Rafiq Ahmed", rating: 5, comment: "Rented a drone for a wedding shoot. The owner was helpful and the booking was easy.", customerImage: "https://i.pravatar.cc/150?img=12" },
  { customerName: "Nusrat Jahan", rating: 4, comment: "Great prices and verified owners. The projector arrived on time and worked perfectly.", customerImage: "https://i.pravatar.cc/150?img=47" },
  { customerName: "Imran Hossain", rating: 5, comment: "Hired a mini tractor for a week. Smooth payment and the equipment was in great condition.", customerImage: "https://i.pravatar.cc/150?img=33" },
  { customerName: "Sadia Rahman", rating: 5, comment: "Found a sound system for our event in minutes. Will definitely use this platform again.", customerImage: "https://i.pravatar.cc/150?img=5" },
  { customerName: "Tanvir Alam", rating: 4, comment: "Flexible rental periods made it easy to plan our construction work.", customerImage: "https://i.pravatar.cc/150?img=15" },
];

async function seed() {
  const db = await getDb();

  const owner = await db.collection("user").findOne({ role: "owner" });
  if (!owner) {
    console.log("No owner account found. Set a user's role to 'owner' in Atlas first.");
    process.exit(1);
  }

  await db.collection("equipment").deleteMany({ seeded: true });
  await db.collection("reviews").deleteMany({ seeded: true });

  const now = Date.now();
  const docs = equipment.map((e, i) => ({
    ...e,
    status: "approved",
    ownerId: owner._id.toString(),
    ownerName: owner.name,
    ownerEmail: owner.email,
    createdAt: new Date(now - i * 60 * 60 * 1000),
    seeded: true,
  }));
  await db.collection("equipment").insertMany(docs);

  await db.collection("reviews").insertMany(
    reviews.map((r, i) => ({
      ...r,
      createdAt: new Date(now - i * 24 * 60 * 60 * 1000),
      seeded: true,
    }))
  );

  console.log(`Seeded ${docs.length} equipment items and ${reviews.length} reviews for owner: ${owner.email}`);
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});