require("dotenv").config();
const { configLoader } = require("@medusajs/framework");
const { MongoClient } = require("mongodb");

const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = "stockapp";

/* -------------------------
   Fetch stock per product
------------------------- */
async function fetchStock(ArtikulliId) {
  const res = await fetch(process.env.API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      APIKey: process.env.API_KEY
    },
    body: JSON.stringify({
      endpointName: "product/stock",
      parameters: { ProductId: ArtikulliId }
    })
  });

  const json = await res.json();
  return json?.find(item => item.OrganizataId === 39) || null;
}

/* -------------------------------
  Build image url links
---------------------------------- */

function buildImages(group) {
  const imageSet = new Set();

  group.forEach(p => {
    if (!p.KodiNgjyres || !p.NumriSerik) return;

    const base = `${p.NumriSerik}_${p.KodiNgjyres}`;

    // Add as many as you actually have
    imageSet.add(`${base}_front.jpg`);
    imageSet.add(`${base}_front_2.jpg`);
    imageSet.add(`${base}_front_3.jpg`);
    imageSet.add(`${base}_unknown.jpg`);
    imageSet.add(`${base}_back.jpg`);
    imageSet.add(`${base}_detail.jpg`);
    imageSet.add(`${base}_detail_2.jpg`);
  });

  return [...imageSet].map(img => ({
    url: `${process.env.IMAGE_BASE_URL}/${img}`
  }));
}

/* -------------------------
   Transform grouped product
------------------------- */
function buildMedusaProduct(group) {
  const colorSet = new Set();
  const sizeSet = new Set();

  group.forEach(p => {
    colorSet.add(p.Ngjyra);
    sizeSet.add(p.Size);
  });

  return {
    images: buildImages(group),
    thumbnail: `${process.env.IMAGE_BASE_URL}/${group[0].NumriSerik}_${group[0].KodiNgjyres}_front_2.jpg`,
    title: group[0].Pershkrimi,
    handle: `${group[0].Pershkrimi}-${group[0].ArtikulliId}`
      .toLowerCase()
      .replace(/\s+/g, "-"),
    description: group[0].PershkrimiShtes,
    options: [
      { title: "Color", values: [...colorSet] },
      { title: "Size", values: [...sizeSet] }
    ],
    variants: [],
    metadata: {
      brand: group[0].PershkrimiBrendit,
      gender: group[0].Gender,
      category: group[0].Kategoria
    }
  };
}

/* -------------------------
   Create product
------------------------- */
async function createProduct(product) {
  console.log("\n🚀 Creating product in Medusa:");

  const res = await fetch(`${process.env.MEDUSA_URL}/admin/products`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.MEDUSA_ADMIN_TOKEN}`
    },
    body: JSON.stringify(product)
  });

  const text = await res.text();

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    console.error("❌ Invalid JSON:", text);
    throw new Error("Create product failed");
  }

  if (!res.ok) {
    console.error("❌ Medusa error:", json);
    throw new Error("Create product failed");
  }

  return json.product;
}

/* -------------------------
   Get inventory item by SKU 🔥
------------------------- */
async function getInventoryItemBySku(sku) {
  const res = await fetch(
    `${process.env.MEDUSA_URL}/admin/inventory-items?sku=${sku}`,
    {
      headers: {
        Authorization: `Bearer ${process.env.MEDUSA_ADMIN_TOKEN}`
      }
    }
  );

  const json = await res.json();

  if (!json.inventory_items || json.inventory_items.length === 0) {
    console.error(`❌ No inventory item for SKU ${sku}`);
    return null;
  }

  return json.inventory_items[0];
}
/* -------------------------
  Create Location for new product
----------------------------*/

async function createLocationLevel(inventoryItemId) {
  try {
    const res = await fetch(
      `${process.env.MEDUSA_URL}/admin/inventory-items/${inventoryItemId}/location-levels`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.MEDUSA_ADMIN_TOKEN}`
        },
        body: JSON.stringify({
          location_id: process.env.MEDUSA_STOCK_LOCATION_ID,
          stocked_quantity: 0
        })
      }
    );

    const text = await res.text();

    if (!res.ok) {
      console.error(`❌ Failed to create location level:`, text);
      return false;
    }

    console.log(`✅ Location level created for ${inventoryItemId}`);
    return true;

  } catch (err) {
    console.error("🔥 createLocationLevel error:", err.message);
    return false;
  }
}


/* -------------------------
   Set stock
------------------------- */
async function setStock(inventoryItemId, stock) {
  try {
    const res = await fetch(
      `${process.env.MEDUSA_URL}/admin/inventory-items/${inventoryItemId}/location-levels/${process.env.MEDUSA_STOCK_LOCATION_ID}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.MEDUSA_ADMIN_TOKEN}`
        },
            body: JSON.stringify({

      "stocked_quantity": stock,
    })
      }
    );

    const text = await res.text();

    if (!res.ok) {
      console.error(`❌ Stock update failed:`, text);
    } else {
      console.log(`✅ Stock set: ${inventoryItemId} -> ${stock}`);
    }

  } catch (err) {
    console.error("🔥 setStock error:", err.message);
  }
}


/* -------------------------
   MAIN SYNC
------------------------- */
async function syncToMedusa() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();

  const db = client.db(DB_NAME);
  const productsCol = db.collection("products");

  const cursor = productsCol.find({ NumriSerik: "22036737" });

  const grouped = {};

  console.log("Grouping products...");

  while (await cursor.hasNext()) {
    const p = await cursor.next();
    const key = p.Pershkrimi;

    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(p);
  }

  console.log(`Grouped into ${Object.keys(grouped).length} products`);

  for (const key of Object.keys(grouped)) {
    const group = grouped[key];
    const medusaProduct = buildMedusaProduct(group);

    // build variants
    for (const variant of group) {
      medusaProduct.variants.push({
        title: `${variant.Size} / ${variant.Ngjyra}`,
        sku: variant.ArtikulliId.toString(),
        options: {
          Color: variant.Ngjyra,
          Size: variant.Size
        },
        metadata: {
          color_code: variant.KodiNgjyres,
          style_number: variant.NumriSerik
        },
        prices: [
          {
            currency_code: "eur",
            amount: 0
          }
        ]
      });
    }

    try {
      const created = await createProduct(medusaProduct);
      console.log("✅ Created:", created.title);

      // 🔥 IMPORTANT PART
for (const variant of created.variants) {
  const sku = variant.sku;

  const stockData = await fetchStock(Number(sku));
  const stock = stockData?.Stoku || 0;

  const inventoryItem = await getInventoryItemBySku(sku);
  if (!inventoryItem) continue;

  // 🔥 CHECK if location exists
  if (!inventoryItem.location_levels || inventoryItem.location_levels.length === 0) {
    console.log(`⚠️ Creating location level for ${sku}`);

    const created = await createLocationLevel(inventoryItem.id);
    if (!created) continue;
  }

  // ✅ NOW update stock
  await setStock(inventoryItem.id, stock);
}
    } catch (err) {
      console.error("❌ Failed:", medusaProduct.title, err.message);
    }
  }

  await client.close();
}

syncToMedusa();