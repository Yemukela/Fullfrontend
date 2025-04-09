import express from "express";
import { MongoClient, ObjectId } from "mongodb";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const port = process.env.PORT || 3000;

// For __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Middleware Setup ---
// Parse JSON request bodies
app.use(express.json());

// Manual CORS Middleware for cross-origin requests
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// Logger Middleware – logs every request with timestamp, method, and URL
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Serve static files (HTML, CSS, JS, images) from the current directory
app.use(express.static(path.join(__dirname)));

// Main route to serve the entry HTML file
app.get("/", (req, res) => {
  // Change "index.html" to your main file name if needed
  res.sendFile(path.join(__dirname, "index.html"));
});

// --- MongoDB Setup ---
// Replace with your own MongoDB Atlas connection string or set MONGODB_URI in your environment variables.
const uri =
  process.env.MONGODB_URI ||
  "mongodb+srv://yemun:yemukela12@cluster0.sudwv.mongodb.net/After_School?retryWrites=true&w=majority";
const client = new MongoClient(uri);

let lessonsCollection;
let ordersCollection;

async function run() {
  try {
    await client.connect();
    console.log("Connected to MongoDB");

    // Use the "After_School" database
    const db = client.db("After_School");
    lessonsCollection = db.collection("lessons");
    ordersCollection = db.collection("orders");

    // --- Lesson Routes ---
    // GET /lessons - Returns all lessons as a JSON array.
    app.get("/lessons", async (req, res) => {
      try {
        const lessons = await lessonsCollection.find({}).toArray();
        res.json(lessons);
      } catch (error) {
        console.error("Error fetching lessons:", error);
        res.status(500).json({ error: "Failed to fetch lessons" });
      }
    });

    // GET /search?q=... - Performs a full‑text search on lesson fields.
    app.get("/search", async (req, res) => {
      const query = (req.query.q || "").trim();
      try {
        if (!query) {
          const lessons = await lessonsCollection.find({}).toArray();
          return res.json(lessons);
        }
        const regex = new RegExp(query, "i");

        // Adjust field names as per your MongoDB lesson documents
        const results = await lessonsCollection.find({
          $or: [
            { LessonName: regex },
            { Location: regex },
            {
              $expr: {
                $regexMatch: {
                  input: { $toString: "$Price" },
                  regex: query,
                  options: "i"
                }
              }
            },
            {
              $expr: {
                $regexMatch: {
                  input: { $toString: "$Space" },
                  regex: query,
                  options: "i"
                }
              }
            }
          ]
        }).toArray();

        res.json(results);
      } catch (err) {
        console.error("Search error:", err);
        res.status(500).json({ error: "Search failed" });
      }
    });

    // PUT /lessons/:id - Update any attribute in a lesson.
    app.put("/lessons/:id", async (req, res) => {
      try {
        const lessonId = req.params.id;
        const updateData = req.body;

        const updateQuery = {};
        if (updateData.$inc) updateQuery.$inc = updateData.$inc;
        if (updateData.$set) updateQuery.$set = updateData.$set;
        // If no operator provided, use $set by default
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

    // --- Order Routes ---
    // GET /orders - Returns all orders.
    app.get("/orders", async (req, res) => {
      try {
        const orders = await ordersCollection.find({}).toArray();
        res.json(orders);
      } catch (error) {
        console.error("Error fetching orders:", error);
        res.status(500).json({ error: "Failed to fetch orders" });
      }
    });

    // POST /orders - Saves a new order to the orders collection.
    app.post("/orders", async (req, res) => {
      try {
        const order = req.body;

        // Validate required order fields
        if (
          !order.firstName ||
          !order.lastName ||
          !order.phone ||
          !order.method ||
          !order.lessons ||
          !Array.isArray(order.lessons) ||
          order.lessons.length === 0
        ) {
          return res.status(400).json({ error: "Missing required fields." });
        }

        // (Optional) Further backend validations can be added here

        const result = await ordersCollection.insertOne(order);
        res.json({ message: "Order placed", orderId: result.insertedId });
      } catch (error) {
        console.error("Error saving order:", error);
        res.status(500).json({ error: "Failed to save order" });
      }
    });

    // Start the server after successful MongoDB connection.
    app.listen(port, () => {
      console.log(`Server is running on port ${port}`);
    });
  } catch (err) {
    console.error("Failed to connect to MongoDB:", err);
  }
}

run().catch(console.dir);
