import {
  Settings2,
  Sparkles,
  Truck,
  MapPin,
  Wallet,
  Gauge,
  LockKeyhole,
  Warehouse,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

// Trimmed, Ondi-local copy of the Hudumika Workspace product registry
// (apps/web/workspace/src/lib/products.ts), same shape and dev URLs as
// every other app's local copy (e.g. apps/web/clearos/src/lib/products.ts)
// — just what the topbar apps drawer needs. Ondi itself is excluded since
// you're already in it. Only products with a real running dev app are
// listed; ones still on the roadmap with no app to link to are left out
// rather than linking to a marketing page that doesn't exist in this app.
export type ProductStatus = "live" | "building" | "planned";

export interface DrawerProduct {
  slug: string;
  name: string;
  tag: string;
  color: string;
  Icon: LucideIcon;
  status: ProductStatus;
  href: string;
}

export interface DrawerProductGroup {
  category: string;
  products: DrawerProduct[];
}

export const productGroups: DrawerProductGroup[] = [
  {
    category: "Platform",
    products: [
      {
        slug: "workspace",
        name: "Hudumika Workspace",
        tag: "Workspace Console",
        color: "#64748b",
        Icon: Settings2,
        status: "building",
        href: "http://localhost:3010",
      },
    ],
  },
  {
    category: "People",
    products: [
      {
        slug: "bliss",
        name: "Bliss",
        tag: "Workforce Experience",
        color: "#7c3aed",
        Icon: Sparkles,
        status: "live",
        href: "http://localhost:5174",
      },
    ],
  },
  {
    category: "Trade & Logistics",
    products: [
      {
        slug: "clearos",
        name: "ClearOS",
        tag: "Customs & Trade",
        color: "#ea580c",
        Icon: ShieldCheck,
        status: "live",
        href: "http://localhost:3004",
      },
      {
        slug: "fleetmanager",
        name: "HuduFreight",
        tag: "Logistics & Dispatch",
        color: "#0891b2",
        Icon: Truck,
        status: "building",
        href: "http://localhost:3008",
      },
      {
        slug: "onesite",
        name: "oneSite",
        tag: "Site Operations",
        color: "#db2777",
        Icon: MapPin,
        status: "building",
        href: "http://localhost:3016",
      },
    ],
  },
  {
    category: "Finance & Compliance",
    products: [
      {
        slug: "finance",
        name: "FinOps",
        tag: "Finance Operations",
        color: "#0284c7",
        Icon: Wallet,
        status: "building",
        href: "http://localhost:3012",
      },
      {
        slug: "complyos",
        name: "ComplyOS",
        tag: "Regulatory Compliance",
        color: "#059669",
        Icon: Gauge,
        status: "building",
        href: "http://localhost:3006",
      },
      {
        slug: "ngao",
        name: "Ngao",
        tag: "Data Protection & PDPA",
        color: "#be123c",
        Icon: LockKeyhole,
        status: "live",
        href: "http://localhost:5173",
      },
      {
        slug: "seal",
        name: "SEAL",
        tag: "Bonded Warehouse",
        color: "#be123c",
        Icon: Warehouse,
        status: "building",
        href: "http://localhost:3020",
      },
    ],
  },
];

export const allProducts: DrawerProduct[] = productGroups.flatMap(
  (g) => g.products,
);
