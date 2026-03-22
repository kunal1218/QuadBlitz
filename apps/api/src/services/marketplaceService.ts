import { db } from "../db";
import { ensureUsersTable } from "./authService";

export type ListingCategory =
  | "Textbooks"
  | "Electronics"
  | "Furniture"
  | "Clothing"
  | "Other";
export type ListingCondition = "New" | "Like New" | "Good" | "Fair";
export type ListingStatus = "active" | "sold" | "deleted";
const MAX_LISTING_IMAGES = 5;

export type Listing = {
  id: string;
  title: string;
  description: string;
  location?: string | null;
  price: number;
  category: ListingCategory;
  condition: ListingCondition;
  images: string[];
  status: ListingStatus;
  createdAt: string;
  updatedAt: string;
  seller: {
    id: string;
    username: string;
    name: string;
    avatarUrl?: string | null;
    createdAt?: string | null;
  };
};

export class MarketplaceError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const VALID_CATEGORIES: ListingCategory[] = [
  "Textbooks",
  "Electronics",
  "Furniture",
  "Clothing",
  "Other",
];

const VALID_CONDITIONS: ListingCondition[] = [
  "New",
  "Like New",
  "Good",
  "Fair",
];

const VALID_STATUSES: ListingStatus[] = ["active", "sold"];


const toIsoString = (value: string | Date) =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

let listingsReady: Promise<void> | null = null;

export const ensureListingsTable = async () => {
  if (listingsReady) {
    return listingsReady;
  }

  listingsReady = (async () => {
    await ensureUsersTable();

    await db.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`);

    await db.query(`
      CREATE TABLE IF NOT EXISTS listings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(200) NOT NULL,
        description TEXT NOT NULL,
        location TEXT,
        price DECIMAL(10, 2) NOT NULL CHECK (price >= 0),
        category VARCHAR(50) NOT NULL CHECK (category IN ('Textbooks', 'Electronics', 'Furniture', 'Clothing', 'Other')),
        condition VARCHAR(50) NOT NULL CHECK (condition IN ('New', 'Like New', 'Good', 'Fair')),
        images TEXT[] DEFAULT '{}',
        status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'sold', 'deleted')),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    await db.query(`
      ALTER TABLE listings
      ADD COLUMN IF NOT EXISTS location TEXT;
    `);

    await db.query(`
      ALTER TABLE listings
      ADD COLUMN IF NOT EXISTS images TEXT[] DEFAULT '{}';
    `);

    await db.query(
      "CREATE INDEX IF NOT EXISTS idx_listings_user_id ON listings(user_id);"
    );
    await db.query(
      "CREATE INDEX IF NOT EXISTS idx_listings_category ON listings(category);"
    );
    await db.query(
      "CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status);"
    );
    await db.query(
      "CREATE INDEX IF NOT EXISTS idx_listings_created_at ON listings(created_at DESC);"
    );
  })();

  return listingsReady;
};

const normalizeCategory = (value?: string | null): ListingCategory | null => {
  if (!value) return null;
  const trimmed = value.trim();
  return VALID_CATEGORIES.includes(trimmed as ListingCategory)
    ? (trimmed as ListingCategory)
    : null;
};

const normalizeCondition = (value?: string | null): ListingCondition | null => {
  if (!value) return null;
  const trimmed = value.trim();
  return VALID_CONDITIONS.includes(trimmed as ListingCondition)
    ? (trimmed as ListingCondition)
    : null;
};

const normalizeStatus = (value?: string | null): ListingStatus | null => {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  return VALID_STATUSES.includes(trimmed as ListingStatus)
    ? (trimmed as ListingStatus)
    : null;
};

