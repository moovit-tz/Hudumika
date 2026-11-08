-- Follow-up to 709: GET /v1/entitlements (entitlements.routes.ts) resolves
-- every BASE_FEATURES/AppId key — now including the new 'pos' AppId added
-- for the standalone frontend route — via additionalProductGrant(tenantId,
-- key), which checks package_features.feature_key = key literally. 709
-- only granted the real backend dependency-chain keys (finance.core/
-- finance.inventory/finance.pos), which satisfy pos.routes.ts's own
-- middleware but not this generic appId-keyed lookup — without this, a
-- tenant who subscribed to POS standalone would pass every real API call
-- yet RequireAppEnabled would still show "Not included in your plan" for
-- the /pos route itself (same class of gap the file's own comments
-- describe already having bitten HuduFreight/SEAL/ClearOS/CargoTracker
-- once each).
INSERT INTO package_features (package_code, feature_key) VALUES ('pos-addon', 'pos')
ON CONFLICT DO NOTHING;
