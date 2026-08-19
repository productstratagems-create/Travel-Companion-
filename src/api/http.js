// Entur requires every consumer to identify itself; requests without the
// header risk throttling. Merge it into all calls against api.entur.io.
const ET_CLIENT_NAME = 'productstratagems-travel-companion';

export function enturFetch(url, opts = {}) {
  return fetch(url, {
    ...opts,
    headers: { 'ET-Client-Name': ET_CLIENT_NAME, ...(opts.headers || {}) },
  });
}