const mapListing = (row: {
  id: string;
  user_id: string;
  title: string;
  description: string;
  location?: string | null;
  price: string | number;
  category: ListingCategory;
  condition: ListingCondition;
  images: string[] | null;
  status: ListingStatus;
  created_at: string | Date;
  updated_at: string | Date;
  seller_name: string;
  seller_handle: string;
  seller_avatar_url?: string | null;
  seller_created_at?: string | Date | null;
}): Listing => ({
  id: row.id,
  title: row.title,
  description: row.description,
  location: row.location ?? null,
  price: Number(row.price),
  category: row.category,
  condition: row.condition,
  images: row.images ?? [],
  status: row.status,
  createdAt: toIsoString(row.created_at),
  updatedAt: toIsoString(row.updated_at),
  seller: {
    id: row.user_id,
    username: row.seller_handle,
    name: row.seller_name,
    avatarUrl: row.seller_avatar_url ?? null,
    createdAt: row.seller_created_at ? toIsoString(row.seller_created_at) : null,
  },
});

export const listListings = async (params: {
  category?: string | null;
  search?: string | null;
  limit?: number;
  offset?: number;
}): Promise<Listing[]> => {
  await ensureListingsTable();

  const normalizedCategory = normalizeCategory(params.category ?? "");
  if (params.category && !normalizedCategory) {
    throw new MarketplaceError("Invalid category", 400);
  }

  const limit =
    params.limit && Number.isFinite(params.limit)
      ? Math.min(Math.max(params.limit, 1), 50)
      : 20;
  const offset =
    params.offset && Number.isFinite(params.offset) && params.offset > 0
      ? params.offset
      : 0;

  const conditions: string[] = ["l.status = 'active'"];
  const values: Array<string | number> = [];

  if (normalizedCategory) {
    values.push(normalizedCategory);
    conditions.push(`l.category = $${values.length}`);
  }

  if (params.search && params.search.trim()) {
    values.push(`%${params.search.trim()}%`);
    const searchParam = `$${values.length}`;
    conditions.push(`(l.title ILIKE ${searchParam} OR l.description ILIKE ${searchParam})`);
  }

  values.push(limit);
  const limitParam = `$${values.length}`;
  values.push(offset);
  const offsetParam = `$${values.length}`;

  const result = await db.query(
    `SELECT l.*, u.name AS seller_name, u.handle AS seller_handle, u.profile_picture_url AS seller_avatar_url, u.created_at AS seller_created_at
     FROM listings l
     JOIN users u ON u.id = l.user_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY l.created_at DESC
     LIMIT ${limitParam} OFFSET ${offsetParam}`,
    values
  );

  return result.rows.map((row) =>
    mapListing(row as Parameters<typeof mapListing>[0])
  );
};

export const getUserListings = async (userId: string): Promise<Listing[]> => {
  await ensureListingsTable();

  if (!userId) {
    throw new MarketplaceError("User id is required", 400);
  }

  const result = await db.query(
    `SELECT l.*, u.name AS seller_name, u.handle AS seller_handle, u.profile_picture_url AS seller_avatar_url, u.created_at AS seller_created_at
     FROM listings l
     JOIN users u ON u.id = l.user_id
     WHERE l.user_id = $1 AND l.status != 'deleted'
     ORDER BY l.created_at DESC`,
    [userId]
  );

  return result.rows.map((row) =>
    mapListing(row as Parameters<typeof mapListing>[0])
  );
};

export const getListingById = async (id: string): Promise<Listing> => {
  await ensureListingsTable();

  const result = await db.query(
    `SELECT l.*, u.name AS seller_name, u.handle AS seller_handle, u.profile_picture_url AS seller_avatar_url, u.created_at AS seller_created_at
     FROM listings l
     JOIN users u ON u.id = l.user_id
     WHERE l.id = $1 AND l.status != 'deleted'
     LIMIT 1`,
    [id]
  );

  if ((result.rowCount ?? 0) === 0) {
    throw new MarketplaceError("Listing not found", 404);
  }

  return mapListing(result.rows[0] as Parameters<typeof mapListing>[0]);
};

