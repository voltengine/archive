import express from 'express';
import expressSlowDown from 'express-slow-down';
import fs from 'fs';
import jsonschema from 'jsonschema';
import path from 'path';
import spdxExpressionValidate from 'spdx-expression-validate';

import * as github from '../util/github.js';
import lock from '../util/lock.js';
import prettyStringifyJson from '../util/pretty-stringify-json.js';
import * as searchIndex from '../util/search-index.js';
import config from '../config.js';
import packageSchema from '../package-schema.js';

const router = express.Router();
const validator = new jsonschema.Validator();
const slowDown = expressSlowDown(config.publishSlowDown);

router.post('/', slowDown, async (req, res) => {
	const pkg = req.body;
	const result = validator.validate(pkg, packageSchema);

	if (result.errors.length != 0) {
		res.status(400);
		res.write('Package does not comply with JSON schema:');
		for (const error of result.errors)
			res.write('\n- package' + error.stack.substr(8));
		res.end();
		return;
	}

	if(!spdxExpressionValidate(pkg.license)) {
		res.status(400);
		res.send('License is not a valid SPDX expression.');
		return;
	}

	const scope = pkg.id.substr(0, pkg.id.indexOf('/'));
	const error = github.checkAuthorization(req.query.token, scope);
	if (error !== undefined) {
		res.status(error.status);
		res.send(error.message);
		return;
	}

	const filepath = path.normalize(path.join(config.dataPath,
			'/packages/', pkg.id + '.json'));
	
	let data = undefined;
	let oldManifest, newManifest;
	await lock.acquire(filepath, async () => {
		try {
			data = await fs.promises.readFile(filepath, 'utf-8');
		} catch {}
		
		oldManifest = data === undefined ? {} : JSON.parse(data);
		newManifest = Object.assign({}, oldManifest);

		const today = new Date().toISOString();

		if (data === undefined) {
			newManifest.created = today;
			newManifest.releases = {};
			newManifest.views = {};
		}

		newManifest.description = pkg.description;
		newManifest.git = pkg.git;
		newManifest.keywords = pkg.keywords;
		newManifest.license = pkg.license;
		newManifest.modified = today;
		newManifest.releases[pkg.version] = pkg.dependencies === undefined ? {} : pkg.dependencies;
		
		await fs.promises.mkdir(path.dirname(filepath), {
			recursive: true
		});
		await fs.promises.writeFile(filepath, prettyStringifyJson(newManifest));
	});

	if (data === undefined) {
		const newKeywords = searchIndex.getKeywords([
			newManifest.description,
			pkg.id,
			newManifest.keywords.join()
		].join());
		for (let keyword of newKeywords)
			searchIndex.addMapping(keyword, pkg.id);

		res.set('Location', req.protocol + '://'
				+ req.hostname + ':'
				+ process.env.PORT + '/package/'
				+ pkg.id + '/');
		res.status(201);
		res.send(`Created ${pkg.id}.`);
	} else {
		// ID cannot change
		const oldKeywords = searchIndex.getKeywords([
			oldManifest.description,
			oldManifest.keywords.join()
		].join());
		const newKeywords = searchIndex.getKeywords([
			newManifest.description,
			newManifest.keywords.join()
		].join());

		const removedKeywords = oldKeywords.filter(keyword => !newKeywords.includes(keyword));
		const addedKeywords = newKeywords.filter(keyword => !oldKeywords.includes(keyword));

		for (let keyword of removedKeywords)
			searchIndex.removeMapping(keyword, pkg.id);
		for (let keyword of addedKeywords)
			searchIndex.addMapping(keyword, pkg.id);

		res.status(200);
		res.send(`Updated ${pkg.id}.`);
	}
});

export default router;
