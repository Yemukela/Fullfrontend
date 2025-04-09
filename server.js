import express from "express";
import { MongoClient, ObjectId } from "mongodb";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const port = process.env.PORT || 3000;

// Required for working with __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. Middleware
app.use(express.json());

// Manual CORS Middleware
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization"
  );
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// Log all incoming requests
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// 2. Serve static files (HTML, JS, CSS, images)
app.use(express.static(path.join(__dirname)));

// Serve Act.html for root
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "Act.html"));
});

// 3. MongoDB setup
const uri = process.env.MONGODB_URI || "mongodb+srv://yemun:yemukela12@cluster0.sudwv.mongodb.net/";
const client = new MongoClient(uri);

let lessonsCollection;
let ordersCollection;

async function run() {
  try {
    await client.connect();
    console.log("Connected to MongoDB");

    const database = client.db("After_School");
    lessonsCollection = database.collection("lessons");
    ordersCollection = database.collection("orders");

    // ---- LESSON ROUTES ----

    app.get("/lessons", async (req, res) => {
      try {
        const lessons = await lessonsCollection.find({}).toArray();
        res.json(lessons);
      } catch (error) {
        console.error("Error fetching lessons:", error);
        res.status(500).json({ error: "Failed to fetch lessons" });
      }
    });

    app.put("/lessons/:id", async (req, res) => {
      try {
        const lessonId = req.params.id;
        const updateData = req.body;
        const updateQuery = {};

        if (updateData.$inc) updateQuery.$inc = updateData.$inc;
        if (updateData.$set) updateQuery.$set = updateData.$set;
        if (!updateQuery.$set && !updateQuery.$inc) {
          updateQuery.$set = updateData;
        }

        const result = await lessonsCollection.updateOne(
          { _id: new ObjectId(lessonId) },
          updateQuery
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({ error: "Lesson not found" });
        }
        res.json({ message: "Lesson updated" });
      } catch (error) {
        console.error("Error updating lesson:", error);
        res.status(500).json({ error: "Failed to update lesson" });
      }
    });

    app.get("/search", async (req, res) => {
      const query = (req.query.q || "").trim();

      try {
        if (!query) {
          const lessons = await lessonsCollection.find({}).toArray();
          return res.json(lessons);
        }

        const regex = new RegExp(query, "i");

        const results = await lessonsCollection.find({
          $or: [
            { LessonName: regex },
            { Location: regex },
            {
              $expr: {
                $regexMatch: {
                  input: { $toString: "$Price" },
                  regex: query,
                  options: "i",
                },
              },
            },
            {
              $expr: {
                $regexMatch: {
                  input: { $toString: "$Space" },
                  regex: query,
                  options: "i",
                },
              },
            },
          ],
        }).toArray();

        res.json(results);
      } catch (err) {
        console.error("Search error:", err);
        res.status(500).json({ error: "Search failed." });
      }
    });

    // ---- ORDERS ROUTES ----

    app.get("/orders", async (req, res) => {
      try {
        const orders = await ordersCollection.find({}).toArray();
        res.json(orders);
      } catch (error) {
        console.error("Error fetching orders:", error);
        res.status(500).json({ error: "Failed to fetch orders" });
      }
    });

    app.post("/orders", async (req, res) => {
      try {
        const order = req.body;

        if (
          !order.firstName ||
          !order.lastName ||
          !order.phone ||
          !order.method ||
          !Array.isArray(order.lessons) ||
          order.lessons.length === 0
        ) {
          return res.status(400).json({ error: "Missing required fields." });
        }

        const nameRegex = /^[A-Za-z]+$/;
        const phoneRegex = /^[0-9]{7,15}$/;
        const zipRegex = /^\d{5}$/;

        if (!nameRegex.test(order.firstName.trim())) {
          return res.status(400).json({ error: "Invalid first name." });
        }
        if (!nameRegex.test(order.lastName.trim())) {
          return res.status(400).json({ error: "Invalid last name." });
        }
        if (!phoneRegex.test(order.phone)) {
          return res.status(400).json({ error: "Invalid phone number." });
        }
        if (order.method === "Home Delivery") {
          if (!order.address || order.address.trim().length === 0) {
            return res.status(400).json({ error: "Address is required." });
          }
          if (!zipRegex.test(String(order.zip))) {
            return res.status(400).json({ error: "Invalid ZIP code." });
          }
        }

        for (const item of order.lessons) {
          const lesson = await lessonsCollection.findOne({
            _id: new ObjectId(item.id),
          });
          if (!lesson || lesson.Space < item.quantity) {
            return res.status(400).json({
              error: `Not enough space in ${lesson?.LessonName || "lesson"}.`,
            });
          }

          await lessonsCollection.updateOne(
            { _id: new ObjectId(item.id) },
            { $inc: { Space: -item.quantity } }
          );

          item.lessonId = lesson._id;
          item.lessonName = lesson.LessonName;
          delete item.id;
        }

        const result = await ordersCollection.insertOne(order);
        res.status(201).json({
          message: "Order created",
          orderId: result.insertedId,
        });
      } catch (error) {
        console.error("Order error:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // Start the server
    app.listen(port, () => {
      console.log(`Server is running on port ${port}`);
    });

  } catch (error) {
    console.error("Failed to connect to MongoDB:", error);
  }
}

run().catch(console.dir);
