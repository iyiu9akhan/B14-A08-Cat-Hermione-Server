import express from "express";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";
import "dotenv/config";
import { createRemoteJWKSet, jwtVerify } from "jose";

const app = express();

app.use(express.json());

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
  }),
);

// MongoDB Connection Setup
const client = new MongoClient(
  `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.joq5z4d.mongodb.net`,
);

let db;
let eventsCollection;
let participantsCollection;
let usersCollection;

// Dynamic Lazy Connection for Serverless Environments
async function connectDB() {
  if (!db) {
    await client.connect();
    db = client.db("b14-a08-cat-hermione");
    eventsCollection = db.collection("events");
    participantsCollection = db.collection("participants");
    usersCollection = db.collection("user");

    // one user can join one event only once
    await participantsCollection.createIndex(
      { eventId: 1, email: 1 },
      { unique: true },
    );

    console.log("Successfully Connected to MongoDB");
  }
}

// Better Auth JWKS
const frontendUrl = (
  process.env.FRONTEND_JWKS_URL || "http://localhost:3000"
).replace(/\/+$/, "");

const jwks = createRemoteJWKSet(new URL(`${frontendUrl}/api/auth/jwks`));

// Verify JWT Middleware
const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).send({
      message: "Authorization token is missing.",
    });
  }

  const token = authHeader.slice(7).trim();

  if (!token) {
    return res.status(401).send({
      message: "Authorization token is missing.",
    });
  }

  try {
    const { payload } = await jwtVerify(token, jwks);

    if (
      !payload.sub ||
      typeof payload.email !== "string" ||
      !payload.email.trim()
    ) {
      return res.status(401).send({
        message: "Invalid token payload.",
      });
    }

    req.user = {
      id: payload.sub,
      email: payload.email.trim().toLowerCase(),
    };

    next();
  } catch (error) {
    console.error("Token verification failed:", error.code || error.message);

    return res.status(401).send({
      message: "Invalid or expired token.",
    });
  }
};

// Helper: { eventId: count } for all events
async function getCountsMap() {
  const counts = await participantsCollection
    .aggregate([{ $group: { _id: "$eventId", count: { $sum: 1 } } }])
    .toArray();

  const map = {};
  counts.forEach((item) => {
    map[item._id] = item.count;
  });
  return map;
}

// Helper: add participantsCount to events and remove old participants field
function addCounts(events, countsMap) {
  return events.map((event) => {
    const { participants, ...rest } = event;
    return {
      ...rest,
      participantsCount: countsMap[event._id.toString()] || 0,
    };
  });
}

// Root route for sanity check
app.get("/", (req, res) => {
  res.send("Hermione Server is running live!");
});

// Get all events - Public
app.get("/events", async (req, res) => {
  try {
    await connectDB();
    const allEvents = await eventsCollection.find({}).toArray();
    const countsMap = await getCountsMap();
    res.send(addCounts(allEvents, countsMap));
  } catch (error) {
    res.status(500).send({ message: "Server error" });
  }
});

// Get user's events - Protected
app.get("/events/manage/:email", verifyToken, async (req, res) => {
  try {
    await connectDB();
    const email = req.params.email.trim().toLowerCase();

    if (email !== req.user.email) {
      return res.status(403).send({ message: "Forbidden" });
    }

    const myEvents = await eventsCollection
      .find({ organizerEmail: req.user.email })
      .toArray();
    const countsMap = await getCountsMap();

    res.send(addCounts(myEvents, countsMap));
  } catch (error) {
    res.status(500).send({ message: "Server error" });
  }
});

// Get single event - Public
app.get("/events/:id", async (req, res) => {
  try {
    await connectDB();
    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid event id" });
    }

    const result = await eventsCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!result) {
      return res.status(404).send({ message: "Event not found" });
    }

    const userEmail = req.headers["x-user-email"]
      ? String(req.headers["x-user-email"]).trim().toLowerCase()
      : null;

    const participantsCount = await participantsCollection.countDocuments({
      eventId: id,
    });

    let joined = false;
    if (userEmail) {
      const found = await participantsCollection.findOne({
        eventId: id,
        email: userEmail,
      });
      joined = Boolean(found);
    }

    const { participants, ...rest } = result;

    res.send({
      ...rest,
      participantsCount,
      joined,
    });
  } catch (error) {
    res.status(500).send({ message: "Server error" });
  }
});

// Join event - Protected
app.post("/events/:id/join", verifyToken, async (req, res) => {
  try {
    await connectDB();
    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid event id" });
    }

    const event = await eventsCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!event) {
      return res.status(404).send({ message: "Event not found" });
    }

    if (event.organizerEmail === req.user.email) {
      return res
        .status(403)
        .send({ message: "Owner cannot join their own event" });
    }

    const maxParticipants = event.maxParticipants ?? 3;

    // Check if already joined
    const alreadyJoined = await participantsCollection.findOne({
      eventId: id,
      email: req.user.email,
    });

    if (alreadyJoined) {
      const participantsCount = await participantsCollection.countDocuments({
        eventId: id,
      });
      return res.send({ success: true, joined: true, participantsCount });
    }

    // Atomic check: only insert if current count < maxParticipants
    const currentCount = await participantsCollection.countDocuments({
      eventId: id,
    });

    if (currentCount >= maxParticipants) {
      return res.status(409).send({ message: "This event is already full" });
    }

    try {
      await participantsCollection.insertOne({
        eventId: id,
        email: req.user.email,
        joinedAt: new Date(),
      });
    } catch (dupError) {
      // Duplicate key – already joined (race condition)
      if (dupError.code === 11000) {
        const participantsCount = await participantsCollection.countDocuments({
          eventId: id,
        });
        return res.send({ success: true, joined: true, participantsCount });
      }
      throw dupError;
    }

    const participantsCount = await participantsCollection.countDocuments({
      eventId: id,
    });

    res.send({ success: true, joined: true, participantsCount });
  } catch (error) {
    console.error("Join Event Error:", error);
    res.status(500).send({ message: "Server error" });
  }
});