export const createListing = async (params: {
  userId: string;
  title: string;
  description: string;
  price: number;
  category: string;
  condition: string;
  location?: string | null;
  images?: string[] | null;
}): Promise<Listing> => {
  await ensureListingsTable();

  const title = params.title?.trim() ?? "";
  if (!title) {
    throw new MarketplaceError("Title is required", 400);
  }
  if (title.length > 200) {
    throw new MarketplaceError("Title must be 200 characters or less", 400);
  }

  const description = params.description?.trim() ?? "";
  if (!description) {
    throw new MarketplaceError("Description is required", 400);
  }
  if (description.length > 2000) {
    throw new MarketplaceError("Description must be 2000 characters or less", 400);
  }

  const price = Number(params.price);
  if (!Number.isFinite(price) || price < 0) {
    throw new MarketplaceError("Price must be a non-negative number", 400);
  }

  const category = normalizeCategory(params.category);
  if (!category) {
    throw new MarketplaceError("Invalid category", 400);
  }

  const condition = normalizeCondition(params.condition);
  if (!condition) {
    throw new MarketplaceError("Invalid condition", 400);
  }

  const location =
    params.location != null ? params.location.trim() || null : null;

  const images = Array.isArray(params.images) ? params.images : [];
  if (images.length > MAX_LISTING_IMAGES) {
    throw new MarketplaceError(`Max ${MAX_LISTING_IMAGES} images allowed`, 400);
  }

  const result = await db.query(
    `INSERT INTO listings (user_id, title, description, location, price, category, condition, images, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active')
     RETURNING *`,
    [params.userId, title, description, location, price, category, condition, images]
  );

  const row = result.rows[0] as {
    id: string;
    user_id: string;
    title: string;
    description: string;
    location?: string | null;
    price: string | number;
    category: ListingCategory;
    condition: ListingCondition;
    images: string[] | null;
    status: ListingStatus;
    created_at: string | Date;
    updated_at: string | Date;
  };

  const sellerResult = await db.query(
    "SELECT name, handle, profile_picture_url, created_at FROM users WHERE id = $1",
    [params.userId]
  );
  const sellerRow = sellerResult.rows[0] as
    | {
        name: string;
        handle: string;
        profile_picture_url?: string | null;
        created_at?: string | Date | null;
      }
    | undefined;

  return mapListing({
    ...row,
    seller_name: sellerRow?.name ?? "",
    seller_handle: sellerRow?.handle ?? "",
    seller_avatar_url: sellerRow?.profile_picture_url ?? null,
    seller_created_at: sellerRow?.created_at ?? null,
  });
};

export const updateListing = async (params: {
  id: string;
  userId: string;
  title?: string;
  description?: string;
  price?: number;
  category?: string;
  condition?: string;
  location?: string | null;
  images?: string[] | null;
}): Promise<Listing> => {
  await ensureListingsTable();

  const existingResult = await db.query(
    "SELECT * FROM listings WHERE id = $1 AND status != 'deleted' LIMIT 1",
    [params.id]
  );

  if ((existingResult.rowCount ?? 0) === 0) {
    throw new MarketplaceError("Listing not found", 404);
  }

  const existing = existingResult.rows[0] as {
    id: string;
    user_id: string;
    title: string;
    description: string;
    location?: string | null;
    price: string | number;
    category: ListingCategory;
    condition: ListingCondition;
    images: string[] | null;
    status: ListingStatus;
  };

  if (existing.user_id !== params.userId) {
    throw new MarketplaceError("Not authorized to update this listing", 403);
  }

  const title = params.title != null ? params.title.trim() : existing.title;
  if (!title) {
    throw new MarketplaceError("Title is required", 400);
  }
  if (title.length > 200) {
    throw new MarketplaceError("Title must be 200 characters or less", 400);
  }

  const description =
    params.description != null ? params.description.trim() : existing.description;
  if (!description) {
    throw new MarketplaceError("Description is required", 400);
  }
  if (description.length > 2000) {
    throw new MarketplaceError("Description must be 2000 characters or less", 400);
  }

  const price =
    params.price != null ? Number(params.price) : Number(existing.price);
  if (!Number.isFinite(price) || price < 0) {
    throw new MarketplaceError("Price must be a non-negative number", 400);
  }

  const category =
    params.category != null
      ? normalizeCategory(params.category)
      : existing.category;
  if (!category) {
    throw new MarketplaceError("Invalid category", 400);
  }

  const condition =
    params.condition != null
      ? normalizeCondition(params.condition)
      : existing.condition;
  if (!condition) {
    throw new MarketplaceError("Invalid condition", 400);
  }

  const location =
    params.location != null
      ? params.location.trim() || null
      : existing.location ?? null;

  const images = Array.isArray(params.images) ? params.images : existing.images ?? [];
  if (images.length > MAX_LISTING_IMAGES) {
    throw new MarketplaceError(`Max ${MAX_LISTING_IMAGES} images allowed`, 400);
  }

  const result = await db.query(
    `UPDATE listings
     SET title = $1,
         description = $2,
         location = $3,
         price = $4,
         category = $5,
         condition = $6,
         images = $7,
         updated_at = NOW()
     WHERE id = $8
     RETURNING *`,
    [title, description, location, price, category, condition, images, params.id]
  );

  const sellerResult = await db.query(
    "SELECT name, handle, profile_picture_url, created_at FROM users WHERE id = $1",
    [params.userId]
  );
  const sellerRow = sellerResult.rows[0] as
    | {
        name: string;
        handle: string;
        profile_picture_url?: string | null;
        created_at?: string | Date | null;
      }
    | undefined;

  return mapListing({
    ...(result.rows[0] as Parameters<typeof mapListing>[0]),
    seller_name: sellerRow?.name ?? "",
    seller_handle: sellerRow?.handle ?? "",
    seller_avatar_url: sellerRow?.profile_picture_url ?? null,
    seller_created_at: sellerRow?.created_at ?? null,
  });
};

