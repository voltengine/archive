import got from 'got';
import httpErrors from 'http-errors';
// import querystring from 'querystring';

import config from '../config.js';

// export function getAuthorizationUrl(redirectUrl) {
// 	return 'https://github.com/login/oauth/authorize/?scope=read:org&client_id='
// 			+ config.githubClientId + '&redirect_uri=' + encodeURIComponent(redirectUrl);
// }

// export async function getAccessToken(code) {
// 	let gotResponse = await got.post('https://github.com/login/oauth/access_token', {
// 		headers: {
// 			'Accept': 'application/x-www-form-urlencoded'
// 		},
// 		form: {
// 			'client_id': config.githubClientId,
// 			'client_secret': process.env.GITHUB_CLIENT_SECRET,
// 			'code': code
// 		}
// 	});

// 	return querystring.parse(gotResponse.body)['access_token'];
// }

export async function checkAccessToken(token) {
	const url = `https://api.github.com/applications/${config.githubClientId}/token`;
	const authorization = 'Basic ' + Buffer.from(config.githubClientId +
			':' + process.env.GITHUB_CLIENT_SECRET).toString('base64');

	try {
		const gotResponse = await got.post(url, {
			headers: {
				'Content-Type': 'application/json',
				'Authorization': authorization
			},
			json: {
				'access_token': token
			}
		}).json();

		// Access token is valid
		return {
			valid: true,
			info: gotResponse
		};
	} catch {
		// Access token is not valid (probably revoked by the user)
		return {
			valid: false
		};
	}
}

export async function getAuthorizedUser(req, res) {
	let user = undefined;

	if (req.session) {
		const result = await checkAccessToken(req.session.accessToken);
		if (result.valid)
			user = result.info.user;
		else {
			// Session is invalid if access token has been revoked
			req.session.destroy();
		}
	}

	// Not authorized if user is undefined
	return user;
}

export async function ensureAuthorizedUser(req, res) {
	const user = await getAuthorizedUser(req, res);

	if (user === undefined)
		res.redirect('/sign-in/?redirect=' + encodeURIComponent(req.originalUrl))

	// Caller should immediately return if user is
	// undefined, response is no longer valid at that time
	return user;
}

export async function getOwnedOrgs(accessToken, login) {
	const orgs = [];

	let gotResponse = await got.get('https://api.github.com/user/orgs', {
		headers: {
			'Authorization': 'Bearer ' + accessToken,
			'Accept': 'application/vnd.github.v3+json'
		}
	}).json();

	for (const org of gotResponse) {
		gotResponse = await got.get('https://api.github.com/orgs/' + org.login + '/memberships/' + login, {
			headers: {
				'Authorization': 'Bearer ' + accessToken,
				'Accept': 'application/vnd.github.v3+json'
			}
		}).json();
		
		if (gotResponse.role == 'admin')
			orgs.push(org.login);
	}

	return orgs;
}

export async function checkAuthorization(token, scope) {
	if (config.skipAuthentication)
		return undefined;

	if (token === undefined)
		return { status: 401, message: 'Access token has not been provided.' };

	const result = await checkAccessToken(token);
	if (!result.valid)
		return { status: 401, message: 'Invalid access token.' };

	if (config.admins.includes(result.info.user.login))
		return undefined;

	if (config.whitelist.enabled &&
			!config.whitelist.users.includes(result.info.user.login))
		return { status: 403, message: 'Authenticated user is not whitelisted.' };

	if (config.blacklist.enabled &&
			config.blacklist.users.includes(result.info.user.login))
		return { status: 403, message: 'Authenticated user is blacklisted.' };

	const scopes = await getOwnedOrgs(token, result.info.user.login);
	scopes.push(result.info.user.login);

	if (!scopes.includes(scope))
		return { status: 403, message: 'Scope is not editable by authenticated user.' };

	return undefined;
}