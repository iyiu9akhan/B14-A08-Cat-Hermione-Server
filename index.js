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

// Dynamic Lazy Connection for Serverless Environments
async function connectDB() {
  if (!db) {
    await client.connect();
    db = client.db("b14-a08-cat-hermione");
    eventsCollection = db.collection("events");
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

// Root route for sanity check
app.get("/", (req, res) => {
  res.send("Hermione Server is running live!");
});

// Get all events - Public
app.get("/events", async (req, res) => {
  try {
    await connectDB();
    const allEvents = await eventsCollection.find({}).toArray();
    res.send(allEvents);
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
      return res.status(403).send({
        message: "Forbidden",
      });
    }

    const myEvents = await eventsCollection
      .find({ organizerEmail: req.user.email })
      .toArray();

    res.send(myEvents);
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

    res.send(result);
  } catch (error) {
    res.status(500).send({ message: "Server error" });
  }
});

// Create event - Protected
app.post("/events", verifyToken, async (req, res) => {
  try {
    await connectDB();
    const newEvent = {
      ...req.body,
      organizerEmail: req.user.email,
    };

    const result = await eventsCollection.insertOne(newEvent);

    res.send(result);

    console.log("New Event:", newEvent);
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
        $set: {
          title,
          type,
          date,
          location,
          photoURL,
          description,
        },
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

    res.send(result);
  } catch (error) {
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