
import express from "express";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";
import "dotenv/config";
import { createRemoteJWKSet, jwtVerify } from "jose";

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());
app.use(cors());

const client = new MongoClient(
  `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.joq5z4d.mongodb.net`,
);

export async function ConnectToMongoDB() {
  try {
    await client.connect();
    console.log("Successfully Connected to MongoDB");
    return client;
  } catch (err) {
    console.log(err);
    throw err;
  }
}

const connectedClient = await ConnectToMongoDB();
const db = connectedClient.db("b14-a08-cat-hermione");
const eventsCollection = db.collection("events");

const frontendUrl = (
  process.env.FRONTEND_JWKS_URL || "http://localhost:3000"
).replace(/\/+$/, "");

const jwks = createRemoteJWKSet(
  new URL(`${frontendUrl}/api/auth/jwks`),
);

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

    if (!payload.sub) {
      return res.status(401).send({
        message: "Invalid token payload.",
      });
    }

    req.user = payload;

    next();
  } catch (error) {
    console.error("Token verification failed:", error.code || error.message);

    return res.status(401).send({
      message: "Invalid or expired token.",
    });
  }
};

app.get("/events", async (req, res) => {
  try {
    const allEvents = await eventsCollection.find({}).toArray();
    res.send(allEvents);
  } catch (error) {
    res.status(500).send({ message: "Server error" });
  }
});

app.get("/events/manage/:email", verifyToken, async (req, res) => {
  try {
    const email = req.params.email;

    const myEvents = await eventsCollection
      .find({ organizerEmail: email })
      .toArray();

    res.send(myEvents);
  } catch (error) {
    res.status(500).send({ message: "Server error" });
  }
});

app.get("/events/:id", verifyToken, async (req, res) => {
  try {
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

app.post("/events", verifyToken, async (req, res) => {
  try {
    const newEvent = req.body;

    const result = await eventsCollection.insertOne(newEvent);

    res.send(result);

    console.log("New Event:", newEvent);
  } catch (error) {
    console.error("Create Event Error:", error);
    res.status(500).send({ message: "Server error" });
  }
});

app.patch("/events/:id", verifyToken, async (req, res) => {
  try {
    const id = req.params.id;
    const userEmail = req.headers["x-user-email"];

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid event id" });
    }

    const event = await eventsCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!event) {
      return res.status(404).send({ message: "Event not found" });
    }

    if (!userEmail || event.organizerEmail !== userEmail) {
      return res.status(403).send({ message: "Forbidden" });
    }

    const { title, type, date, location, photoURL, description } = req.body;

    const result = await eventsCollection.updateOne(
      { _id: new ObjectId(id) },
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

app.delete("/events/:id", verifyToken, async (req, res) => {
  try {
    const id = req.params.id;
    const userEmail = req.headers["x-user-email"];

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid event id" });
    }

    const event = await eventsCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!event) {
      return res.status(404).send({ message: "Event not found" });
    }

    if (!userEmail || event.organizerEmail !== userEmail) {
      return res.status(403).send({ message: "Forbidden" });
    }

    const result = await eventsCollection.deleteOne({
      _id: new ObjectId(id),
    });

    res.send(result);
  } catch (error) {
    res.status(500).send({ message: "Server error" });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
