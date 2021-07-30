export default function(json) {
	return JSON.stringify(json, (key, value) => {
		// Sorts keys in objects
		if (!(value instanceof Object) || value instanceof Array)
			return value;
		
		// Convert object to sorted array of keys, then reduce into object.
		return Object.keys(value).sort().reduce((sorted, key) => {
			sorted[key] = value[key];
			return sorted 
		}, {});
	}, "\t");
}
