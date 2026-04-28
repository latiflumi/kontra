require("dotenv").config();
const { MongoClient } = require("mongodb");

const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = "stockapp";

/* ---------------------------------------------------------
   1. IMAGE VALIDATOR (Checks if file exists on server)
--------------------------------------------------------- */
async function getValidImages(numriSerik, kodiNgjyres) {
  const base = `${numriSerik}_${kodiNgjyres}`;
  const potentialSuffixes = [
    "front",
    "front_2",
    "front_3",
    "unknown",
    "back",
    "detail",
    "detail_2",
  ];
  const validImages = [];

  const checks = potentialSuffixes.map(async (suffix) => {
    const url = `${process.env.IMAGE_BASE_URL}/${base}_${suffix}.jpg`;
    try {
      const res = await fetch(url, { method: "HEAD" });
      if (res.ok) {
        validImages.push({ url });
      }
    } catch (e) {
      // Fail silently if image server is unreachable
    }
  });

  await Promise.all(checks);
  return validImages;
}

/* ---------------------------------------------------------
   2. STOCK & PRICE FETCHING
--------------------------------------------------------- */
async function fetchStockAndPrice(artikulliId) {
  try {
    const res = await fetch(process.env.API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        APIKey: process.env.API_KEY,
      },
      body: JSON.stringify({
        endpointName: "product/stock",
        parameters: { ProductId: artikulliId },
      }),
    });

    const json = await res.json();
    if (!Array.isArray(json)) return null;
    // Find the organization (ID 39)
    return json.find((item) => item.OrganizataId === 39) || null;
  } catch (e) {
    console.error(`❌ API Fetch error for ${artikulliId}:`, e.message);
    return null;
  }
}

/* ---------------------------------------------------------
   3. TRANSFORM DATA FOR MEDUSA
--------------------------------------------------------- */
function buildMedusaProduct(group, validatedImages) {
  const colorSet = new Set();
  const sizeSet = new Set();

  group.forEach((p) => {
    colorSet.add(p.Ngjyra);
    sizeSet.add(p.Size);
  });

  const first = group[0];
  const handle = `${first.Pershkrimi}-${first.NumriSerik}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");

  return {
    title: first.Pershkrimi,
    handle: handle,
    description: first.PershkrimiShtes || "",
    subtitle: first.PershkrimiBrendit,
    images: validatedImages,
    thumbnail: validatedImages.length > 0 ? validatedImages[0].url : "",
    options: [
      { title: "Color", values: [...colorSet] },
      { title: "Size", values: [...sizeSet] },
    ],
    variants: [],
    metadata: {
      brand: first.PershkrimiBrendit,
      gender: first.Gender,
      category: first.Kategoria,
      style_number: first.NumriSerik,
    },
  };
}

/* ---------------------------------------------------------
   4. MEDUSA API HELPERS
--------------------------------------------------------- */
async function createProduct(product) {
  const res = await fetch(`${process.env.MEDUSA_URL}/admin/products`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.MEDUSA_ADMIN_TOKEN}`,
    },
    body: JSON.stringify(product),
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.message || "Product creation failed");
  return json.product;
}

async function getInventoryItemBySku(sku, retries = 5) {
  for (let i = 0; i < retries; i++) {
    const res = await fetch(
      `${process.env.MEDUSA_URL}/admin/inventory-items?sku=${sku}`,
      {
        headers: { Authorization: `Bearer ${process.env.MEDUSA_ADMIN_TOKEN}` },
      },
    );
    const json = await res.json();
    if (json.inventory_items?.length > 0) return json.inventory_items[0];

    // Medusa background workers take time to create inventory items
    await new Promise((r) => setTimeout(r, 2000));
  }
  return null;
}

