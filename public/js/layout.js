// layout.js — вычисляет размеры и центрирует .main-box с пропорцией 16:9
function resizeMainBox() {
	const box = document.querySelector('.main-box')
	if (!box) return

	const screenW = window.innerWidth
	const screenH = window.innerHeight
	const aspect = 16 / 9

	// Основной процент заполнения — от 75% до 95%
	let basePercent
	if (screenW > 2000) basePercent = 75
	else if (screenW > 1500) basePercent = 80
	else if (screenW > 1200) basePercent = 85
	else if (screenW > 1000) basePercent = 90
	else basePercent = 95

	// Ширина бокса (в пикселях)
	let boxW = (screenW * basePercent) / 100
	let boxH = boxW / aspect

	// Проверка, влезает ли по высоте
	if (boxH > screenH * 0.95) {
		boxH = screenH * 0.95
		boxW = boxH * aspect
	}

	box.style.width = `${boxW}px`
	box.style.height = `${boxH}px`

	// Центрирование
	box.style.left = `${(screenW - boxW) / 2}px`
	box.style.top = `${(screenH - boxH) / 2}px`
}

window.addEventListener('resize', resizeMainBox)
window.addEventListener('load', resizeMainBox)
