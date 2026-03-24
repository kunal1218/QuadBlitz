export interface Listing {
  id: string;
  title: string;
  description: string;
  price: number;
  category: "Textbooks" | "Electronics" | "Furniture" | "Clothing" | "Other";
  condition: "New" | "Like New" | "Good" | "Fair";
  location?: string | null;
  images: string[];
  status: "active" | "sold";
  seller: {
    id: string;
    username: string;
    name: string;
    avatarUrl?: string | null;
    createdAt?: string | null;
  };
  createdAt: string;
}
