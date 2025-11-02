import { db } from './firebase-config.js'
import {
	ref,
	get,
	set,
	onValue,
	remove,
} from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js'

let mapData = null

// === Загрузка карты ===
try {
	console.log('Загрузка карты TiledTest.json...')
	const resp = await fetch('../layout/TiledTest.json')
	if (!resp.ok) throw new Error(`Ошибка загрузки карты: ${resp.status}`)
	mapData = await resp.json()
	console.log('Карта успешно загружена')
} catch (err) {
	console.error('Ошибка при загрузке карты:', err)
	throw err
}

// === Canvas ===
const canvas = document.getElementById('gameCanvas')
const ctx = canvas.getContext('2d')
const tileSize = mapData.tilewidth || 32
canvas.width = (mapData.width || 25) * tileSize
canvas.height = (mapData.height || 16) * tileSize
console.log('Canvas size:', canvas.width, canvas.height)

// === Тайлы ===
const tilesetImg = new Image()
tilesetImg.src = '../layout/Tileset.png'
tilesetImg.onload = () => console.log('Tileset загружен')
tilesetImg.onerror = () => console.error('Ошибка загрузки Tileset')
const tilesetColumns = 4

// === Коллизии ===
const collisionLayer = mapData.layers.find(
	l => l.name === 'coll' && l.type === 'objectgroup'
)
const collisionRects = collisionLayer
	? collisionLayer.objects.map(obj => ({
			x: Number(obj.x),
			y: Number(obj.y),
			width: Number(obj.width),
			height: Number(obj.height),
	  }))
	: []
console.log('Коллизий найдено:', collisionRects.length, collisionRects)

// === Игроки ===
const playerUid = localStorage.getItem('playerUid')
const endGameBtn = document.getElementById('endGameBtn')

// === Проверка активной вкладки ===
const playerRef = ref(db, `users/${playerUid}/isGamePageActive`)
const snapActive = await get(playerRef)
if (snapActive.val() === 1) {
	document.body.innerHTML = '<h1>Вкладка уже активна!</h1>'
} else {
	await set(playerRef, 1)
}
window.addEventListener('beforeunload', async () => {
	await set(playerRef, -1)
})

// === Проверка isPlaying ===
async function checkIsPlaying() {
	const userSnap = await get(ref(db, `users/${playerUid}`))
	const userData = userSnap.val()
	const myServerKey = userData?.currentGame
	if (!userData?.isPlaying || !myServerKey) {
		console.warn('Нет активной игры — редирект на index')
		window.location.href = 'index.html'
		return
	}

	onValue(ref(db, `users/${playerUid}/isPlaying`), sn => {
		if (!sn.exists() || sn.val() === false) {
			localStorage.removeItem('myServerKey')
			window.location.href = 'servers.html'
		}
	})
}

// === Кнопка переключения хитбоксов ===
const toggleCollBtn = document.getElementById('toggleCollBtn')
let isShowColl = localStorage.getItem('isShowColl') === 'true'

// При загрузке страницы — установить текст кнопки и состояние
if (isShowColl) {
	toggleCollBtn.textContent = 'Выключить хитбоксы'
} else {
	toggleCollBtn.textContent = 'Включить хитбоксы'
}

// Обработчик клика по кнопке
toggleCollBtn.addEventListener('click', () => {
	isShowColl = !isShowColl
	localStorage.setItem('isShowColl', isShowColl)

	toggleCollBtn.textContent = isShowColl
		? 'Выключить хитбоксы'
		: 'Включить хитбоксы'
})

// === Кнопка завершения игры ===
endGameBtn.addEventListener('click', async () => {
	try {
		const userSnap = await get(ref(db, `users/${playerUid}`))
		const userData = userSnap.val()
		const myServerKey = userData?.currentGame
		if (!myServerKey) return

		// Ставим start = false на сервере
		await set(ref(db, `servers/${myServerKey}/start`), false)

		// Удаляем игрока с сервера
		await remove(ref(db, `servers/${myServerKey}/players/${playerUid}`))

		// Обнуляем данные игрока
		await set(ref(db, `users/${playerUid}`), {
			isPlaying: false,
			playingWith: null,
			character: -1,
			currentGame: null,
			isGamePageActive: -1,
		})

		// Локальные данные
		localStorage.removeItem('myServerKey')

		// Редирект
		window.location.href = 'servers.html'
	} catch (err) {
		console.error('Ошибка при завершении игры:', err)
	}
})