// Leave event - Protected
app.delete("/events/:id/join", verifyToken, async (req, res) => {
  try {
    await connectDB();
    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid event id" });
    }

    const event = await eventsCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!event) {
      return res.status(404).send({ message: "Event not found" });
    }

    await participantsCollection.deleteOne({
      eventId: id,
      email: req.user.email,
    });

    const participantsCount = await participantsCollection.countDocuments({
      eventId: id,
    });

    res.send({ success: true, joined: false, participantsCount });
  } catch (error) {
    console.error("Leave Event Error:", error);
    res.status(500).send({ message: "Server error" });
  }
});

// Get events joined by the user - Protected
app.get("/events/joined/:email", verifyToken, async (req, res) => {
  try {
    await connectDB();
    const email = req.params.email.trim().toLowerCase();

    if (email !== req.user.email) {
      return res.status(403).send({ message: "Forbidden" });
    }

    // find all participant records for this user
    const records = await participantsCollection
      .find({ email: req.user.email })
      .sort({ joinedAt: -1 })
      .toArray();

    if (records.length === 0) {
      return res.send([]);
    }

    const eventIds = records.map((r) => new ObjectId(r.eventId));
    const events = await eventsCollection
      .find({ _id: { $in: eventIds } })
      .toArray();

    const countsMap = await getCountsMap();
    res.send(addCounts(events, countsMap));
  } catch (error) {
    console.error("Joined Events Error:", error);
    res.status(500).send({ message: "Server error" });
  }
});

// Create event - Protected
app.post("/events", verifyToken, async (req, res) => {
  try {
    await connectDB();

    const ALLOWED_MAX_PARTICIPANTS = [3, 10, 25];
    const rawMax = req.body.maxParticipants;
    const maxParticipants = Number(rawMax);

    if (!ALLOWED_MAX_PARTICIPANTS.includes(maxParticipants)) {
      return res.status(400).send({
        message: "maxParticipants must be 3, 10, or 25.",
      });
    }

    const { maxParticipants: _ignored, ...rest } = req.body;
    const newEvent = {
      ...rest,
      maxParticipants,
      organizerEmail: req.user.email,
    };

    const result = await eventsCollection.insertOne(newEvent);

    res.send(result);
  } catch (error) {
    console.error("Create Event Error:", error);
    res.status(500).send({ message: "Server error" });
  }
});

// Update event - Protected
app.patch("/events/:id", verifyToken, async (req, res) => {
  try {
    await connectDB();
    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid event id" });
    }

    const event = await eventsCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!event) {
      return res.status(404).send({ message: "Event not found" });
    }

    if (event.organizerEmail !== req.user.email) {
      return res.status(403).send({ message: "Forbidden" });
    }

    const { title, type, date, location, photoURL, description } = req.body;

    const result = await eventsCollection.updateOne(
      {
        _id: new ObjectId(id),
        organizerEmail: req.user.email,
      },
      {
        $set: { title, type, date, location, photoURL, description },
      },
    );

    res.send(result);
  } catch (error) {
    res.status(500).send({ message: "Server error" });
  }
});

// Delete event - Protected
app.delete("/events/:id", verifyToken, async (req, res) => {
  try {
    await connectDB();
    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid event id" });
    }

    const event = await eventsCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!event) {
      return res.status(404).send({ message: "Event not found" });
    }

    if (event.organizerEmail !== req.user.email) {
      return res.status(403).send({ message: "Forbidden" });
    }

    const result = await eventsCollection.deleteOne({
      _id: new ObjectId(id),
      organizerEmail: req.user.email,
    });

    // remove this event's participants too
    await participantsCollection.deleteMany({ eventId: id });

    res.send(result);
  } catch (error) {
    res.status(500).send({ message: "Server error" });
  }
});

// Update user profile - Protected
app.patch("/users/profile", verifyToken, async (req, res) => {
  try {
    await connectDB();

    const { name, image } = req.body;

    // Server-side validation
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).send({ message: "Name is required." });
    }

    const imageValue = image;
    if (
      !imageValue ||
      typeof imageValue !== "string" ||
      !/^https?:\/\/\S+/.test(imageValue.trim())
    ) {
      return res
        .status(400)
        .send({ message: "Enter a valid image URL (http or https)." });
    }

    const updatedFields = {
      name: name.trim(),
      image: imageValue.trim(),
    };

    const result = await usersCollection.findOneAndUpdate(
      { email: req.user.email },
      { $set: updatedFields },
      { returnDocument: "after" },
    );

    if (!result) {
      return res.status(404).send({ message: "User not found." });
    }

    res.send({ success: true, user: result });
  } catch (error) {
    console.error("Update Profile Error:", error);
    res.status(500).send({ message: "Server error" });
  }
});

// Local Development listen
if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

// Mandatory export for Vercel Serverless Function
export default app;