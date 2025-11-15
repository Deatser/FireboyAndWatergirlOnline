import { db } from './firebase-config.js'
import {
	ref,
	get,
	set,
	onValue,
	remove,
	update,
	runTransaction,
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
			rotation: Number(obj.rotation) || 0,
	  }))
	: []

console.log('Коллизий найдено:', collisionRects.length, collisionRects)

// === Гемы ===
const gemLayer = mapData.layers.find(
	l => l.name === 'gems' && l.type === 'objectgroup'
)
let gems = gemLayer
	? gemLayer.objects.map(obj => ({
			id: obj.id,
			x: Number(obj.x),
			y: Number(obj.y),
			width: Number(obj.width) || 32,
			height: Number(obj.height) || 32,
			collected: false,
	  }))
	: []
console.log('Гемов найдено:', gems.length, gems)

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

if (isShowColl) {
	toggleCollBtn.textContent = 'Выключить хитбоксы'
} else {
	toggleCollBtn.textContent = 'Включить хитбоксы'
}

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

		await set(ref(db, `servers/${myServerKey}/start`), false)
		await remove(ref(db, `servers/${myServerKey}/players/${playerUid}`))
		await set(ref(db, `users/${playerUid}`), {
			isPlaying: false,
			playingWith: null,
			character: -1,
			currentGame: null,
			isGamePageActive: -1,
			gemCount: 0,
		})
		localStorage.removeItem('myServerKey')
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
let positions = {}
let targetPositions = {}
const PLAYER_W = 35
const PLAYER_H = 64
function lerp(a, b, t) {
	return a + (b - a) * t
}

// === Анимация персонажей ===
const totalFrames = 5
const player1Frames = []
const player2Frames = []
for (let i = 1; i <= totalFrames; i++) {
	const img1 = new Image()
	img1.src = `assets/player1/idle${i}.png`
	player1Frames.push(img1)

	const img2 = new Image()
	img2.src = `assets/player2/idle${i}.png`
	player2Frames.push(img2)
}
const player1RunFrames = []
const player2RunFrames = []
for (let i = 1; i <= totalFrames; i++) {
	const img1 = new Image()
	img1.src = `assets/player1/run${i}.png`
	player1RunFrames.push(img1)

	const img2 = new Image()
	img2.src = `assets/player2/run${i}.png`
	player2RunFrames.push(img2)
}

let animFrameIndex = 0
let animTimer = 0
const animSpeed = 150
const SPRITE_W = 48
const SPRITE_H = 72
let lastDirection = {}

const player1JumpUpFrames = []
const player1JumpDownFrames = []
const player2JumpUpFrames = []
const player2JumpDownFrames = []
for (let i = 1; i <= totalFrames; i++) {
	const up1 = new Image()
	up1.src = `assets/player1/jump_up${i}.png`
	player1JumpUpFrames.push(up1)

	const down1 = new Image()
	down1.src = `assets/player1/jump_down${i}.png`
	player1JumpDownFrames.push(down1)

	const up2 = new Image()
	up2.src = `assets/player2/jump_up${i}.png`
	player2JumpUpFrames.push(up2)

	const down2 = new Image()
	down2.src = `assets/player2/jump_down${i}.png`
	player2JumpDownFrames.push(down2)
}

