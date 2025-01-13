// Добавляем слушатель событий для завершенных HTTP-запросов
chrome.webRequest.onCompleted.addListener(
	function(details) {
		// Получаем значения из локального хранилища браузера
		chrome.storage.local.get(['headerName', 'grafanaDomain', 'template'], function(items) {
			// Используем значения по умолчанию, если они не установлены
			const headerName = items.headerName || 'request-id';
			const grafanaDomain = items.grafanaDomain || 'https://monitoring.dev.relef.dev';

			const template = encodeURIComponent('{requestId="%s"} |= ``'); // Замените на ваш запрос
			const orgId = 1; // ID организации в Grafana

			// Ищем заголовок ответа с именем, указанным в headerName
			const requestId = details.responseHeaders.find(header => header.name.toLowerCase() === headerName.toLowerCase());
			if (requestId) {


				// Функция для создания ссылки на Grafana Loki
				function createLokiLink(grafanaUrl, orgId, query,datasource) {
					const panes = {
						"2xx": {
							"datasource": "P8E80F9AEF21F6940",
							"queries": [
								{
									"refId": "A",
									"expr": "{requestId=\""+requestId.value+"\"} |= ``",
									"queryType": "range",
									"datasource": {
										"type": "loki",
										"uid": "P8E80F9AEF21F6940"
									},
									"editorMode": "builder"
								}
							],
							"range": {
								"from": "now-1h",
								"to": "now"
							}
						}
					};

					const schemaVersion = 1;

					const params = new URLSearchParams({
						orgId: orgId,
						schemaVersion: schemaVersion,
						panes: JSON.stringify(panes)
					});

					const url = `${grafanaUrl}/explore?${params.toString()}`

					return  url;
				}
				const grafanaLink = createLokiLink(grafanaDomain, orgId, template);

				// Получаем список всех сохраненных запросов из локального хранилища браузера
				chrome.storage.local.get(['requests'], function(result) {
					// Добавляем новый запрос в список
					let requests = result.requests || [];
					requests.push({ url: details.url, requestId: requestId.value, grafanaLink });
					// Сохраняем обновленный список запросов обратно в локальное хранилище браузера
					chrome.storage.local.set({ requests });
				});
			}
		});
	},
	{ urls: ["<all_urls>"] },
	["responseHeaders"]
);

// Добавляем слушатель событий для установки расширения
chrome.runtime.onInstalled.addListener(() => {
	// Устанавливаем значения по умолчанию для headerName, grafanaDomain и template в локальном хранилище браузера
	chrome.storage.local.set({
		headerName: 'request-id',
		grafanaDomain: 'https://monitoring.dev.relef.dev',
		template: '{requestId="%s"} |= ``'
	});
});
