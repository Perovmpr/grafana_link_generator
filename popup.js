document.addEventListener('DOMContentLoaded', function() {
	// Загружаем сохраненные запросы
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

			const actionsCell = document.createElement('td');
			const copyButton = document.createElement('button');
			copyButton.className = 'copy-button';
			copyButton.textContent = 'Копировать';
			copyButton.onclick = function() {
				navigator.clipboard.writeText(request.grafanaLink).then(function() {
					alert('Ссылка скопирована в буфер обмена!');
				}, function(err) {
					console.error('Не удалось скопировать текст: ', err);
				});
			};
			actionsCell.appendChild(copyButton);
			row.appendChild(actionsCell);

			tableBody.appendChild(row);
		});
	});

	// Добавляем обработчик для кнопки очистки истории
	document.getElementById('clearButton').addEventListener('click', function() {
		chrome.storage.local.remove(['requests'], function() {
			alert('История запросов очищена.');
			location.reload(); // Перезагружаем страницу для обновления таблицы
		});
	});

	// Добавляем обработчик для ссылки настройки
	document.getElementById('settingsLink').addEventListener('click', function(event) {
		event.preventDefault();
		chrome.runtime.openOptionsPage();
	});
});