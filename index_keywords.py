import hashlib, json, os

packages_dir = './packages/'
keywords = {}

def add_package_keyword(package_name, keyword):
	if keyword in keywords:
		keywords[keyword].add(package_name)
	else:
		keywords[keyword] = { package_name }

for filename in os.listdir(packages_dir):
	package_name = os.path.splitext(filename)[0]

	for keyword in package_name.split('-'):
			add_package_keyword(package_name, keyword)

	with open(os.path.join(packages_dir, filename), 'r') as file:
		for keyword in json.load(file)['keywords']:
			add_package_keyword(package_name, keyword)

sorted_keywords = [{
	'keyword': keyword,
	'packages': sorted(keywords[keyword])
} for keyword in keywords]

sorted_keywords.sort(key=lambda x : x['keyword'])

json_string = json.dumps(sorted_keywords, sort_keys=True, indent='\t')

with open('index.json', 'w') as file:
    file.write(json_string)

with open('sha-256.json', 'w') as file:
	json.dump(hashlib.sha256(json_string.encode()).hexdigest(), file)
