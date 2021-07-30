import express from 'express';
import fs from 'fs';
import path from 'path';

import lock from '../util/lock.js';
import config from '../config.js';

const router = express.Router();

router.get('/', async (req, res) => {
	const filepath = path.normalize(path.join(config.dataPath, '/top.json'));

	let data = undefined;
	await lock.acquire(filepath, async () => {
		try {
			data = await fs.promises.readFile(filepath, 'utf-8');
		} catch {
			data = '[]';
		}
	});

	res.set('Content-Type', 'application/json');
	res.send(data);
});

export default router;
