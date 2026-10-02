-- Extend products table with retail/POS/physical-goods fields.
-- All columns are nullable so existing service records are unaffected.
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS image_urls          JSONB,           -- ordered array of image URL strings; first = cover
  ADD COLUMN IF NOT EXISTS compare_at_price    NUMERIC(14,2),   -- struck-through "was" price for sale display
  ADD COLUMN IF NOT EXISTS brand               VARCHAR(100),
  ADD COLUMN IF NOT EXISTS vendor_name         VARCHAR(200),    -- supplier / vendor name
  ADD COLUMN IF NOT EXISTS stock_quantity      INT,             -- current on-hand (NULL = not tracking)
  ADD COLUMN IF NOT EXISTS low_stock_threshold INT  DEFAULT 5,  -- alert when quantity falls to or below this
  ADD COLUMN IF NOT EXISTS track_inventory     BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS weight_kg           NUMERIC(10,3),
  ADD COLUMN IF NOT EXISTS dimensions_cm       JSONB,           -- {length, width, height}
  ADD COLUMN IF NOT EXISTS shipping_class      VARCHAR(50),     -- standard | express | freight
  ADD COLUMN IF NOT EXISTS variants            JSONB,           -- [{name:"Color",values:["Black","White"]},…]
  ADD COLUMN IF NOT EXISTS meta_title          VARCHAR(300),
  ADD COLUMN IF NOT EXISTS meta_description    TEXT,
  ADD COLUMN IF NOT EXISTS url_handle          VARCHAR(300),    -- SEO-friendly slug
  ADD COLUMN IF NOT EXISTS visibility          VARCHAR(20) DEFAULT 'published',  -- published | draft | scheduled
  ADD COLUMN IF NOT EXISTS channels            JSONB,           -- ["online_store","pos","marketplace"]
  ADD COLUMN IF NOT EXISTS notes               TEXT;            -- internal notes (was missing from original table)

CREATE INDEX IF NOT EXISTS idx_products_brand   ON products(tenant_id, brand)   WHERE brand   IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_vendor  ON products(tenant_id, vendor_name) WHERE vendor_name IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_handle ON products(tenant_id, url_handle) WHERE url_handle IS NOT NULL;

-- Product categories — hierarchical, per-tenant
CREATE TABLE IF NOT EXISTS product_categories (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id),
  name         VARCHAR(200) NOT NULL,
  slug         VARCHAR(200),
  parent_id    UUID REFERENCES product_categories(id),  -- NULL = top-level
  image_url    TEXT,
  description  TEXT,
  is_featured  BOOLEAN DEFAULT false,
  status       VARCHAR(20) DEFAULT 'active',   -- active | inactive | draft
  sort_order   INT DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pcat_tenant        ON product_categories(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pcat_parent        ON product_categories(tenant_id, parent_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pcat_slug   ON product_categories(tenant_id, slug) WHERE slug IS NOT NULL;

ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_categories FORCE ROW LEVEL SECURITY;
CREATE POLICY pcat_tenant_isolation ON product_categories
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- Product reviews — customer-written, staff-moderated
CREATE TABLE IF NOT EXISTS product_reviews (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  product_id    VARCHAR(64) NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  customer_id   UUID REFERENCES customers(id),
  customer_name VARCHAR(200) NOT NULL,
  rating        SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title         VARCHAR(300),
  body          TEXT,
  status        VARCHAR(20) DEFAULT 'pending',  -- pending | approved | rejected
  reply         TEXT,                            -- staff reply
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prev_tenant   ON product_reviews(tenant_id);
CREATE INDEX IF NOT EXISTS idx_prev_product  ON product_reviews(tenant_id, product_id);
CREATE INDEX IF NOT EXISTS idx_prev_status   ON product_reviews(tenant_id, status);

ALTER TABLE product_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_reviews FORCE ROW LEVEL SECURITY;
CREATE POLICY prev_tenant_isolation ON product_reviews
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
