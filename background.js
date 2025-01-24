// Добавляем слушатель событий для завершенных HTTP-запросов
chrome.webRequest.onCompleted.addListener(
	function (details) {
		// Получаем значения из локального хранилища браузера
		chrome.storage.local.get([ 'headerName', 'grafanaDomain', 'template', 'datasource', 'orgId' ], function (items) {
			// Используем значения по умолчанию, если они не установлены
			const headerName = items.headerName;
			const grafanaDomain = items.grafanaDomain;
			const template = items.template;
			const datasource = items.datasource;
			const org = items.orgId;

			// Ищем заголовок ответа с именем, указанным в headerName
			const requestId = details.responseHeaders.find(header => header.name.toLowerCase() === headerName.toLowerCase());
			if (requestId) {
				const formattedTemplate = template.replace('%s', requestId.value);
				// Функция для создания ссылки на Grafana Loki
				function createLokiLink(grafanaUrl, orgId, datasource, query) {
					const panes = {
						"2xx": {
							"datasource": "" + datasource + "",
							"queries": [
								{
									"refId": "A",
									"expr": "" + query + "",
									"queryType": "range",
									"datasource": {
										"type": "loki",
										"uid": "" + datasource + ""
									},
									"editorMode": "builder"
								}
							],
							"range": {
								"from": "now-15m",
								"to": "now+15m"
							}
						}
					};

					const schemaVersion = 1;

					const params = new URLSearchParams({
						orgId: orgId,
						schemaVersion: schemaVersion,
						panes: JSON.stringify(panes)
					});

					const url = `${ grafanaUrl }/explore?${ params.toString() }`

					return url;

				}

				console.log(grafanaDomain, org, datasource, template);
				const grafanaLink = createLokiLink(grafanaDomain, org, datasource, formattedTemplate);

				// Получаем список всех сохраненных запросов из локального хранилища браузера
				chrome.storage.local.get([ 'requests' ], function (result) {
					// Добавляем новый запрос в список
					let requests = result.requests || [];
					requests.push({ url: details.url, requestId: requestId.value, grafanaLink });
					// Сохраняем обновленный список запросов обратно в локальное хранилище браузера
					chrome.storage.local.set({ requests });
				});
			}
		});
	},
	{ urls: [ "<all_urls>" ] },
	[ "responseHeaders" ]
);


chrome.runtime.onInstalled.addListener((details) => {
	const currentVersion = chrome.runtime.getManifest().version;

	if (details.reason === 'install') {
		// При первоначальной установке расширения
		initializeDefaultSettings(currentVersion);
	} else if (details.reason === 'update') {
		// При обновлении расширения
		chrome.storage.local.get(['version'], (result) => {
			const previousVersion = result.version;
			if (previousVersion !== currentVersion) {
				// Версия изменилась, выполним обновление настроек
				updateSettings(currentVersion);
			}
		});
	}
});

function initializeDefaultSettings(version) {
	chrome.storage.local.set({
		headerName: 'request-id',
		grafanaDomain: 'https://grafana.example',
		template: '{requestId="%s"} |= ``',
		datasource: ' ',
		orgId: '1',
		version: version
	}, () => {
		console.log('Настройки установлены по умолчанию.');
	});
}

function updateSettings(version) {
	// Здесь можно добавить логику для обновления настроек при необходимости
	// Например, добавить новые параметры или изменить существующие

	// Обновим версию в хранилище
	chrome.storage.local.set({ version: version }, () => {
		console.log(`Расширение обновлено до версии ${version}.`);
	});
}