# ClearOS local performance measurements

Final audit run; Fastify injection against the local database. These are five sequential samples and ten concurrent samples, not a production p95 benchmark.

| Shipments | Concurrent requests | Median ms | Slowest ms | Raw JSON bytes/response | Worker RSS MiB |
|---:|---:|---:|---:|---:|---:|
| 500 | 1 | 142.0 | 184.0 | 733,649 | 503.1 |
| 2000 | 1 | 159.2 | 191.3 | 2,933,584 | 555.9 |
| 2000 | 10 | 779.4 | 908.6 | 2,933,584 | 589.4 |

RSS includes the test framework, full loaded app and retained response buffers. It is not isolated ClearOS memory, an API-only baseline, or evidence of a leak. Browser heap and sustained-load behavior remain unmeasured.

Concurrent transition probe: 3 requests created 3 history rows.
