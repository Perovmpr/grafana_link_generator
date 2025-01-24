document.addEventListener('DOMContentLoaded', function() {
	// Загружаем текущие настройки из локального хранилища
	chrome.storage.local.get(['headerName', 'grafanaDomain', 'template', 'datasource', 'orgId'], function(items) {
		document.getElementById('headerName').value = items.headerName ;
		document.getElementById('grafanaDomain').value = items.grafanaDomain ;
		document.getElementById('template').value = items.template ;
		document.getElementById('datasource').value = items.datasource;
		document.getElementById('orgId').value = items.orgId ;

		console.log(items);
	});

	// Обработчик события сохранения настроек
	document.getElementById('saveButton').addEventListener('click', function() {
		const headerName = document.getElementById('headerName').value;
		const grafanaDomain = document.getElementById('grafanaDomain').value;
		const template = document.getElementById('template').value;
		const datasource = document.getElementById('datasource').value;
		const orgId = document.getElementById('orgId').value;

		chrome.storage.local.set({
			headerName: headerName,
			grafanaDomain: grafanaDomain,
			datasource: datasource,
			orgId: orgId,
			template: template
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
});