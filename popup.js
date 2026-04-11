document.addEventListener('DOMContentLoaded', function() {
	let currentDomain = '';
	let isPinned = false;
	let refreshInterval = null;
	let allRequests = [];
	let sortColumn = 'time';
	let sortDirection = 'desc';
	let selectedStatuses = new Set();
	let selectedMethods = new Set();
	let searchQuery = '';

	const FILTER_STORAGE_KEY = 'filterPreferences';

	// Парсим домен из URL (для закреплённых вкладок)
	const urlParams = new URLSearchParams(window.location.search);
	const domainParam = urlParams.get('domain');

	if (domainParam) {
		currentDomain = domainParam;
		isPinned = true;
		document.getElementById('domainTitle').textContent = `Домен: ${currentDomain}`;
		document.getElementById('pinTabBtn').style.display = 'none';
		document.getElementById('pinWindowBtn').style.display = 'none';
		refreshInterval = setInterval(loadRequests, 3000);
		loadRequests();
	} else {
		chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
			const currentTab = tabs[0];
			const currentUrl = currentTab ? currentTab.url : '';
			try {
				currentDomain = new URL(currentUrl).hostname;
			} catch (e) {
				currentDomain = '';
			}
			document.getElementById('domainTitle').textContent = currentDomain ? `Домен: ${currentDomain}` : '';
			// Для popup: загружаем данные и рендерим с подсветкой всех (первая загрузка)
			chrome.storage.local.get(['requests'], function(result) {
				allRequests = (result.requests || []).filter(req => {
					if (!currentDomain) return true;
					try { return new URL(req.url).hostname === currentDomain; }
					catch (e) { return false; }
				});
				updateChipVisibility();
				loadFilterPreferences();
			});
		});
	}

	// Загрузка сохранённых фильтров для домена
	function loadFilterPreferences(newKeys) {
		if (!currentDomain) {
			// Нет домена (popup без домена) — просто рендерим
			renderTable(newKeys);
			return;
		}
		chrome.storage.local.get([FILTER_STORAGE_KEY], function(result) {
			const prefs = (result.filterPreferences || {})[currentDomain];
			if (prefs) {
				// Сортировка
				if (prefs.sortColumn) sortColumn = prefs.sortColumn;
				if (prefs.sortDirection) sortDirection = prefs.sortDirection;

				// Фильтры
				if (prefs.searchQuery) {
					searchQuery = prefs.searchQuery;
					document.getElementById('searchInput').value = searchQuery;
				}
				if (prefs.selectedStatuses) {
					prefs.selectedStatuses.forEach(s => selectedStatuses.add(s));
				}
				if (prefs.selectedMethods) {
					prefs.selectedMethods.forEach(m => selectedMethods.add(m));
				}

				// Восстанавливаем визуальное состояние чипов
				selectedStatuses.forEach(s => {
					const chip = document.querySelector(`.filter-chip[data-status="${s}"]`);
					if (chip) chip.classList.add('active');
				});
				selectedMethods.forEach(m => {
					const chip = document.querySelector(`.filter-chip[data-method="${m}"]`);
					if (chip) chip.classList.add('active');
				});
				if (selectedStatuses.size > 0) {
					document.getElementById('clearStatusFilter').style.display = 'inline';
				}
				if (selectedMethods.size > 0) {
					document.getElementById('clearMethodFilter').style.display = 'inline';
				}
			}

			renderTable(newKeys);
		});
	}

	// Сохранение фильтров для домена
	function saveFilterPreferences() {
		if (!currentDomain) return;
		chrome.storage.local.get([FILTER_STORAGE_KEY], function(result) {
			const prefs = result.filterPreferences || {};
			prefs[currentDomain] = {
				sortColumn: sortColumn,
				sortDirection: sortDirection,
				searchQuery: searchQuery,
				selectedStatuses: Array.from(selectedStatuses),
				selectedMethods: Array.from(selectedMethods)
			};
			chrome.storage.local.set({ filterPreferences: prefs });
		});
	}

	function getStatusGroup(statusCode) {
		if (statusCode >= 200 && statusCode < 300) return '2xx';
		if (statusCode >= 300 && statusCode < 400) return '3xx';
		if (statusCode >= 400 && statusCode < 500) return '4xx';
		if (statusCode >= 500 && statusCode < 600) return '5xx';
		return null;
	}

	function loadRequests() {
		chrome.storage.local.get(['requests'], function(result) {
			const prevRequests = allRequests;
			const prevKeys = new Set(prevRequests.map(r => r.url + '|' + r.timestamp));

			allRequests = (result.requests || []).filter(req => {
				if (!currentDomain) return true;
				try {
					return new URL(req.url).hostname === currentDomain;
				} catch (e) {
					return false;
				}
			});

			// Определяем новые ключи (появились с момента последней загрузки)
			const currentKeys = new Set(allRequests.map(r => r.url + '|' + r.timestamp));
			const newKeys = new Set();
			currentKeys.forEach(k => {
				if (!prevKeys.has(k)) newKeys.add(k);
			});

			updateChipVisibility();
			loadFilterPreferences(newKeys);
		});
	}

	// Агрегация: показываем только те чипы, для которых есть данные
	function updateChipVisibility() {
		const statusSet = new Set();
		const methodSet = new Set();

		allRequests.forEach(req => {
			const sg = getStatusGroup(req.statusCode || 0);
			if (sg) statusSet.add(sg);
			const m = (req.method || 'GET').toUpperCase();
			methodSet.add(m);
		});

		document.querySelectorAll('.filter-chip[data-status]').forEach(chip => {
			const status = chip.dataset.status;
			if (statusSet.has(status)) {
				chip.style.display = '';
			} else {
				chip.style.display = 'none';
				selectedStatuses.delete(status);
			}
		});

		document.querySelectorAll('.filter-chip[data-method]').forEach(chip => {
			const method = chip.dataset.method;
			if (methodSet.has(method)) {
				chip.style.display = '';
			} else {
				chip.style.display = 'none';
				selectedMethods.delete(method);
			}
		});

		if (selectedStatuses.size === 0) {
			document.getElementById('clearStatusFilter').style.display = 'none';
		}
		if (selectedMethods.size === 0) {
			document.getElementById('clearMethodFilter').style.display = 'none';
		}
	}

	function applyFilters(requests) {
		return requests.filter(req => {
			if (selectedStatuses.size > 0) {
				const sg = getStatusGroup(req.statusCode || 0);
				if (!sg || !selectedStatuses.has(sg)) return false;
			}
			if (selectedMethods.size > 0) {
				const method = (req.method || 'GET').toUpperCase();
				if (!selectedMethods.has(method)) return false;
			}
			if (searchQuery) {
				const path = (req.path || req.url).toLowerCase();
				if (!path.includes(searchQuery)) return false;
			}
			return true;
		});
	}

	function applySorting(requests) {
		const sorted = [...requests];
		sorted.sort((a, b) => {
			let valA, valB;
			if (sortColumn === 'time') {
				valA = new Date(a.responseTime || a.timestamp).getTime();
				valB = new Date(b.responseTime || b.timestamp).getTime();
			} else if (sortColumn === 'status') {
				valA = a.statusCode || 0;
				valB = b.statusCode || 0;
			} else if (sortColumn === 'request') {
				valA = (a.path || a.url).toLowerCase();
				valB = (b.path || b.url).toLowerCase();
			} else {
				valA = new Date(a.responseTime || a.timestamp).getTime();
				valB = new Date(b.responseTime || b.timestamp).getTime();
			}
			if (sortDirection === 'asc') {
				return valA > valB ? 1 : valA < valB ? -1 : 0;
			} else {
				return valA < valB ? 1 : valA > valB ? -1 : 0;
			}
		});
		return sorted;
	}

	function renderTable(newKeys) {
		const filtered = applyFilters(allRequests);
		const sorted = applySorting(filtered);

		const tableBody = document.querySelector('#requestsTable tbody');
		tableBody.innerHTML = '';

		// Обновляем счётчик
		const resultsCount = document.getElementById('resultsCount');
		if (allRequests.length > 0) {
			resultsCount.textContent = `Показано ${filtered.length} из ${allRequests.length} запросов`;
		} else {
			resultsCount.textContent = '';
		}

		if (sorted.length === 0) {
			const row = document.createElement('tr');
			const cell = document.createElement('td');
			cell.colSpan = 4;
			if (allRequests.length === 0) {
				cell.textContent = currentDomain
					? `Нет запросов с домена ${currentDomain}`
					: 'Нет доступных запросов';
			} else {
				cell.textContent = 'Нет результатов по текущим фильтрам';
			}
			cell.style.textAlign = 'center';
			cell.style.color = '#6c757d';
			row.appendChild(cell);
			tableBody.appendChild(row);
			return;
		}

		const now = new Date();

		sorted.forEach(request => {
			const row = document.createElement('tr');

			// Подсветка новых записей
			const reqKey = request.url + '|' + request.timestamp;
			if (newKeys && newKeys.has(reqKey)) {
				row.classList.add('row-new');
			}

			// Запрос
			const requestCell = document.createElement('td');
			const methodBadge = document.createElement('span');
			const method = (request.method || 'GET').toUpperCase();
			methodBadge.className = `method-badge method-${method.toLowerCase()}`;
			methodBadge.textContent = method;
			requestCell.appendChild(methodBadge);
			const pathText = document.createElement('span');
			pathText.className = 'path-text';
			pathText.textContent = request.path || request.url;
			requestCell.appendChild(pathText);
			row.appendChild(requestCell);

			// Status
			const statusCell = document.createElement('td');
			const statusCode = request.statusCode || 0;
			const statusBadge = document.createElement('span');
			let statusClass = 'status-default';
			if (statusCode >= 200 && statusCode < 300) statusClass = 'status-2xx';
			else if (statusCode >= 300 && statusCode < 400) statusClass = 'status-3xx';
			else if (statusCode >= 400 && statusCode < 500) statusClass = 'status-4xx';
			else if (statusCode >= 500 && statusCode < 600) statusClass = 'status-5xx';
			statusBadge.className = `status-badge ${statusClass}`;
			statusBadge.textContent = statusCode;
			statusCell.appendChild(statusBadge);
			row.appendChild(statusCell);

			// Время
			const timeCell = document.createElement('td');
			timeCell.className = 'time-cell';
			const responseTime = request.responseTime || request.timestamp;
			try {
				const date = new Date(responseTime);
				const isToday = date.getFullYear() === now.getFullYear()
					&& date.getMonth() === now.getMonth()
					&& date.getDate() === now.getDate();
				timeCell.textContent = isToday
					? date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
					: date.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
			} catch (e) {
				timeCell.textContent = responseTime;
			}
			row.appendChild(timeCell);

			// Ссылка
			const linkCell = document.createElement('td');
			const linkContainer = document.createElement('div');
			linkContainer.className = 'link-cell';

			const linkType = request.linkType || 'loki';
			const typeBadge = document.createElement('span');
			typeBadge.className = `badge badge-${linkType}`;
			typeBadge.textContent = linkType === 'tempo' ? 'Tempo' : 'Loki';
			typeBadge.style.display = 'inline-block';
			typeBadge.style.width = 'fit-content';
			linkContainer.appendChild(typeBadge);

			const grafanaLink = document.createElement('a');
			grafanaLink.href = request.grafanaLink;
			grafanaLink.target = '_blank';
			grafanaLink.textContent = 'Открыть';
			linkContainer.appendChild(grafanaLink);

			const copyButton = document.createElement('button');
			copyButton.textContent = 'Копировать';
			copyButton.onclick = function() {
				navigator.clipboard.writeText(request.grafanaLink).then(function() {
					copyButton.textContent = '✓';
					copyButton.style.backgroundColor = '#28a745';
					setTimeout(() => {
						copyButton.textContent = 'Копировать';
						copyButton.style.backgroundColor = '#1da1f2';
					}, 1500);
				}, function(err) {
					console.error('Не удалось скопировать текст: ', err);
				});
			};
			linkContainer.appendChild(copyButton);

			linkCell.appendChild(linkContainer);
			row.appendChild(linkCell);

			tableBody.appendChild(row);
		});

		updateSortIndicators();
		updateActiveFiltersBar();
	}

	// Сортировка по заголовкам столбцов
	document.getElementById('sortTime').addEventListener('click', function() {
		if (sortColumn === 'time') {
			sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
		} else {
			sortColumn = 'time';
			sortDirection = 'desc';
		}
		saveFilterPreferences();
		renderTable();
	});

	document.getElementById('sortStatus').addEventListener('click', function() {
		if (sortColumn === 'status') {
			sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
		} else {
			sortColumn = 'status';
			sortDirection = 'asc';
		}
		saveFilterPreferences();
		renderTable();
	});

	document.getElementById('sortRequest').addEventListener('click', function() {
		if (sortColumn === 'request') {
			sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
		} else {
			sortColumn = 'request';
			sortDirection = 'asc';
		}
		saveFilterPreferences();
		renderTable();
	});

	function updateSortIndicators() {
		document.querySelectorAll('th').forEach(th => {
			th.classList.remove('sort-asc', 'sort-desc');
		});
		const th = document.querySelector(`th[data-sort="${sortColumn}"]`);
		if (th) {
			th.classList.add(sortDirection === 'asc' ? 'sort-asc' : 'sort-desc');
		}
	}

	// Поиск
	let searchTimeout = null;
	document.getElementById('searchInput').addEventListener('input', function() {
		clearTimeout(searchTimeout);
		searchTimeout = setTimeout(() => {
			searchQuery = this.value.trim().toLowerCase();
			saveFilterPreferences();
			renderTable();
		}, 200);
	});

	// Фильтр по статусам (мультивыбор)
	document.querySelectorAll('.filter-chip[data-status]').forEach(chip => {
		chip.addEventListener('click', function() {
			const status = this.dataset.status;
			if (selectedStatuses.has(status)) {
				selectedStatuses.delete(status);
				this.classList.remove('active');
			} else {
				selectedStatuses.add(status);
				this.classList.add('active');
			}
			document.getElementById('clearStatusFilter').style.display =
				selectedStatuses.size > 0 ? 'inline' : 'none';
			saveFilterPreferences();
			renderTable();
		});
	});

	document.getElementById('clearStatusFilter').addEventListener('click', function() {
		selectedStatuses.clear();
		document.querySelectorAll('.filter-chip[data-status]').forEach(c => c.classList.remove('active'));
		this.style.display = 'none';
		saveFilterPreferences();
		renderTable();
	});

	// Фильтр по методам (мультивыбор)
	document.querySelectorAll('.filter-chip[data-method]').forEach(chip => {
		chip.addEventListener('click', function() {
			const method = this.dataset.method;
			if (selectedMethods.has(method)) {
				selectedMethods.delete(method);
				this.classList.remove('active');
			} else {
				selectedMethods.add(method);
				this.classList.add('active');
			}
			document.getElementById('clearMethodFilter').style.display =
				selectedMethods.size > 0 ? 'inline' : 'none';
			saveFilterPreferences();
			renderTable();
		});
	});

	document.getElementById('clearMethodFilter').addEventListener('click', function() {
		selectedMethods.clear();
		document.querySelectorAll('.filter-chip[data-method]').forEach(c => c.classList.remove('active'));
		this.style.display = 'none';
		saveFilterPreferences();
		renderTable();
	});

	// Панель активных фильтров
	function updateActiveFiltersBar() {
		const bar = document.getElementById('activeFiltersBar');
		const list = document.getElementById('activeFiltersList');
		list.innerHTML = '';

		const hasFilters = selectedStatuses.size > 0 || selectedMethods.size > 0 || searchQuery;
		bar.classList.toggle('visible', hasFilters);

		if (!hasFilters) return;

		if (searchQuery) {
			const tag = document.createElement('span');
			tag.className = 'active-filter-tag';
			tag.innerHTML = `Поиск: "${searchQuery}" <span class="remove" data-filter="search">✕</span>`;
			list.appendChild(tag);
		}

		selectedStatuses.forEach(s => {
			const tag = document.createElement('span');
			tag.className = 'active-filter-tag';
			tag.innerHTML = `Статус: ${s} <span class="remove" data-filter="status-${s}">✕</span>`;
			list.appendChild(tag);
		});

		selectedMethods.forEach(m => {
			const tag = document.createElement('span');
			tag.className = 'active-filter-tag';
			tag.innerHTML = `Метод: ${m} <span class="remove" data-filter="method-${m}">✕</span>`;
			list.appendChild(tag);
		});
	}

	// Удаление отдельных фильтров
	document.getElementById('activeFiltersList').addEventListener('click', function(e) {
		const removeBtn = e.target.closest('.remove');
		if (!removeBtn) return;

		const filter = removeBtn.dataset.filter;
		if (filter === 'search') {
			searchQuery = '';
			document.getElementById('searchInput').value = '';
		} else if (filter.startsWith('status-')) {
			const status = filter.replace('status-', '');
			selectedStatuses.delete(status);
			const chip = document.querySelector(`.filter-chip[data-status="${status}"]`);
			if (chip) chip.classList.remove('active');
			if (selectedStatuses.size === 0) {
				document.getElementById('clearStatusFilter').style.display = 'none';
			}
		} else if (filter.startsWith('method-')) {
			const method = filter.replace('method-', '');
			selectedMethods.delete(method);
			const chip = document.querySelector(`.filter-chip[data-method="${method}"]`);
			if (chip) chip.classList.remove('active');
			if (selectedMethods.size === 0) {
				document.getElementById('clearMethodFilter').style.display = 'none';
			}
		}
		saveFilterPreferences();
		renderTable();
	});

	// Очистка истории — очищает фильтры, но не сортировку
	let clearFeedbackTimeout = null;
	document.getElementById('clearButton').addEventListener('click', function() {
		const clearButton = document.getElementById('clearButton');

		const finishClear = function() {
			// Сбрасываем фильтры в JS
			selectedStatuses.clear();
			selectedMethods.clear();
			searchQuery = '';
			document.getElementById('searchInput').value = '';
			document.querySelectorAll('.filter-chip[data-status]').forEach(c => c.classList.remove('active'));
			document.querySelectorAll('.filter-chip[data-method]').forEach(c => c.classList.remove('active'));
			document.getElementById('clearStatusFilter').style.display = 'none';
			document.getElementById('clearMethodFilter').style.display = 'none';

			// Обновляем данные
			allRequests = [];
			updateChipVisibility();

			// Скрываем панель активных фильтров
			document.getElementById('activeFiltersBar').classList.remove('visible');
			document.getElementById('activeFiltersList').innerHTML = '';

			// Обновляем счётчик
			document.getElementById('resultsCount').textContent = '';

			// Очищаем таблицу
			const tableBody = document.querySelector('#requestsTable tbody');
			tableBody.innerHTML = '';
			const row = document.createElement('tr');
			const cell = document.createElement('td');
			cell.colSpan = 4;
			cell.textContent = currentDomain
				? `Нет запросов с домена ${currentDomain}`
				: 'Нет доступных запросов';
			cell.style.textAlign = 'center';
			cell.style.color = '#6c757d';
			row.appendChild(cell);
			tableBody.appendChild(row);

			// Сохраняем пустые фильтры
			saveFilterPreferences();
		};

		// Отправляем сообщение в background.js для очистки + обновления domainIcons
		chrome.runtime.sendMessage({
			action: 'clearDomainHistory',
			domain: currentDomain || null
		}, function(response) {
			if (chrome.runtime.lastError) {
				console.error('Ошибка очистки истории:', chrome.runtime.lastError.message);
				return;
			}
			finishClear();
		});

		clearFeedbackTimeout && clearTimeout(clearFeedbackTimeout);
		clearButton.title = 'История очищена!';
		clearButton.style.color = '#28a745';
		clearFeedbackTimeout = setTimeout(() => {
			clearButton.title = 'Очистить историю';
			clearButton.style.color = '';
		}, 2000);
	});

	// Настройки
	document.getElementById('settingsLink').addEventListener('click', function(event) {
		event.preventDefault();
		chrome.runtime.openOptionsPage();
	});

	// Кнопки открытия в новой вкладке/окне
	const pinTabBtn = document.getElementById('pinTabBtn');
	const pinWindowBtn = document.getElementById('pinWindowBtn');

	pinTabBtn.addEventListener('click', function() {
		const url = currentDomain ? `popup.html?domain=${encodeURIComponent(currentDomain)}` : 'popup.html';
		chrome.tabs.create({ url: url });
	});

	pinWindowBtn.addEventListener('click', function() {
		const url = currentDomain ? `popup.html?domain=${encodeURIComponent(currentDomain)}` : 'popup.html';
		const width = 780;
		const height = 700;
		chrome.windows.getCurrent(function(currentWindow) {
			const left = currentWindow.left + Math.round((currentWindow.width - width) / 2);
			const top = currentWindow.top + Math.round((currentWindow.height - height) / 2);
			chrome.windows.create({
				url: url,
				type: 'popup',
				width: width,
				height: height,
				left: left,
				top: top
			});
		});
	});

	window.addEventListener('beforeunload', function() {
		if (refreshInterval) clearInterval(refreshInterval);
	});
});
