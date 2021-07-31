export default {
	githubClientId: 'd3165174a7de6a3b2d43', // Pair with GITHUB_CLIENT_SECRET
	skipAuthentication: true, // Use only for local/development service
	dataPath: './.data/',
	slowDown: {
		// https://www.npmjs.com/package/express-slow-down
		common: {
			windowMs: 60000,
			delayAfter: 100,
			delayMs: 100,
			maxDelayMs: 100
		},
		delete: {
			windowMs: 60000,
			delayAfter: 1,
			delayMs: 10000,
			maxDelayMs: 10000
		},
		publish: {
			windowMs: 60000,
			delayAfter: 1,
			delayMs: 10000,
			maxDelayMs: 10000
		},
		search: {
			windowMs: 10000,
			delayAfter: 1,
			delayMs: 1000,
			maxDelayMs: 1000
		}
	},
	admins: [
		// Administrators are always
		// whitelisted and cannot be banned
		'rayferric'
	],
	whitelist: {
		enabled: true,
		users: []
	},
	blacklist:  {
		enabled: true,
		users: []
	},
	// Set to true only if behind a trusted proxy
	// like when hosting on Glitch or Heroku
	// Only proxies on default ports (80/443) are supported, eg:
	// https://example.com:443/
	// http://example.com:80/
	trustProxy: false,
	// For how long to cache each package's view
	// count in memory before performing I/O (ms)
	viewCountSyncDelay: 60000,
	// How many packages fit on the top list
	maxTopPackagesCount: 10,
	// After how many days view records are removed
	// and no longer considered in top listings
	// Manifests may still contain out-dated records
	// after a long period of disinterest
	// These will be removed {viewCountSyncDelay} ms after first fetch
	viewCountKeepPeriod: 7
}
