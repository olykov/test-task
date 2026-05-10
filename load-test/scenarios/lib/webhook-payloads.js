// k6-compatible payload generator (no external deps, no faker)
// Uses real seeded driver/trip IDs from M3 seed.

const DRIVERS = {
  banned: ['drv_0031', 'drv_0041'],
  suspended: ['drv_0028'],
  chronic: ['drv_0001', 'drv_0005', 'drv_0013'],
  clean: ['drv_0002', 'drv_0003', 'drv_0006'],
};

const TRIPS_BY_DRIVER = {
  drv_0031: 'trp_00010',
  drv_0041: 'trp_00020',
  drv_0028: 'trp_00093',
  drv_0001: 'trp_00061',
  drv_0005: 'trp_00012',
  drv_0013: 'trp_00023',
  drv_0002: 'trp_00165',
  drv_0003: 'trp_00086',
  drv_0006: 'trp_00064',
};

const COMPLAINT_TEMPLATES = [
  'Я виконав поїздку, оплата не пройшла на мій рахунок',
  'Не отримав кошти за виконану поїздку',
  'Замовник зник, а оплата не зарахувалася',
  'Поїздка завершена, гроші не прийшли',
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function uuid() {
  // Simple unique key for load test (k6 has no crypto.randomUUID)
  return Math.random().toString(36).slice(2) + '-' + Date.now();
}

function buildBase(driverId, tripId, complaintText, claimedAmount) {
  return {
    idempotency_key: 'k6-' + uuid(),
    driver_id: driverId,
    trip_id: tripId,
    complaint_text: complaintText,
    claimed_amount: claimedAmount,
    submitted_at: new Date().toISOString(),
  };
}

const SCENARIOS = [
  // ── grey zone, will trigger AI/cache (most common path)
  {
    name: 'legitimate_clean',
    weight: 35,
    build: () => {
      const drv = pick(DRIVERS.clean);
      return buildBase(drv, TRIPS_BY_DRIVER[drv], pick(COMPLAINT_TEMPLATES), 100 + Math.floor(Math.random() * 400));
    },
  },
  // ── deterministic rules paths
  {
    name: 'banned',
    weight: 5,
    build: () => {
      const drv = pick(DRIVERS.banned);
      return buildBase(drv, TRIPS_BY_DRIVER[drv], pick(COMPLAINT_TEMPLATES), 200);
    },
  },
  {
    name: 'suspended',
    weight: 3,
    build: () => {
      const drv = pick(DRIVERS.suspended);
      return buildBase(drv, TRIPS_BY_DRIVER[drv], pick(COMPLAINT_TEMPLATES), 200);
    },
  },
  {
    name: 'many_fraud_requests',
    weight: 7,
    build: () => {
      const drv = pick(DRIVERS.chronic);
      return buildBase(drv, TRIPS_BY_DRIVER[drv], pick(COMPLAINT_TEMPLATES), 200);
    },
  },
  {
    name: 'amount_toohigh',
    weight: 10,
    build: () => {
      const drv = pick(DRIVERS.clean);
      return buildBase(drv, TRIPS_BY_DRIVER[drv], 'Я заплатив набагато більше', 9999);
    },
  },
  {
    name: 'spam',
    weight: 8,
    build: () => {
      const drv = pick(DRIVERS.clean);
      return buildBase(drv, TRIPS_BY_DRIVER[drv], '.', 50);
    },
  },
  {
    name: 'unknown_driver',
    weight: 4,
    build: () => buildBase('drv_9999', 'trp_00001', 'Не отримав оплату', 100),
  },
  {
    name: 'unknown_trip',
    weight: 5,
    build: () => buildBase('drv_0002', 'trp_99999', 'Не отримав оплату', 100),
  },
  {
    name: 'trip_driver_mismatch',
    weight: 5,
    build: () => buildBase('drv_0002', 'trp_00010', 'Не отримав оплату', 100), // trp_00010 belongs to drv_0031
  },
  {
    name: 'duplicate',
    weight: 8,
    build: () => {
      // Same idem key across iterations — should mostly return 200 dup
      const drv = pick(DRIVERS.clean);
      const base = buildBase(drv, TRIPS_BY_DRIVER[drv], pick(COMPLAINT_TEMPLATES), 100);
      base.idempotency_key = 'k6-fixed-duplicate-001';
      return base;
    },
  },
  // ── high cache-hit potential (same complaint repeated)
  {
    name: 'cache_friendly',
    weight: 10,
    build: () => {
      // Same content from same driver → cache hit on second+ call
      const drv = pick(DRIVERS.clean);
      return buildBase(drv, TRIPS_BY_DRIVER[drv], 'Стандартна жалоба на оплату', 150);
    },
  },
];

const totalWeight = SCENARIOS.reduce((s, sc) => s + sc.weight, 0);

export function generate() {
  let r = Math.random() * totalWeight;
  for (const sc of SCENARIOS) {
    r -= sc.weight;
    if (r <= 0) return { scenario: sc.name, payload: sc.build() };
  }
  return { scenario: SCENARIOS[0].name, payload: SCENARIOS[0].build() };
}

export function generateGrey() {
  // Used by circuit-breaker-trigger scenario — only grey-zone events
  const drv = pick(DRIVERS.clean);
  return {
    scenario: 'legitimate_clean',
    payload: buildBase(drv, TRIPS_BY_DRIVER[drv], pick(COMPLAINT_TEMPLATES) + ' ' + uuid(), 100),
  };
}