export const deleteListing = async (params: {
  id: string;
  userId: string;
  isAdmin?: boolean;
}) => {
  await ensureListingsTable();

  const existingResult = await db.query(
    "SELECT user_id FROM listings WHERE id = $1 LIMIT 1",
    [params.id]
  );

  if ((existingResult.rowCount ?? 0) === 0) {
    throw new MarketplaceError("Listing not found", 404);
  }

  const existing = existingResult.rows[0] as { user_id: string };
  if (existing.user_id !== params.userId && !params.isAdmin) {
    throw new MarketplaceError("Not authorized to delete this listing", 403);
  }

  await db.query("DELETE FROM listings WHERE id = $1", [params.id]);

  return { status: "deleted" };
};

export const updateListingStatus = async (params: {
  id: string;
  userId: string;
  status: string;
}): Promise<Listing> => {
  await ensureListingsTable();

  const status = normalizeStatus(params.status);
  if (!status) {
    throw new MarketplaceError("Invalid status", 400);
  }

  const existingResult = await db.query(
    "SELECT * FROM listings WHERE id = $1 AND status != 'deleted' LIMIT 1",
    [params.id]
  );

  if ((existingResult.rowCount ?? 0) === 0) {
    throw new MarketplaceError("Listing not found", 404);
  }

  const existing = existingResult.rows[0] as {
    id: string;
    user_id: string;
    title: string;
    description: string;
    location?: string | null;
    price: string | number;
    category: ListingCategory;
    condition: ListingCondition;
    images: string[] | null;
    status: ListingStatus;
  };

  if (existing.user_id !== params.userId) {
    throw new MarketplaceError("Not authorized to update this listing", 403);
  }

  const result = await db.query(
    `UPDATE listings
     SET status = $1,
         updated_at = NOW()
     WHERE id = $2
     RETURNING *`,
    [status, params.id]
  );

  const sellerResult = await db.query(
    "SELECT name, handle, profile_picture_url, created_at FROM users WHERE id = $1",
    [params.userId]
  );
  const sellerRow = sellerResult.rows[0] as
    | {
        name: string;
        handle: string;
        profile_picture_url?: string | null;
        created_at?: string | Date | null;
      }
    | undefined;

  return mapListing({
    ...(result.rows[0] as Parameters<typeof mapListing>[0]),
    seller_name: sellerRow?.name ?? "",
    seller_handle: sellerRow?.handle ?? "",
    seller_avatar_url: sellerRow?.profile_picture_url ?? null,
    seller_created_at: sellerRow?.created_at ?? null,
  });
};

