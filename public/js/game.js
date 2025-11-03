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
			targetPositions[uid] = data[uid].x
		})
	})

	startLoop()
}

// === Главный цикл ===
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

		if (keys.a || keys.ф) player.x -= speed
		if (keys.d || keys.в) player.x += speed
		player.x = Math.max(0, Math.min(canvas.width - player.width, player.x))

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

		velocityY += gravity
		if (velocityY > maxFallSpeed) velocityY = maxFallSpeed
		let newY = player.y + velocityY
		player.velocityY = velocityY

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

		// === Определение jumpPhase ===
		if (velocityY < -0.5) player.jumpPhase = 'jump'
		else if (velocityY > 0.5) player.jumpPhase = 'fall'
		else if (
			Math.abs(velocityY) <= 0.5 &&
			player.y + player.height < canvas.height
		)
			player.jumpPhase = 'idle_air'
		else player.jumpPhase = 'idle'

		Object.keys(positions).forEach(uid => {
			if (uid !== playerUid)
				positions[uid].x = lerp(
					positions[uid].x,
					targetPositions[uid],
					lerpFactor
				)
		})

		const now = Date.now()
		if (now - animTimer > animSpeed) {
			animTimer = now
			animFrameIndex = (animFrameIndex + 1) % totalFrames
		}

		ctx.clearRect(0, 0, canvas.width, canvas.height)
		drawMap(ctx, isShowColl)

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
	draw()
}

// === Старт ===
checkIsPlaying()
initGame()
