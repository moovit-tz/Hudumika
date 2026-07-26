-- 121_seal_fulfillment_centre.sql
-- Fulfillment Centre — the third and final warehouse type per the
-- platform's own stated phasing ("bonded warehouse approach first, then
-- sorting centres and fulfillment centres"). A fulfillment centre's core
-- operational loop — pick/pack/dispatch against a customer order — is
-- already exactly what Increment 11b built (seal_fulfillment_orders/
-- lines), including multi-line orders (the backend already accepted an
-- array of lines; only the frontend's single-line creation form needed
-- extending). The one genuinely new domain concept a fulfillment centre
-- needs that bonded/sorting warehouses don't: customer returns — stock
-- coming back INTO the warehouse, the mirror image of a pick/release.
ALTER TABLE seal_compartments DROP CONSTRAINT seal_compartments_warehouse_type_check;
ALTER TABLE seal_compartments ADD CONSTRAINT seal_compartments_warehouse_type_check
  CHECK (warehouse_type IN (
    'public_bonded','private_bonded','cfs','icd','virtual_icd','free_zone','duty_free_retail','excise',
    'sorting_centre','fulfillment_centre'
  ));

ALTER TABLE seal_movements DROP CONSTRAINT seal_movements_movement_type_check;
ALTER TABLE seal_movements ADD CONSTRAINT seal_movements_movement_type_check
  CHECK (movement_type IN ('receipt','putaway','pick','transfer','adjust','release','destroy','status_change','return'));
