-- Links each standalone commercial product to the package that carries its
-- standard sellable price, so a client (the Subscription UI) can discover
-- "what do I pass as package_code to subscribe to this" instead of
-- hardcoding the `${product_key}-addon` naming convention migrations
-- 685/687/688/689 happened to use. Mirrors industry_registry's existing
-- default_package_code column (migration 663) for the same reason.
ALTER TABLE commercial_products ADD COLUMN IF NOT EXISTS default_package_code TEXT REFERENCES packages(code);

UPDATE commercial_products SET default_package_code = 'clearos-addon' WHERE product_key = 'clearos';
UPDATE commercial_products SET default_package_code = 'hudufreight-addon' WHERE product_key = 'hudufreight';
UPDATE commercial_products SET default_package_code = 'seal-addon' WHERE product_key = 'seal';
UPDATE commercial_products SET default_package_code = 'cargotracker-addon' WHERE product_key = 'cargotracker';