// === Клавиши ===
const keys = {
	a: false,
	d: false,
	ф: false,
	в: false,
	w: false,
	ц: false,
	' ': false,
}
document.addEventListener('keydown', e => {
	if (e.key in keys) keys[e.key] = true
})
document.addEventListener('keyup', e => {
	if (e.key in keys) keys[e.key] = false
})

// === Игроки и позиции ===
let character = null
let partnerUid = null
let positions = {} // { uid: { x, y, width, height, color } }
let targetPositions = {}
const PLAYER_W = 35
const PLAYER_H = 64

// === Линейная интерполяция ===
function lerp(a, b, t) {
	return a + (b - a) * t
}

// === Отрисовка карты ===
function drawMap(ctx, showHitboxes = true) {
	if (!mapData.layers) return
	for (const layer of mapData.layers) {
		if (layer.type !== 'tilelayer') continue
		for (let y = 0; y < layer.height; y++) {
			for (let x = 0; x < layer.width; x++) {
				const tileIndex = layer.data[y * layer.width + x]
				if (!tileIndex) continue
				const sx = ((tileIndex - 1) % tilesetColumns) * tileSize
				const sy = Math.floor((tileIndex - 1) / tilesetColumns) * tileSize
				ctx.drawImage(
					tilesetImg,
					sx,
					sy,
					tileSize,
					tileSize,
					x * tileSize,
					y * tileSize,
					tileSize,
					tileSize
				)
			}
		}
	}
	if (showHitboxes) {
		ctx.strokeStyle = 'blue'
		ctx.lineWidth = 1
		collisionRects.forEach(r => ctx.strokeRect(r.x, r.y, r.width, r.height))
	}
}

// === Инициализация игры ===
async function initGame() {
	const userSnap = await get(ref(db, `users/${playerUid}`))
	const userData = userSnap.val()
	character = userData?.character
	partnerUid = userData?.playingWith
	const myServerKey = userData?.currentGame

	if (!character || character === -1 || !myServerKey) {
		console.error('Нет персонажа или сервера — редирект')
		window.location.href = 'servers.html'
		return
	}

	const myColor = character === 1 ? 'orange' : 'cyan'
	const partnerColor = character === 1 ? 'cyan' : 'orange'

	// Игрок
	const posSnap = await get(
		ref(db, `servers/${myServerKey}/positions/${playerUid}`)
	)
	const lastPos = posSnap.exists() ? posSnap.val() : null
	const startX = lastPos?.x ?? 81
	const startY = lastPos?.y ?? (character === 1 ? 830 : 703.1875)
	positions[playerUid] = {
		x: startX,
		y: startY,
		width: PLAYER_W,
		height: PLAYER_H,
		color: myColor,
	}
	targetPositions[playerUid] = startX

	// Партнёр
	if (partnerUid) {
		const partnerSnap = await get(ref(db, `users/${partnerUid}`))
		if (partnerSnap.exists()) {
			const partnerPosSnap = await get(
				ref(db, `servers/${myServerKey}/positions/${partnerUid}`)
			)
			const pLastPos = partnerPosSnap.exists() ? partnerPosSnap.val() : null
			const pStartX = pLastPos?.x ?? 81
			const pStartY =
				pLastPos?.y ??
				(partnerSnap.val().character === 1 ? 831.04347826087 : 703.1875)
			positions[partnerUid] = {
				x: pStartX,
				y: pStartY,
				width: PLAYER_W,
				height: PLAYER_H,
				color: partnerColor,
			}
			targetPositions[partnerUid] = pStartX
		}
	}

	// Подписка на позиции с сервера
	onValue(ref(db, `servers/${myServerKey}/positions`), snap => {
		const data = snap.val()
		if (!data) return
		Object.keys(data).forEach(uid => {
			if (!positions[uid]) {
				positions[uid] = {
					x: data[uid].x,
					y: data[uid].y ?? canvas.height - PLAYER_H,
					width: PLAYER_W,
					height: PLAYER_H,
					color: data[uid].color,
				}
				targetPositions[uid] = data[uid].x
			} else if (uid !== playerUid) {
				targetPositions[uid] = data[uid].x
				positions[uid].y = data[uid].y ?? positions[uid].y
			}
		})
	})

	startLoop()
}