function drawPlayer(
	player,
	characterId,
	isMoving = false,
	direction = 'right'
) {
	let frames

	// === Определяем фазу прыжка ===
	const jumpPhase = player.jumpPhase ?? 'idle'
	if (jumpPhase === 'jump') {
		frames = characterId === 1 ? player1JumpUpFrames : player2JumpUpFrames
	} else if (jumpPhase === 'fall') {
		frames = characterId === 1 ? player1JumpDownFrames : player2JumpDownFrames
	} else if (jumpPhase === 'idle_air') {
		frames = characterId === 1 ? player1Frames : player2Frames
	} else {
		frames = isMoving
			? characterId === 1
				? player1RunFrames
				: player2RunFrames
			: characterId === 1
			? player1Frames
			: player2Frames
	}

	const frame = frames[animFrameIndex]
	if (!frame.complete) return

	const drawX = player.x + player.width / 2 - SPRITE_W / 2
	const drawY = player.y + player.height - SPRITE_H

	ctx.save()
	if (direction === 'left') {
		ctx.scale(-1, 1)
		ctx.drawImage(frame, -drawX - SPRITE_W, drawY, SPRITE_W, SPRITE_H)
	} else {
		ctx.drawImage(frame, drawX, drawY, SPRITE_W, SPRITE_H)
	}
	ctx.restore()

	if (isShowColl) {
		ctx.strokeStyle = 'red'
		ctx.lineWidth = 2
		ctx.strokeRect(player.x, player.y, player.width, player.height)
	}
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

		collisionRects.forEach(r => {
			if (!r.rotation) {
				// Без вращения - обычный прямоугольник
				ctx.strokeRect(r.x, r.y, r.width, r.height)
				return
			}

			ctx.save()

			// Canvas вращает вокруг текущей точки (0,0)
			// Нужно сместить origin в левый верхний угол прямоугольника
			ctx.translate(r.x, r.y)

			// Вращаем вокруг этого origin
			ctx.rotate((r.rotation * Math.PI) / 180)

			// Рисуем прямоугольник относительно (0,0)
			ctx.strokeRect(0, 0, r.width, r.height)

			ctx.restore()
		})
	}
}

// === Инициализация игры ===
async function initGame() {
	const userSnap = await get(ref(db, `users/${playerUid}`))
	const userData = userSnap.val()
	character = userData?.character
	partnerUid = userData?.playingWith
	const myServerKey = userData?.currentGame

	// Создаём gemCount если нет
	if (userData?.gemCount === undefined) {
		await update(ref(db, `users/${playerUid}`), { gemCount: 0 })
	}

	if (!character || character === -1 || !myServerKey) {
		console.error('Нет персонажа или сервера — редирект')
		window.location.href = 'servers.html'
		return
	}

	const myColor = character === 1 ? 'orange' : 'cyan'
	const partnerColor = character === 1 ? 'cyan' : 'orange'

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
		jumpPhase: 'idle',
	}
	targetPositions[playerUid] = startX

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
				jumpPhase: 'idle',
			}
			targetPositions[partnerUid] = pStartX
		}
	}

	onValue(ref(db, `servers/${myServerKey}/positions`), snap => {
		const data = snap.val()
		if (!data) return
		Object.keys(data).forEach(uid => {
			if (!positions[uid]) positions[uid] = { ...data[uid] }
			else {
				positions[uid].x = data[uid].x
				positions[uid].y = data[uid].y
				positions[uid].isMoving = data[uid].isMoving
				positions[uid].jumpPhase = data[uid].jumpPhase ?? 'idle'
			}
		})
	})

	startLoop()
}

