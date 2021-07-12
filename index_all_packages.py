import hashlib, json, os, re

packages_dir = './packages/'
keywords = {}

def add_keyword_package(keyword, package_name):
	if keyword in keywords:
		if not package_name in keywords[keyword]:
			keywords[keyword].add(package_name)
	else:
		keywords[keyword] = { package_name }

for filename in os.listdir(packages_dir):
	package_name = os.path.splitext(filename)[0]
	manifest = json.load(open(os.path.join(packages_dir, filename), 'r'))

	pattern = r'[a-zA-Z0-9]+'
	content = ' '.join(filter(None, [
		manifest.get('description'),
		manifest.get('id'),
		' '.join(filter(None, manifest.get('keywords'))),
		manifest.get('license'),
		manifest.get('publisher'),
		manifest.get('title')
	]))

	for keyword in re.findall(pattern, content):
		add_keyword_package(keyword.lower(), package_name)

sorted_keywords = [{
	'keyword': keyword,
	'packages': sorted(keywords[keyword])
} for keyword in keywords]

sorted_keywords.sort(key=lambda x : x['keyword'])

csv_string = '\n'.join([
	','.join([keyword['keyword']] + keyword['packages'])
	for keyword in sorted_keywords
])

with open('packages.csv', 'w') as file:
    file.write(csv_string)

with open('packages.csv.sha256', 'w') as file:
	file.write(hashlib.sha256(csv_string.encode()).hexdigest())
