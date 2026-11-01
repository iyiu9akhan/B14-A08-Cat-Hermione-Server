import express from "express";
import cors from "cors";
import { MongoClient } from "mongodb";
import "dotenv/config";

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());
app.use(cors());

// console.log(process.env.DB_USER)

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
  }
}
await ConnectToMongoDB();

const connectedClient = await ConnectToMongoDB();
const db = connectedClient.db("b14-a08-cat-hermione");
const eventsCollection = db.collection("events");

app.get("/events", async (req, res) => {
  const cursor = eventsCollection.find({});
  const AllEvents = await cursor.toArray();
  res.send(AllEvents);
});

app.post("/events", async  (req, res) => {
  const newEvent = req.body;
  const result = await eventsCollection.insertOne(newEvent);
  res.send(result);
  console.log("New Event:", newEvent);
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
