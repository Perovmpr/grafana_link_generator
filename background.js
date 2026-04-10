// Добавляем слушатель событий для завершенных HTTP-запросов
chrome.webRequest.onCompleted.addListener(
	function (details) {
		// Получаем значения из локального хранилища браузера
		chrome.storage.local.get([ 'mode', 'headerName', 'grafanaDomain', 'template', 'datasource', 'orgId', 'tempoDatasource', 'traceIdHeader', 'spanIdHeader' ], function (items) {
			// Используем значения по умолчанию, если они не установлены
			const mode = items.mode || 'loki';
			const headerName = items.headerName;
			const grafanaDomain = items.grafanaDomain;
			const template = items.template;
			const datasource = items.datasource;
			const org = items.orgId;
			const tempoDatasource = items.tempoDatasource;
			const traceIdHeader = items.traceIdHeader || 'traceparent';
			const spanIdHeader = items.spanIdHeader || 'x-span-id';

			let grafanaLink;
			let capturedId;
			let linkType;

			if (mode === 'tempo') {
				// Режим Tempo: ищем traceId и spanId
				const traceIdValue = details.responseHeaders.find(header => header.name.toLowerCase() === traceIdHeader.toLowerCase());
				const spanIdValue = details.responseHeaders.find(header => header.name.toLowerCase() === spanIdHeader.toLowerCase());
				
				if (traceIdValue) {
					capturedId = traceIdValue.value;
					linkType = 'tempo';
					grafanaLink = createTempoLink(grafanaDomain, org, tempoDatasource, capturedId, spanIdValue ? spanIdValue.value : null);
				} else {
					return; // Если traceId нет, пропускаем
				}
			} else {
				// Режим Loki: ищем заголовок request-id
				const requestId = details.responseHeaders.find(header => header.name.toLowerCase() === headerName.toLowerCase());
				if (requestId) {
					capturedId = requestId.value;
					linkType = 'loki';
					const formattedTemplate = template.replace('%s', capturedId);
					grafanaLink = createLokiLink(grafanaDomain, org, datasource, formattedTemplate);
				} else {
					return; // Если заголовка нет, пропускаем
				}
			}

			// Получаем список всех сохраненных запросов из локального хранилища браузера
			chrome.storage.local.get([ 'requests' ], function (result) {
				// Извлекаем путь из URL
				let path = '';
				try {
					const urlObj = new URL(details.url);
					path = urlObj.pathname + urlObj.search;
				} catch (e) {
					path = details.url;
				}

				// Добавляем новый запрос в список
				let requests = result.requests || [];
				requests.push({
					url: details.url,
					path: path,
					method: details.method,
					statusCode: details.statusCode,
					responseTime: new Date(details.timeStamp).toISOString(),
					requestId: capturedId,
					grafanaLink,
					linkType,
					timestamp: new Date().toISOString()
				});
				// Сохраняем обновленный список запросов обратно в локальное хранилище браузера
				chrome.storage.local.set({ requests });
			});
		});
	},
	{ urls: [ "<all_urls>" ] },
	[ "responseHeaders" ]
);

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

// Функция для создания ссылки на Grafana Tempo (OpenTelemetry traces)
function createTempoLink(grafanaUrl, orgId, tempoDatasource, traceId, spanId) {
	const panes = {
		"trace": {
			"datasource": {
				"type": "tempo",
				"uid": "" + tempoDatasource + ""
			},
			"queries": [
				{
					"refId": "A",
					"queryType": "traceql",
					"datasource": {
						"type": "tempo",
						"uid": "" + tempoDatasource + ""
					},
					"query": "" + traceId + ""
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

	const url = `${ grafanaUrl }/explore?${ params.toString() }`

	return url;
}


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
		mode: 'loki',
		headerName: 'request-id',
		grafanaDomain: 'https://grafana.example',
		template: '{requestId="%s"} |= ``',
		datasource: ' ',
		orgId: '1',
		tempoDatasource: ' ',
		traceIdHeader: 'traceparent',
		spanIdHeader: 'x-span-id',
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