document.addEventListener('DOMContentLoaded', function() {
	chrome.storage.local.get(['requests'], function(result) {
		const requests = result.requests || [];
		const tableBody = document.querySelector('#requestsTable tbody');
		tableBody.innerHTML = '';

		requests.forEach(request => {
			const row = document.createElement('tr');

			const urlCell = document.createElement('td');
			urlCell.textContent = request.url;
			row.appendChild(urlCell);

			const requestIdCell = document.createElement('td');
			requestIdCell.textContent = request.requestId;
			row.appendChild(requestIdCell);

			const grafanaLinkCell = document.createElement('td');
			const link = document.createElement('a');
			link.href = request.grafanaLink;
			link.target = '_blank';
			link.textContent = 'Перейти';
			grafanaLinkCell.appendChild(link);
			row.appendChild(grafanaLinkCell);

			tableBody.appendChild(row);
		});
	});
});