async function updateStock(inventoryItemId, quantity) {
  // 1. Ensure location level exists
  await fetch(
    `${process.env.MEDUSA_URL}/admin/inventory-items/${inventoryItemId}/location-levels`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.MEDUSA_ADMIN_TOKEN}`,
      },
      body: JSON.stringify({
        location_id: process.env.MEDUSA_STOCK_LOCATION_ID,
        stocked_quantity: 0,
      }),
    },
  );

  // 2. Update actual stock
  await fetch(
    `${process.env.MEDUSA_URL}/admin/inventory-items/${inventoryItemId}/location-levels/${process.env.MEDUSA_STOCK_LOCATION_ID}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.MEDUSA_ADMIN_TOKEN}`,
      },
      body: JSON.stringify({ stocked_quantity: quantity }),
    },
  );
}

/* ---------------------------------------------------------
   5. MAIN SYNC LOGIC
--------------------------------------------------------- */
async function syncToMedusa() {
  const client = new MongoClient(MONGO_URI);
  try {
    await client.connect();
    const db = client.db(DB_NAME);
    const productsCol = db.collection("products");

    // Fetch the 10 specific serial numbers you requested
    const cursor = productsCol.find({
      NumriSerik: {
        $in: [
          "10345235",
          "15368370",
          "15340976",
          "12291815",
          "22037424",
        ],
      },
    });

    const grouped = {};
    while (await cursor.hasNext()) {
      const p = await cursor.next();
      if (!grouped[p.NumriSerik]) grouped[p.NumriSerik] = [];
      grouped[p.NumriSerik].push(p);
    }

    for (const serialNum of Object.keys(grouped)) {
      const group = grouped[serialNum];

      console.log(`\n📦 Processing Style: ${serialNum}`);

      // Step A: Filter out non-existent images
      const validatedImages = await getValidImages(
        serialNum,
        group[0].KodiNgjyres,
      );
      const medusaProduct = buildMedusaProduct(group, validatedImages);

      // Step B: Build Variants with Price Logic
      for (const item of group) {
        const stockData = await fetchStockAndPrice(item.ArtikulliId);

        // SANITY CHECK:
        // If the API returns 39.99, regPrice becomes 3999.
        // If the API returns 3999 (already cents), regPrice becomes 399900 (WRONG).
        let rawPrice = stockData?.CmimiShitjes || 0;
        let rawSale = stockData?.CmimiMeZbritje || 0;

        // If the price from your API is already > 1000 and has no decimals,
        // it might already be in cents. Adjust accordingly.
        const regPrice = Math.round(rawPrice * 100);
        const salePrice = Math.round(rawSale * 100);

        const finalAmount =
          salePrice > 0 && salePrice < regPrice ? salePrice : regPrice;

        console.log(
          `💰 Price Check for ${item.ArtikulliId}: Raw(${rawPrice}) -> Medusa(${finalAmount})`,
        );
        }
      for (const item of group) {
        const stockData = await fetchStockAndPrice(item.ArtikulliId);

        // Price logic: Medusa needs integers (cents)
        const regPrice = Math.round((stockData?.CmimiShitjes || 0) * 100);
        const salePrice = Math.round((stockData?.CmimiMeZbritje || 0) * 100);

        // If prices match, we only send one. If they differ, the lower one is the active price.
        // In a basic Medusa setup, the first price in the array is the default.
        const finalAmount =
          salePrice > 0 && salePrice < regPrice ? salePrice : regPrice;

        medusaProduct.variants.push({
          title: `${item.Size} / ${item.Ngjyra}`,
          sku: item.ArtikulliId.toString(),
          options: { Color: item.Ngjyra, Size: item.Size },
          prices: [{ currency_code: "eur", amount: finalAmount }],
          metadata: {
            on_sale: salePrice < regPrice && salePrice > 0,
            original_price: regPrice / 100,
          },
        });
      }

      // Step C: Push to Medusa
      try {
        const createdProduct = await createProduct(medusaProduct);
        console.log(`✅ Created Product: ${createdProduct.title}`);

        // Step D: Link Inventory & Update Stock
        for (const variant of createdProduct.variants) {
          const inventoryItem = await getInventoryItemBySku(variant.sku);
          if (inventoryItem) {
            const stockData = await fetchStockAndPrice(Number(variant.sku));
            const quantity = stockData?.Stoku || 0;
            await updateStock(inventoryItem.id, quantity);
            console.log(`   ∟ SKU ${variant.sku}: Stock set to ${quantity}`);
          }
        }
      } catch (err) {
        console.error(`❌ Failed ${serialNum}:`, err.message);
      }
    }
  } finally {
    await client.close();
    console.log("\n🏁 Sync complete.");
  }
}

syncToMedusa();
