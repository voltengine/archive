import express from 'express';
import expressSlowDown from 'express-slow-down';

import prettyStringifyJson from '../util/pretty-stringify-json.js';
import * as searchIndex from '../util/search-index.js';
import config from '../config.js';

const router = express.Router();
const slowDown = expressSlowDown(config.searchSlowDown);

router.get('/', slowDown, async (req, res) => {
	if (req.query.query === undefined) {
		res.status(400);
		res.send('Search query has not been provided.');
		return;
	}

	res.set('Content-Type: application/json');
	res.send(prettyStringifyJson(await searchIndex.search(req.query.query.substr(0, 128))));
});

export default router;
