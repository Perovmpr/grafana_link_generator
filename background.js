// Хранилище в памяти: domain -> boolean (есть ли записи)
let domainIcons = {};

// Debounce для сохранения domainIcons в storage
let iconPersistTimeout = null;
function scheduleIconPersist() {
	if (iconPersistTimeout) clearTimeout(iconPersistTimeout);
	iconPersistTimeout = setTimeout(() => {
		chrome.storage.local.set({ domainIcons });
	}, 1000);
}

// Throttle для cleanupExpiredHistory (раз в 60 сек)
let lastCleanupTime = 0;
function throttledCleanup() {
	const now = Date.now();
	if (now - lastCleanupTime < 60000) return;
	lastCleanupTime = now;
	cleanupExpiredHistory();
}

// Обновить иконку для конкретного домена
function updateIconForDomain(domain, hasEntries) {
	if (!domain) return;
	// Сохраняем только если значение изменилось
	if (domainIcons[domain] === hasEntries) return;
	domainIcons[domain] = hasEntries;
	scheduleIconPersist();

	chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
		if (!tabs || !tabs[0]) return;
		try {
			const activeDomain = new URL(tabs[0].url).hostname;
			if (activeDomain === domain) {
				chrome.action.setIcon({
					path: hasEntries
						? { "48": "icons/icon-green-48.png", "128": "icons/icon-green-128.png" }
						: { "48": "icons/icon48.png", "128": "icons/icon128.png" }
				});
			}
		} catch (e) { /* невалидный URL */ }
	});
}

// Пересчитать все домены на основе текущих requests
function rebuildDomainIcons(requests) {
	const newIcons = {};
	requests.forEach(req => {
		try {
			const domain = new URL(req.url).hostname;
			newIcons[domain] = true;
		} catch (e) { /* игнорируем */ }
	});
	domainIcons = newIcons;
	chrome.storage.local.set({ domainIcons });
}

// Очистка записей старше TTL (дни)
function cleanupExpiredHistory() {
	chrome.storage.local.get(['requests', 'historyTtl'], function(result) {
		const ttlDays = result.historyTtl || 1;
		const requests = result.requests || [];
		const cutoffMs = ttlDays * 24 * 60 * 60 * 1000;
		const now = Date.now();

		const filtered = requests.filter(req => {
			const reqTime = new Date(req.timestamp).getTime();
			if (isNaN(reqTime)) return true; // сохранить записи с битым timestamp
			return (now - reqTime) < cutoffMs;
		});

		if (filtered.length !== requests.length) {
			chrome.storage.local.set({ requests: filtered }, () => {
				rebuildDomainIcons(filtered);
			});
		}
	});
}

// Инициализация при запуске с TTL-фильтрацией
chrome.runtime.onStartup.addListener(() => {
	chrome.storage.local.get(['requests', 'historyTtl'], function(result) {
		const ttlDays = result.historyTtl || 1;
		const cutoffMs = ttlDays * 24 * 60 * 60 * 1000;
		const now = Date.now();
		const requests = (result.requests || []).filter(req => {
			const reqTime = new Date(req.timestamp).getTime();
			if (isNaN(reqTime)) return true;
			return (now - reqTime) < cutoffMs;
		});
		rebuildDomainIcons(requests);
	});
});

// При активации вкладки — обновить иконку по признаку из хранилища
chrome.tabs.onActivated.addListener(function(activeInfo) {
	chrome.tabs.get(activeInfo.tabId, function(tab) {
		if (chrome.runtime.lastError) return;
		try {
			const domain = new URL(tab.url).hostname;
			const hasEntries = domainIcons[domain] === true;
			chrome.action.setIcon({
				path: hasEntries
					? { "48": "icons/icon-green-48.png", "128": "icons/icon-green-128.png" }
					: { "48": "icons/icon48.png", "128": "icons/icon128.png" }
			});
		} catch (e) {
			chrome.action.setIcon({
				path: { "48": "icons/icon48.png", "128": "icons/icon128.png" }
			});
		}
	});

	// Автоочистка устаревших записей (throttled)
	throttledCleanup();
});

// При обновлении страницы в той же вкладке
chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
	if (changeInfo.status === 'complete') {
		try {
			const domain = new URL(tab.url).hostname;
			const hasEntries = domainIcons[domain] === true;
			chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
				if (tabs && tabs[0] && tabs[0].id === tabId) {
					chrome.action.setIcon({
						path: hasEntries
							? { "48": "icons/icon-green-48.png", "128": "icons/icon-green-128.png" }
							: { "48": "icons/icon48.png", "128": "icons/icon128.png" }
					});
				}
			});
		} catch (e) { /* игнорируем */ }
	}
});

// Обработчик сообщений от popup (очистка истории по домену)
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
	if (message.action === 'clearDomainHistory') {
		const domain = message.domain;
		chrome.storage.local.get(['requests'], function(result) {
			const requests = result.requests || [];
			const filtered = domain
				? requests.filter(req => {
					try { return new URL(req.url).hostname !== domain; }
					catch (e) { return true; }
				})
				: [];

			chrome.storage.local.set({ requests: filtered }, () => {
				rebuildDomainIcons(filtered);
				sendResponse({ ok: true });
			});
		});
		return true; // для async sendResponse
	}
});

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
				chrome.storage.local.set({ requests }, () => {
					// Обновляем признак наличия записей для домена
					try {
						const domain = new URL(details.url).hostname;
						updateIconForDomain(domain, true);
					} catch (e) { /* игнорируем невалидные URL */ }
				});
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
			"datasource": datasource,
			"queries": [
				{
					"refId": "A",
					"expr": query,
					"queryType": "range",
					"datasource": {
						"type": "loki",
						"uid": datasource
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

	return `${grafanaUrl}/explore?${params.toString()}`;
}

// Функция для создания ссылки на Grafana Tempo (OpenTelemetry traces)
function createTempoLink(grafanaUrl, orgId, tempoDatasource, traceId, spanId) {
	const panes = {
		"trace": {
			"datasource": {
				"type": "tempo",
				"uid": tempoDatasource
			},
			"queries": [
				{
					"refId": "A",
					"queryType": "traceql",
					"datasource": {
						"type": "tempo",
						"uid": tempoDatasource
					},
					"query": traceId
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

	return `${grafanaUrl}/explore?${params.toString()}`;
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
		historyTtl: 1,
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
