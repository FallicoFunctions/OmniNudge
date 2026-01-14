/**
 * Cloudflare Worker: Reddit API Proxy
 *
 * This worker proxies requests to Reddit's public JSON API.
 * Deploy this to bypass Reddit's datacenter IP blocking.
 *
 * Deploy URL: https://reddit-proxy.omninudge.workers.dev
 */

export default {
  async fetch(request, env, ctx) {
    // Only allow requests from your domain
    const origin = request.headers.get('Origin');
    const allowedOrigins = [
      'https://omninudge.com',
      'https://www.omninudge.com',
      'http://localhost:3000', // For local development
    ];

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': origin && allowedOrigins.includes(origin) ? origin : 'https://omninudge.com',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, User-Agent',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    // Only allow GET requests
    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405 });
    }

    try {
      const url = new URL(request.url);

      // Extract the Reddit path from the worker URL
      // Expected format: https://reddit-proxy.workers.dev/r/popular/hot.json?limit=10
      const redditPath = url.pathname + url.search;

      // Construct the Reddit API URL
      const redditUrl = `https://www.reddit.com${redditPath}`;

      // Make request to Reddit with proper headers
      const redditResponse = await fetch(redditUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; OmniNudge/1.0; +https://omninudge.com)',
          'Accept': 'application/json',
        },
      });

      // Get the response body
      const body = await redditResponse.text();

      // Check if Reddit returned JSON
      let contentType = redditResponse.headers.get('Content-Type') || '';

      // If Reddit returned HTML instead of JSON, it's likely blocking us
      if (contentType.includes('text/html')) {
        return new Response(JSON.stringify({
          error: 'Reddit API returned HTML instead of JSON. The request may be blocked.',
          status: redditResponse.status,
        }), {
          status: 503,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': origin && allowedOrigins.includes(origin) ? origin : 'https://omninudge.com',
          },
        });
      }

      // Return the Reddit response with CORS headers
      return new Response(body, {
        status: redditResponse.status,
        headers: {
          'Content-Type': contentType,
          'Access-Control-Allow-Origin': origin && allowedOrigins.includes(origin) ? origin : 'https://omninudge.com',
          'Cache-Control': 'public, max-age=60', // Cache for 1 minute
        },
      });

    } catch (error) {
      return new Response(JSON.stringify({
        error: 'Failed to fetch from Reddit',
        message: error.message,
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': origin && allowedOrigins.includes(origin) ? origin : 'https://omninudge.com',
        },
      });
    }
  },
};
