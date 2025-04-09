import { MongoClient } from "mongodb";
import { products } from "./productsData.js";

const uri = "mongodb+srv://yemun:yemukela12@cluster0.sudwv.mongodb.net/";
const client = new MongoClient(uri);

async function run() {
  try {
    await client.connect();
    const db = client.db("After_School");
    const collection = db.collection("lessons");

    const result = await collection.insertMany(products);
    console.log(`Inserted ${result.insertedCount} products.`);
  } catch (err) {
    console.error("Error inserting products:", err);
  } finally {
    await client.close();
  }
}

run();
