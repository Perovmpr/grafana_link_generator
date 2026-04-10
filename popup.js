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

			const idCell = document.createElement('td');
			idCell.textContent = request.requestId;
			row.appendChild(idCell);

			const typeCell = document.createElement('td');
			const badge = document.createElement('span');
			const linkType = request.linkType || 'loki';
			badge.className = `badge badge-${linkType}`;
			badge.textContent = linkType === 'tempo' ? 'Tempo' : 'Loki';
			typeCell.appendChild(badge);
			row.appendChild(typeCell);

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
			location.reload(); // Перезагружаем страницу для обновления таблицы
			const saveButton = document.getElementById('clearButton');
			saveButton.innerHTML = 'История очищена !';
			saveButton.style.backgroundColor = '#28a745';
			setTimeout(() => {
				saveButton.innerHTML = 'Очистить историю';
				saveButton.style.backgroundColor = '#1da1f2';
			}, 2000);
		});
	});

	// Добавляем обработчик для ссылки настройки
	document.getElementById('settingsLink').addEventListener('click', function(event) {
		event.preventDefault();
		chrome.runtime.openOptionsPage();
	});
});