// === Главный цикл ===
function startLoop() {
	// --- Новая физика: всё в пикселях/сек и пикселях/сек^2 ---
	const MOVE_SPEED = 350 // px/sec — горизонтальная скорость
	const GRAVITY = 1500 // px/sec^2 — ускорение вниз
	const JUMP_VELOCITY = -650 // px/sec — начальная скорость прыжка (вверх отрицательная)
	const MAX_FALL_SPEED = 1000 // px/sec — ограничение скорости падения

	let velocityY = 0 // вертикальная скорость локального игрока (px/sec)
	let jumpKeyReleased = true
	const lerpFactor = 0.2

	document.addEventListener('keydown', e => {
		if (e.key in keys) keys[e.key] = true
		if ((e.key === 'w' || e.key === 'ц' || e.key === ' ') && jumpKeyReleased) {
			const player = positions[playerUid]
			if (!player) return
			let onGround = collisionRects.some(rect => {
				if (!rect.rotation) {
					// обычный блок
					// проверяем, близок ли нижний край игрока к верхнему краю блока
					return (
						player.x + player.width > rect.x &&
						player.x < rect.x + rect.width &&
						Math.abs(player.y + player.height - rect.y) < 3
					)
				} else {
					// наклонный блок
					const cx = rect.x + rect.width / 2
					const cy = rect.y + rect.height / 2
					const rad = (rect.rotation * Math.PI) / 180

					// нижний центр игрока относительно блока
					const relX = player.x + player.width / 2 - cx
					const relY = player.y + player.height - cy
					const unrotX = relX * Math.cos(-rad) - relY * Math.sin(-rad)
					const unrotY = relX * Math.sin(-rad) + relY * Math.cos(-rad)

					const halfW = rect.width / 2 + player.width / 2
					const halfH = rect.height / 2 + player.height / 2

					return (
						Math.abs(unrotX) < halfW && Math.abs(unrotY) < halfH && unrotY > 0
					)
				}
			})

			if (onGround) {
				velocityY = JUMP_VELOCITY
				jumpKeyReleased = false
			}
		}
	})
	document.addEventListener('keyup', e => {
		if (e.key in keys) keys[e.key] = false
		if (e.key === 'w' || e.key === 'ц' || e.key === ' ') jumpKeyReleased = true
	})

	let lastTime = performance.now()
	function draw(now) {
		if (typeof now === 'undefined') now = performance.now()

		// deltaSeconds — время в секундах между кадрами
		const deltaSeconds = Math.max(0, (now - lastTime) / 1000)
		lastTime = now

		const player = positions[playerUid]
		if (!player) {
			requestAnimationFrame(draw)
			return
		}

		// Горизонтальное движение (независимое от FPS)
		const moveLeft = keys.a || keys.ф
		const moveRight = keys.d || keys.в
		if (moveLeft) player.x -= MOVE_SPEED * deltaSeconds
		if (moveRight) player.x += MOVE_SPEED * deltaSeconds
		player.x = Math.max(0, Math.min(canvas.width - player.width, player.x))

		// Горизонтальная коллизия (X)
		for (const rect of collisionRects) {
			const px = player.x,
				py = player.y,
				pw = player.width,
				ph = player.height

			if (!rect.rotation) {
				// обычная коллизия без rotation
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
			} else {
				// коллизия с rotation — используем origin как в отрисовке
				const cx = rect.x
				const cy = rect.y
				const rad = (rect.rotation * Math.PI) / 180

				// проверяем горизонтальные углы игрока
				const corners = [
					{ x: px, y: py + ph / 2 },
					{ x: px + pw, y: py + ph / 2 },
				]

				for (const corner of corners) {
					const relX = corner.x - cx
					const relY = corner.y - cy
					const localX = relX * Math.cos(-rad) - relY * Math.sin(-rad)
					const localY = relX * Math.sin(-rad) + relY * Math.cos(-rad)

					if (
						localX >= 0 &&
						localX <= rect.width &&
						localY >= 0 &&
						localY <= rect.height
					) {
						// угол игрока внутри блока — смещаем игрока горизонтально
						const offsetX = localX
						const newGlobalX = corner.x - offsetX * Math.cos(rad)
						const deltaX = newGlobalX - corner.x
						player.x += deltaX
						break
					}
				}

				// Тест: наклонный блок оранжевый
				ctx.save()
				ctx.translate(cx, cy)
				ctx.rotate(rad)
				ctx.fillStyle = 'orange'
				ctx.fillRect(0, 0, rect.width, rect.height)
				ctx.restore()
			}
		}

		// Вертикальная коллизия (Y) — физика независимая от FPS
		velocityY += GRAVITY * deltaSeconds
		if (velocityY > MAX_FALL_SPEED) velocityY = MAX_FALL_SPEED
		let newY = player.y + velocityY * deltaSeconds
		player.velocityY = velocityY

		for (const rect of collisionRects) {
			if (!rect.rotation) {
				// обычный блок
				const rx = rect.x,
					ry = rect.y,
					rw = rect.width,
					rh = rect.height
				if (player.x + player.width > rx && player.x < rx + rw) {
					if (player.y + player.height <= ry && newY + player.height >= ry) {
						newY = ry - player.height
						velocityY = 0
					} else if (player.y >= ry + rh && newY <= ry + rh) {
						newY = ry + rh
						velocityY = 0
					}
				}
			} else {
				// наклонный блок — совпадает с тем, как рисуется
				const cx = rect.x
				const cy = rect.y
				const rad = (rect.rotation * Math.PI) / 180

				// нижние углы игрока
				const corners = [
					{ x: player.x, y: player.y + player.height },
					{ x: player.x + player.width, y: player.y + player.height },
				]

				for (const corner of corners) {
					// переводим в локальные координаты блока
					const relX = corner.x - cx
					const relY = corner.y - cy
					const localX = relX * Math.cos(-rad) - relY * Math.sin(-rad)
					const localY = relX * Math.sin(-rad) + relY * Math.cos(-rad)

					if (
						localX >= 0 &&
						localX <= rect.width &&
						localY >= 0 &&
						localY <= rect.height
					) {
						// угол игрока внутри блока — выставляем нижний край игрока на верх блока
						const offsetY = localY
						// обратно в глобальные координаты
						const newGlobalY = corner.y - offsetY * Math.cos(rad)
						const deltaY = newGlobalY - (player.y + player.height)
						player.y += deltaY
						velocityY *= 0.3 // скольжение
						break
					}
				}

				// Тест: наклонный блок оранжевый
				ctx.save()
				ctx.translate(cx, cy)
				ctx.rotate(rad)
				ctx.fillStyle = 'orange'
				ctx.fillRect(0, 0, rect.width, rect.height)
				ctx.restore()
			}
		}

		// Нижний предел канвы
		if (newY + player.height > canvas.height) {
			newY = canvas.height - player.height
			velocityY = 0
		}

		player.y = newY

		// === Определение jumpPhase ===
		if (velocityY < -0.5) player.jumpPhase = 'jump'
		else if (velocityY > 0.5) player.jumpPhase = 'fall'
		else if (
			Math.abs(velocityY) <= 0.5 &&
			player.y + player.height < canvas.height
		)
			player.jumpPhase = 'idle_air'
		else player.jumpPhase = 'idle'

		const currentTime = Date.now()
		if (currentTime - animTimer > animSpeed) {
			animTimer = currentTime
			animFrameIndex = (animFrameIndex + 1) % totalFrames
		}

		// Слой воды — создаём один раз после загрузки карты
		const waterLayer = mapData.layers.find(
			l => l.name === 'water' && l.type === 'objectgroup'
		)
		const waterRects = waterLayer
			? waterLayer.objects.map(obj => ({
					x: Number(obj.x),
					y: Number(obj.y),
					width: Number(obj.width),
					height: Number(obj.height),
			  }))
			: []

		// === Внутри draw(), после player.y = newY ===
		player.y = newY

		// Слой огня — создаём один раз после загрузки карты
		const fireLayer = mapData.layers.find(
			l => l.name === 'fire' && l.type === 'objectgroup'
		)
		const fireRects = fireLayer
			? fireLayer.objects.map(obj => ({
					x: Number(obj.x),
					y: Number(obj.y),
					width: Number(obj.width),
					height: Number(obj.height),
			  }))
			: []

		// --- Проверка на воду ---
		for (const uid of Object.keys(positions)) {
			const p = positions[uid]
			const charId =
				uid === playerUid ? character : p.color === 'orange' ? 1 : 2

			if (charId === 2) {
				for (const w of waterRects) {
					const collided =
						p.x < w.x + w.width &&
						p.x + p.width > w.x &&
						p.y < w.y + w.height &&
						p.y + p.height > w.y

					if (collided) {
						// Телепортируем обоих игроков, как в fire
						Object.keys(positions).forEach(uid2 => {
							const p2 = positions[uid2]
							const startX = uid2 === playerUid ? 81 : 81
							const startY =
								uid2 === playerUid
									? character === 1
										? 830
										: 703.1875
									: p2.color === 'orange'
									? 831.04347826087
									: 703.1875

							p2.x = startX
							p2.y = startY
							p2.jumpPhase = 'idle'
							p2.isMoving = false
						})

						// Сбрасываем velocity игрока, чтобы не «провалился» вниз
						velocityY = 0
						break
					}
				}
			}
		}

		// --- Проверка на fire ---
		for (const uid of Object.keys(positions)) {
			const p = positions[uid]
			const charId =
				uid === playerUid ? character : p.color === 'orange' ? 1 : 2

			if (charId === 1) {
				for (const f of fireRects) {
					const collided =
						p.x < f.x + f.width &&
						p.x + p.width > f.x &&
						p.y < f.y + f.height &&
						p.y + p.height > f.y

					if (collided) {
						// Телепортируем обоих игроков, как в water
						Object.keys(positions).forEach(uid2 => {
							const p2 = positions[uid2]
							const startX = uid2 === playerUid ? 81 : 81
							const startY =
								uid2 === playerUid
									? character === 1
										? 830
										: 703.1875
									: p2.color === 'orange'
									? 831.04347826087
									: 703.1875

							p2.x = startX
							p2.y = startY
							p2.jumpPhase = 'idle'
							p2.isMoving = false
						})

						// Сбрасываем вертикальную скорость локально
						velocityY = 0
						break
					}
				}
			}
		}

		// --- Создаём слои waterexit и fireexit после загрузки карты ---
		const waterExitLayer = mapData.layers.find(
			l => l.name === 'waterexit' && l.type === 'objectgroup'
		)
		const waterExitRects = waterExitLayer
			? waterExitLayer.objects.map(obj => ({
					x: Number(obj.x),
					y: Number(obj.y),
					width: Number(obj.width),
					height: Number(obj.height),
			  }))
			: []

		const fireExitLayer = mapData.layers.find(
			l => l.name === 'fireexit' && l.type === 'objectgroup'
		)
		const fireExitRects = fireExitLayer
			? fireExitLayer.objects.map(obj => ({
					x: Number(obj.x),
					y: Number(obj.y),
					width: Number(obj.width),
					height: Number(obj.height),
			  }))
			: []

		// --- Проверка выхода в draw() ---
		let char1OnFireExit = false
		let char2OnWaterExit = false

		for (const uid of Object.keys(positions)) {
			const p = positions[uid]
			const charId =
				uid === playerUid ? character : p.color === 'orange' ? 1 : 2

			if (charId === 1) {
				for (const f of fireExitRects) {
					const collided =
						p.x < f.x + f.width &&
						p.x + p.width > f.x &&
						p.y < f.y + f.height &&
						p.y + p.height > f.y
					if (collided) {
						char1OnFireExit = true
						break
					}
				}
			}

			if (charId === 2) {
				for (const w of waterExitRects) {
					const collided =
						p.x < w.x + w.width &&
						p.x + p.width > w.x &&
						p.y < w.y + w.height &&
						p.y + p.height > w.y
					if (collided) {
						char2OnWaterExit = true
						break
					}
				}
			}
		}

		// --- Если оба игрока на своих exit ---
		if (char1OnFireExit && char2OnWaterExit) {
			// Показываем overlay у обоих
			Object.keys(positions).forEach(uid => {
				const p = positions[uid]
				p.isMoving = false // блокировка движения
			})

			// Создаём overlay (например div поверх canvas)
			if (!document.getElementById('game-win-overlay')) {
				const overlay = document.createElement('div')
				overlay.id = 'game-win-overlay'
				overlay.style.position = 'fixed'
				overlay.style.top = 0
				overlay.style.left = 0
				overlay.style.width = '100vw'
				overlay.style.height = '100vh'
				overlay.style.backgroundColor = 'rgba(0,0,0,0.8)'
				overlay.style.display = 'flex'
				overlay.style.flexDirection = 'column'
				overlay.style.justifyContent = 'center'
				overlay.style.alignItems = 'center'
				overlay.style.fontSize = '48px'
				overlay.style.color = '#fff'
				overlay.style.zIndex = 9999

				const text = document.createElement('div')
				text.innerText = 'Вы выиграли!'
				overlay.appendChild(text)

				// Добавляем кнопку "Закончить игру"
				const endBtnClone = endGameBtn.cloneNode(true) // клонируем существующую кнопку
				endBtnClone.style.fontSize = '24px'
				endBtnClone.style.marginTop = '20px'
				endBtnClone.style.display = 'block'
				endBtnClone.style.pointerEvents = 'auto' // чтобы была кликабельна
				endBtnClone.id = 'overlay-end-btn'
				endBtnClone.addEventListener('click', () => {
					endGameBtn.click() // вызываем существующую логику
				})

				overlay.appendChild(endBtnClone)

				document.body.appendChild(overlay)
			}
		}

		// === Дальше идёт рендеринг гемов и игроков ===
		ctx.clearRect(0, 0, canvas.width, canvas.height)
		drawMap(ctx, isShowColl)

		// === Отрисовка и сбор гемов ===
		// Рендерим невзятые гемы (простая заливка, можно заменить на картинку)
		ctx.fillStyle = 'yellow'
		gems.forEach(g => {
			if (!g.collected) ctx.fillRect(g.x, g.y, g.width, g.height)
		})

		// Проверяем пересечение игрока с гемами — при пересечении помечаем collected и запускаем транзакцию
		for (const g of gems) {
			if (g.collected) continue
			if (
				player.x < g.x + g.width &&
				player.x + player.width > g.x &&
				player.y < g.y + g.height &&
				player.y + player.height > g.y
			) {
				g.collected = true
				// атомарно увеличить gemCount в базе
				const gemCountRef = ref(db, `users/${playerUid}/gemCount`)
				runTransaction(gemCountRef, current => {
					return (current || 0) + 1
				}).catch(err => {
					console.warn('Ошибка при увеличении gemCount:', err)
				})
			}
		}

		Object.keys(positions).forEach(uid => {
			const p = positions[uid]
			const charId =
				uid === playerUid ? character : p.color === 'orange' ? 1 : 2

			let moveLeft = false
			let moveRight = false

			if (uid === playerUid) {
				moveLeft = keys.a || keys.ф
				moveRight = keys.d || keys.в
			} else {
				if (!lastDirection[uid]) lastDirection[uid] = 'right'
				if (p.prevX !== undefined) {
					if (p.x < p.prevX) lastDirection[uid] = 'left'
					else if (p.x > p.prevX) lastDirection[uid] = 'right'
				}
				p.prevX = p.x
			}

			if (moveLeft) lastDirection[uid] = 'left'
			else if (moveRight) lastDirection[uid] = 'right'

			const isMoving =
				p.isMoving ?? (uid === playerUid && (moveLeft || moveRight))
			drawPlayer(p, charId, isMoving, lastDirection[uid])
		})

		const isMovingNow = keys.a || keys.ф || keys.d || keys.в

		set(
			ref(
				db,
				`servers/${localStorage.getItem('myServerKey')}/positions/${playerUid}`
			),
			{
				x: player.x,
				y: player.y,
				color: player.color,
				isMoving: isMovingNow,
				jumpPhase: player.jumpPhase,
			}
		).catch(e => console.warn('Ошибка при записи позиций:', e))

		requestAnimationFrame(draw)
	}
	requestAnimationFrame(draw)
}

// === Старт ===
checkIsPlaying()
initGame()
