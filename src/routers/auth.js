import appendQuery from 'append-query';
import express from 'express';

import * as github from '../util/github.js';
import config from '../config.js';

const router = express.Router();

router.get('/', async (req, res) => {
	if (req.query.code === undefined) {
		let redirectUrl = config.githubCallbackUrl;
		if (req.query.redirect !== undefined)
		redirectUrl = appendQuery(config.githubCallbackUrl, {
			redirect: req.query.redirect
		});

		res.redirect(github.getAuthorizationUrl(redirectUrl));
		return;
	}

	let accessToken;
	try {
		accessToken = await github.getAccessToken(req.query.code);
	} catch {
		res.status(401);
		res.set('Content-Type', 'text/plain');
		res.send('Invalid redirect code. Try again without query string.');
		return;
	}

	if (req.query.redirect === undefined) {
		res.set('Content-Type', 'text/plain');
		res.send(accessToken);
	} else {
		res.redirect(appendQuery(req.query.redirect, {
			token: accessToken
		}));
	}
});

router.get('/id/', (req, res) => {
	res.set('Content-Type', 'text/plain');
	res.send(config.githubClientId);
});

export default router;
