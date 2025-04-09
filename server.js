import express from "express";
import { MongoClient, ObjectId } from "mongodb";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const port = process.env.PORT || 3000;

// Required for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// === Middleware ===
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

// Logger
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Serve static files (HTML, CSS, JS, images)
app.use(express.static(path.join(__dirname)));

// Serve main HTML
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "Act.html"));
});

// === MongoDB Setup ===
const uri = process.env.MONGODB_URI || "mongodb+srv://yemun:yemukela12@cluster0.sudwv.mongodb.net/";
const client = new MongoClient(uri);

let lessonsCollection;
let ordersCollection;

async function run() {
  try {
    await client.connect();
    console.log("Connected to MongoDB");

    const db = client.db("After_School");
    lessonsCollection = db.collection("lessons");
    ordersCollection = db.collection("orders");

    // === LESSON ROUTES ===
    app.get("/lessons", async (req, res) => {
      try {
        const lessons = await lessonsCollection.find({}).toArray();
        res.json(lessons);
      } catch (error) {
        console.error("Error fetching lessons:", error);
        res.status(500).json({ error: "Failed to fetch lessons" });
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

    // === ORDER ROUTES ===
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

        // Basic Validation
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

        // Input validation
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
          if (!order.address || !order.zip || !zipRegex.test(String(order.zip))) {
            return res.status(400).json({ error: "Invalid address or ZIP." });
          }
        }

        // Save order
        const result = await ordersCollection.insertOne(order);
        res.json({ message: "Order placed", orderId: result.insertedId });
      } catch (error) {
        console.error("Error saving order:", error);
        res.status(500).json({ error: "Failed to place order" });
      }
    });

    // === Start Server ===
    app.listen(port, () => {
      console.log(`Server running on http://localhost:${port}`);
    });

  } catch (err) {
    console.error("MongoDB connection failed:", err);
  }
}

run();
