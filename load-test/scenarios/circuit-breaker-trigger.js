import http from 'k6/http';
import { check } from 'k6';
import { Rate } from 'k6/metrics';
import { generateGrey } from './lib/webhook-payloads.js';

const TARGET = __ENV.TARGET_URL || 'https://n8n-test-task.olykov.com/webhook/fraud';

const acceptedRate = new Rate('webhook_accepted_rate');
const errorRate = new Rate('webhook_error_rate');

export const options = {
  scenarios: {
    grey_zone_only: {
      executor: 'constant-arrival-rate',
      rate: 30,                  // moderate rate to not blow OpenAI quota
      timeUnit: '1s',
      duration: '30s',
      preAllocatedVUs: 60,
      maxVUs: 120,
    },
  },
};

export default function () {
  const { scenario, payload } = generateGrey();
  const res = http.post(TARGET, JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json' },
    tags: { scenario },
  });

  if (res.status === 202) acceptedRate.add(1);
  else if (res.status >= 400) errorRate.add(1);

  check(res, {
    '202 accepted': (r) => r.status === 202,
  });
}