// === Главный цикл с прыжками ===
function startLoop() {
	const speed = 2
	const gravity = 0.05
	const jumpForce = -12.5 * Math.sqrt(gravity / 0.6)
	const maxFallSpeed = 12
	let velocityY = 0
	let jumpKeyReleased = true
	const lerpFactor = 0.2

	document.addEventListener('keydown', e => {
		if (e.key in keys) keys[e.key] = true
		if ((e.key === 'w' || e.key === 'ц' || e.key === ' ') && jumpKeyReleased) {
			const player = positions[playerUid]
			if (!player) return
			let onGround = collisionRects.some(
				r =>
					player.x + player.width > r.x &&
					player.x < r.x + r.width &&
					Math.abs(player.y + player.height - r.y) < 1
			)
			if (onGround) {
				velocityY = jumpForce
				jumpKeyReleased = false
			}
		}
	})
	document.addEventListener('keyup', e => {
		if (e.key in keys) keys[e.key] = false
		if (e.key === 'w' || e.key === 'ц' || e.key === ' ') jumpKeyReleased = true
	})

	function draw() {
		const player = positions[playerUid]
		if (!player) {
			requestAnimationFrame(draw)
			return
		}

		// Движение по X
		if (keys.a || keys.ф) player.x -= speed
		if (keys.d || keys.в) player.x += speed
		player.x = Math.max(0, Math.min(canvas.width - player.width, player.x))

		// Проверка горизонтальных коллизий
		for (const rect of collisionRects) {
			const px = player.x,
				py = player.y,
				pw = player.width,
				ph = player.height
			const rx = rect.x,
				ry = rect.y,
				rw = rect.width,
				rh = rect.height
			if (px < rx + rw && px + pw > rx && py < ry + rh && py + ph > ry) {
				const overlapLeft = px + pw - rx
				const overlapRight = rx + rw - px
				if (overlapLeft < overlapRight) player.x -= overlapLeft
				else player.x += overlapRight
			}
		}

		// Движение по Y
		velocityY += gravity
		if (velocityY > maxFallSpeed) velocityY = maxFallSpeed
		let newY = player.y + velocityY
		for (const rect of collisionRects) {
			if (player.x + player.width > rect.x && player.x < rect.x + rect.width) {
				if (
					player.y + player.height <= rect.y &&
					newY + player.height >= rect.y
				) {
					newY = rect.y - player.height
					velocityY = 0
				} else if (
					player.y >= rect.y + rect.height &&
					newY <= rect.y + rect.height
				) {
					newY = rect.y + rect.height
					velocityY = 0
				}
			}
		}
		if (newY + player.height > canvas.height) {
			newY = canvas.height - player.height
			velocityY = 0
		}
		player.y = newY

		// Линейная интерполяция позиций других игроков
		Object.keys(positions).forEach(uid => {
			if (uid !== playerUid)
				positions[uid].x = lerp(
					positions[uid].x,
					targetPositions[uid],
					lerpFactor
				)
		})

		ctx.clearRect(0, 0, canvas.width, canvas.height)
		drawMap(ctx, isShowColl)

		Object.values(positions).forEach(p => {
			ctx.fillStyle = p.color || 'magenta'
			ctx.fillRect(p.x, p.y, p.width, p.height)
			if (isShowColl) {
				ctx.strokeStyle = 'red'
				ctx.lineWidth = 2
				ctx.strokeRect(p.x, p.y, p.width, p.height)
			}
		})

		set(
			ref(
				db,
				`servers/${
					positions[playerUid].currentGame ||
					localStorage.getItem('myServerKey')
				}/positions/${playerUid}`
			),
			{
				x: player.x,
				y: player.y,
				color: player.color,
			}
		).catch(e => console.warn('Ошибка при записи позиций:', e))

		requestAnimationFrame(draw)
	}
	draw()
}

// === Старт ===
checkIsPlaying()
initGame()
