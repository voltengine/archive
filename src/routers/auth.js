import express from 'express';

import * as github from '../util/github.js';

const router = express.Router();

router.get('/', async (req, res) => {
	if (req.query.code === undefined) {
		const redirectUrl = req.protocol + '://'
				+ req.hostname + ':'
				+ process.env.PORT + '/auth/';
		res.redirect(github.getAuthorizationUrl(redirectUrl));
		return;
	}

	let accessToken;
	try {
		accessToken = await github.getAccessToken(req.query.code);
	} catch {
		res.status(401);
		res.send('Invalid redirect code. Try again without query string.');
		return;
	}

	res.send(accessToken);
});

export default router;
