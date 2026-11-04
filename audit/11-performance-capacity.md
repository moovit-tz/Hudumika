# Performance and capacity

NOT VERIFIED for production. No stress, soak, spike, saturation or chaos tests ran on shared services. Prior docs/audits performance results are historical and were not promoted into current evidence.

Browser API logs include individual slow initial requests; these are local developer machine observations with full shared auth/branding/analytics initialization, not a valid p95 baseline or capacity result. No p50/p95/p99, throughput, leak-free claim or SLO is fabricated.

Required: isolated representative data/environment, defined expected tenant and shipment concurrency, query plans/index review, grouped list pagination correctness, bounded exports/AI batches, connection/resource metrics and recovery after overload. Business owners must define latency/availability objectives before gates can pass.