export const uploadListingImages = async (params: {
  id: string;
  userId: string;
  imageUrls: string[];
}): Promise<Listing> => {
  await ensureListingsTable();

  const existingResult = await db.query(
    "SELECT * FROM listings WHERE id = $1 AND status != 'deleted' LIMIT 1",
    [params.id]
  );

  if ((existingResult.rowCount ?? 0) === 0) {
    throw new MarketplaceError("Listing not found", 404);
  }

  const existing = existingResult.rows[0] as {
    id: string;
    user_id: string;
    title: string;
    description: string;
    location?: string | null;
    price: string | number;
    category: ListingCategory;
    condition: ListingCondition;
    images: string[] | null;
    status: ListingStatus;
    created_at: string | Date;
    updated_at: string | Date;
  };

  if (existing.user_id !== params.userId) {
    throw new MarketplaceError("Not authorized to update this listing", 403);
  }

  const images = Array.isArray(existing.images) ? existing.images : [];
  const additions = params.imageUrls.filter(Boolean);
  if (!additions.length) {
    throw new MarketplaceError("No images provided", 400);
  }

  const nextImages = [...images, ...additions];
  if (nextImages.length > MAX_LISTING_IMAGES) {
    throw new MarketplaceError(`Max ${MAX_LISTING_IMAGES} images allowed`, 400);
  }

  const result = await db.query(
    `UPDATE listings
     SET images = $1,
         updated_at = NOW()
     WHERE id = $2
     RETURNING *`,
    [nextImages, params.id]
  );

  const sellerResult = await db.query(
    "SELECT name, handle, profile_picture_url, created_at FROM users WHERE id = $1",
    [params.userId]
  );
  const sellerRow = sellerResult.rows[0] as
    | {
        name: string;
        handle: string;
        profile_picture_url?: string | null;
        created_at?: string | Date | null;
      }
    | undefined;

  return mapListing({
    ...(result.rows[0] as Parameters<typeof mapListing>[0]),
    seller_name: sellerRow?.name ?? "",
    seller_handle: sellerRow?.handle ?? "",
    seller_avatar_url: sellerRow?.profile_picture_url ?? null,
    seller_created_at: sellerRow?.created_at ?? null,
  });
};

export const deleteListingImage = async (params: {
  id: string;
  userId: string;
  imageUrl: string;
}): Promise<Listing> => {
  await ensureListingsTable();

  const existingResult = await db.query(
    "SELECT * FROM listings WHERE id = $1 AND status != 'deleted' LIMIT 1",
    [params.id]
  );

  if ((existingResult.rowCount ?? 0) === 0) {
    throw new MarketplaceError("Listing not found", 404);
  }

  const existing = existingResult.rows[0] as {
    id: string;
    user_id: string;
    title: string;
    description: string;
    location?: string | null;
    price: string | number;
    category: ListingCategory;
    condition: ListingCondition;
    images: string[] | null;
    status: ListingStatus;
    created_at: string | Date;
    updated_at: string | Date;
  };

  if (existing.user_id !== params.userId) {
    throw new MarketplaceError("Not authorized to update this listing", 403);
  }

  const imageUrl = params.imageUrl?.trim();
  if (!imageUrl) {
    throw new MarketplaceError("Image URL is required", 400);
  }

  const images = Array.isArray(existing.images) ? existing.images : [];
  const nextImages = images.filter((image) => image !== imageUrl);

  if (nextImages.length === images.length) {
    throw new MarketplaceError("Image not found", 404);
  }

  const result = await db.query(
    `UPDATE listings
     SET images = $1,
         updated_at = NOW()
     WHERE id = $2
     RETURNING *`,
    [nextImages, params.id]
  );

  const sellerResult = await db.query(
    "SELECT name, handle, profile_picture_url, created_at FROM users WHERE id = $1",
    [params.userId]
  );
  const sellerRow = sellerResult.rows[0] as
    | {
        name: string;
        handle: string;
        profile_picture_url?: string | null;
        created_at?: string | Date | null;
      }
    | undefined;

  return mapListing({
    ...(result.rows[0] as Parameters<typeof mapListing>[0]),
    seller_name: sellerRow?.name ?? "",
    seller_handle: sellerRow?.handle ?? "",
    seller_avatar_url: sellerRow?.profile_picture_url ?? null,
    seller_created_at: sellerRow?.created_at ?? null,
  });
};
