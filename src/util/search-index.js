import fs from 'fs';
import path from 'path';
import stopword from 'stopword';

import lock from '../util/lock.js';
import config from '../config.js';

const keywordPattern = /[a-zA-Z\d]{2,16}/g;

export function getKeywords(query) {
	return [...query.matchAll(keywordPattern)]
			.map(match => match[0].toLowerCase())
			.filter(keyword => !stopword.en.includes(keyword));
}

async function accessData(keyword, modifier) {
	if (keyword.length < 2)
		throw Error('Keyword must be at least 2 characters long.');

	const filepath = path.normalize(path.join(config.dataPath, `/search-index/${keyword.substr(0, 2)}.csv`));
	
	await lock.acquire(filepath, async () => {
		let data;
		try {
			const content = await fs.promises.readFile(filepath, 'utf-8');
			data = content.split(/\r?\n/).map(x => x.split(','));
		} catch {
			data = [];
		}

		modifier(data);

		if (data.length == 0) {
			try {
				await fs.promises.rm(filepath);
			} catch {}
		} else {
			const content = data.map(x => x.join()).join('\n');
			await fs.promises.mkdir(path.dirname(filepath), {
				recursive: true
			});
			await fs.promises.writeFile(filepath, content);
		}
	});
}

export async function addMapping(keyword, packageId) {
	await accessData(keyword, data => {
		const result = findExactOrGetInsertionIndex(data, keyword);

		if (result.found) {
			const i = data[result.index].indexOf(packageId, 1);
			if (i == -1) // Not found
				data[result.index].push(packageId);
		} else {
			data.splice(result.index, 0, [keyword, packageId]);
		}
	});
}

export async function removeMapping(keyword, packageId) {
	await accessData(keyword, data => {
		const result = findExactOrGetInsertionIndex(data, keyword);

		if (result.found) {
			const i = data[result.index].indexOf(packageId, 1);
			if (i != -1) { // Found
				if (data[result.index].length == 2)
					data.splice(result.index, 1);
				else
					data[result.index].splice(i, 1);
			}
		}
	});
}

export async function getMappings(keyword) {
	if (keyword.length < 2)
		throw Error('Keyword must be at least 2 characters long.');

	const filepath = path.normalize(path.join(config.dataPath, `/search-index/${keyword.substr(0, 2)}.csv`));
	
	let content = undefined;
	await lock.acquire(filepath, async () => {
		try {
			content = await fs.promises.readFile(filepath, 'utf-8');
		} catch {}
	});
	const data = content === undefined ? [] : content.split(/\r?\n/).map(x => x.split(','));

	const result = findExactOrGetInsertionIndex(data, keyword);
	return result.found ? data[result.index].slice(1) : [];
}

function getSimilarity(a, b) {
	const min = Math.min(a.length, b.length);
	const max = Math.max(a.length, b.length);

	let i = -1;
	while (++i < min) {
		if (a.charAt(i) != b.charAt(i))
			break;
	}

	const score = i / max;
	return score * score;
}

async function searchForKeyword(keyword, matches, minSimilarity = 0.25) {
	// For each keyword multiple matches can be found
	// How much characters do they have in common shall define the score (0 to 1)
	// Scores for different keywords mapped to the same package are summed
	// return { '{package-id}': {score}, ... }

	const filepath = path.normalize(path.join(config.dataPath, `/search-index/${keyword.substr(0, 2)}.csv`));
	
	let content = undefined;
	await lock.acquire(filepath, async () => {
		try {
			content = await fs.promises.readFile(filepath, 'utf-8');
		} catch {}
	});
	const data = content === undefined ? [] :
			content.split(/\r?\n/).map(x => x.split(','));

	const result = findExactOrGetInsertionIndex(data, keyword);

	let i = result.index;
	for (let j = 0; j < 8; j++) {
		if (--i == -1)
			break;

		const similarity = getSimilarity(keyword, data[i][0]);
		if (similarity < minSimilarity)
			break;
		
		for (const packageId of data[i].slice(1)) {
			if (matches[packageId] === undefined)
				matches[packageId] = similarity;
			else
				matches[packageId] += similarity;
		}
	}

	// Upcoming keywords won't get higher score than result.index
	i = result.index - 1;
	for (let j = 0; j < 8; j++) {
		if (++i == data.length)
			break;

		const similarity = getSimilarity(keyword, data[i][0]);
		if (similarity < minSimilarity)
			break;
		
		for (const packageId of data[i].slice(1)) {
			if (matches[packageId] === undefined)
				matches[packageId] = similarity;
			else
				matches[packageId] += similarity;
		}
	}
}

export async function search(query, maxKeywords = 8, minTotalScore = 0.25) {
	let matches = {};

	for (let keyword of getKeywords(query).slice(0, maxKeywords))
		await searchForKeyword(keyword, matches);

	return Object.keys(matches).sort(
			(id1, id2) => matches[id2] - matches[id1])
			.filter(id => matches[id] > minTotalScore);
}

function findExactOrGetInsertionIndex(data, keyword) {
	// return { found: {boolean}, index: {number} }

	if (data.length == 0)
		return { found: false, index: 0 };

	let step = Math.floor(data.length / 2);
	let i = step;
	
	while (true) {
		const currentKeyword = data[i][0];
		step = Math.floor(step / 2);

		if (currentKeyword == keyword || step == 0)
			break;
		
		i += currentKeyword < keyword ? step : -step;
	}

	// Now i is in neighborhood of potential matches

	switch (keyword.localeCompare(data[i][0])) {
		case -1: // keyword comes before data[i][0]; keyword < data[i][0]
			if (i == 0)
				return { found: false, index: i };
			
			if (keyword == data[i - 1][0])
				return { found: true, index: i - 1 };
			
			if (keyword < data[i - 1][0])
				return { found: false, index: i - 1 };

			// keyword > data[i - 1][0]
			return { found: false, index: i };
		case 1: // keyword > data[i][0]
			if (i == data.length - 1)
				return { found: false, index: i + 1 }; // Might not yet exist

			if (keyword == data[i + 1][0])
				return { found: true, index: i + 1 };

			if (keyword > data[i + 1][0])
				return { found: false, index: i + 2 }; // Might not yet exist

			// keyword < data[i + 1][0]
			return { found: false, index: i + 1 };
		case 0:
			return { found: true, index: i };
	}
}
