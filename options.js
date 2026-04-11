document.addEventListener('DOMContentLoaded', function() {
	// Загружаем текущие настройки из локального хранилища
	chrome.storage.local.get(['mode', 'headerName', 'grafanaDomain', 'template', 'datasource', 'orgId', 'tempoDatasource', 'traceIdHeader', 'spanIdHeader', 'historyTtl'], function(items) {
		document.getElementById('mode').value = items.mode || 'loki';
		document.getElementById('headerName').value = items.headerName;
		document.getElementById('grafanaDomain').value = items.grafanaDomain;
		document.getElementById('template').value = items.template;
		document.getElementById('datasource').value = items.datasource;
		document.getElementById('orgId').value = items.orgId;
		document.getElementById('tempoDatasource').value = items.tempoDatasource;
		document.getElementById('traceIdHeader').value = items.traceIdHeader || 'traceparent';
		document.getElementById('spanIdHeader').value = items.spanIdHeader || 'x-span-id';
		document.getElementById('historyTtl').value = items.historyTtl || 1;

		console.log(items);

		// Показываем/скрываем настройки в зависимости от режима
		toggleSettingsVisibility(items.mode);
	});

	// Обработчик изменения режима
	document.getElementById('mode').addEventListener('change', function() {
		toggleSettingsVisibility(this.value);
	});

	// Обработчик события сохранения настроек
	document.getElementById('saveButton').addEventListener('click', function() {
		const mode = document.getElementById('mode').value;
		const headerName = document.getElementById('headerName').value;
		const grafanaDomain = document.getElementById('grafanaDomain').value;
		const template = document.getElementById('template').value;
		const datasource = document.getElementById('datasource').value;
		const orgId = document.getElementById('orgId').value;
		const tempoDatasource = document.getElementById('tempoDatasource').value;
		const traceIdHeader = document.getElementById('traceIdHeader').value;
		const spanIdHeader = document.getElementById('spanIdHeader').value;
		const historyTtlValue = parseInt(document.getElementById('historyTtl').value, 10);
		const historyTtl = isNaN(historyTtlValue) || historyTtlValue < 1 ? 1 : Math.min(365, historyTtlValue);

		chrome.storage.local.set({
			mode: mode,
			headerName: headerName,
			grafanaDomain: grafanaDomain,
			datasource: datasource,
			orgId: orgId,
			tempoDatasource: tempoDatasource,
			traceIdHeader: traceIdHeader,
			spanIdHeader: spanIdHeader,
			template: template,
			historyTtl: historyTtl
		}, function() {
			const saveButton = document.getElementById('saveButton');
			saveButton.innerHTML = 'Сохранено!';
			saveButton.style.backgroundColor = '#28a745';
			setTimeout(() => {
				saveButton.innerHTML = 'Сохранить';
				saveButton.style.backgroundColor = '#1da1f2';
			}, 2000);
		});
	});
	
	function toggleSettingsVisibility(mode) {
		const lokiSettings = document.getElementById('lokiSettings');
		const tempoSettings = document.getElementById('tempoSettings');
		
		if (mode === 'tempo') {
			lokiSettings.style.display = 'none';
			tempoSettings.style.display = 'block';
		} else {
			lokiSettings.style.display = 'block';
			tempoSettings.style.display = 'none';
		}
	}
});