chrome.webRequest.onCompleted.addListener(
	function(details) {
		chrome.storage.local.get(['headerName', 'grafanaDomain', 'template'], function(items) {
			const headerName = items.headerName || 'request-id';
			const grafanaDomain = items.grafanaDomain || 'https://grafana.example.com';
			const template = items.template || '{requestId="%s"} |= ``';

			const requestId = details.responseHeaders.find(header => header.name.toLowerCase() === headerName.toLowerCase());
			if (requestId) {
				const formattedTemplate = template.replace('%s', requestId.value);
				const grafanaLink = `${grafanaDomain}/explore?left=${encodeURIComponent(formattedTemplate)}`;

				chrome.storage.local.get(['requests'], function(result) {
					let requests = result.requests || [];
					requests.push({ url: details.url, requestId: requestId.value, grafanaLink });
					chrome.storage.local.set({ requests });
				});
			}
		});
	},
	{ urls: ["<all_urls>"] },
	["responseHeaders"]
);

chrome.runtime.onInstalled.addListener(() => {
	chrome.storage.local.set({
		headerName: 'request-id',
		grafanaDomain: 'https://grafana.example.com',
		template: '{requestId="%s"} |= ``'
	});
});