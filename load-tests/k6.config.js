export const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
export const WS_URL = __ENV.WS_URL || 'ws://localhost:8080';

export const defaultThresholds = {
  http_req_duration: ['p(50)<100', 'p(95)<500', 'p(99)<1000'],
  http_req_failed: ['rate<0.01'], // <1% error rate
};

export const defaultOptions = {
  thresholds: defaultThresholds,
};
