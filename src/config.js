export default {
	githubClientId: 'd3165174a7de6a3b2d43',
	skipAuthentication: false,
	dataPath: './.data/',
	slowDown: {
		windowMs: 60000,
		delayAfter: 100,
		delayMs: 100,
		maxDelayMs: 100
	},
	deleteSlowDown: {
		windowMs: 10000,
		delayAfter: 1,
		delayMs: 5000,
		maxDelayMs: 5000
	},
	publishSlowDown: {
		windowMs: 10000,
		delayAfter: 1,
		delayMs: 5000,
		maxDelayMs: 5000
	},
	searchSlowDown: {
		windowMs: 10000,
		delayAfter: 1,
		delayMs: 1000,
		maxDelayMs: 1000
	},
	admins: [
		'rayferric'
	],
	whitelist: {
		enabled: true,
		users: []
	},
	blacklist:  {
		enabled: true,
		users: []
	}
}
