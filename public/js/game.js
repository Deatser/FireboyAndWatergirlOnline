import { db } from './firebase-config.js'
import {
	ref,
	get,
	set,
	onValue,
	remove,
} from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js'

const playerUid = localStorage.getItem('playerUid')
const myServerKey = localStorage.getItem('myServerKey')
const endGameBtn = document.getElementById('endGameBtn')

const playerRef = ref(db, `users/${playerUid}/isGamePageActive`)

// Проверяем, есть ли уже активная вкладка
const snap = await get(playerRef)
if (snap.val() === 1) {
	// Если есть, закрываем текущую вкладку до рендера
	document.body.innerHTML = '<h1>Вкладка уже активна!</h1>'
} else {
	// Устанавливаем, что текущая вкладка активна
	await set(playerRef, 1)
}

// При закрытии вкладки или обновлении — сброс
window.addEventListener('beforeunload', async () => {
	await set(playerRef, -1)
})

// === Проверка, играет ли игрок ===
async function checkIsPlaying() {
	if (!playerUid || !myServerKey) {
		window.location.href = 'index.html'
		return
	}

	const snap = await get(ref(db, `users/${playerUid}/isPlaying`))
	if (!snap.val()) {
		window.location.href = 'index.html'
		return
	}

	onValue(ref(db, `users/${playerUid}/isPlaying`), snap => {
		if (!snap.exists() || snap.val() === false) {
			localStorage.removeItem('myServerKey')
			window.location.href = 'servers.html'
		}
	})
}

// === Завершение игры ===
endGameBtn.addEventListener('click', async () => {
	try {
		const userRef = ref(db, `users/${playerUid}`)
		const snap = await get(userRef)
		const userData = snap.val()
		const partnerUid = userData?.playingWith

		await set(ref(db, `users/${playerUid}/isPlaying`), false)
		await set(ref(db, `users/${playerUid}/playingWith`), null)
		await set(ref(db, `users/${playerUid}/character`), -1)

		if (partnerUid) {
			await set(ref(db, `users/${partnerUid}/isPlaying`), false)
			await set(ref(db, `users/${partnerUid}/playingWith`), null)
			await set(ref(db, `users/${partnerUid}/character`), -1)
		}

		if (myServerKey) {
			await set(ref(db, `servers/${myServerKey}/start`), false)
			await set(ref(db, `servers/${myServerKey}/players/${playerUid}`), null)
			if (partnerUid)
				await set(ref(db, `servers/${myServerKey}/players/${partnerUid}`), null)

			const serverSnap = await get(ref(db, `servers/${myServerKey}/players`))
			const playersLeft = serverSnap.val() || {}
			if (Object.keys(playersLeft).length === 0) {
				await remove(ref(db, `servers/${myServerKey}`))
			}
		}

		localStorage.removeItem('myServerKey')
		window.location.href = 'servers.html'
	} catch (err) {
		console.error('Ошибка при завершении игры:', err)
	}
})

// === Canvas и позиции ===
const canvas = document.getElementById('gameCanvas')
const ctx = canvas.getContext('2d')
canvas.width = 800
canvas.height = 500

let character = null
let partnerUid = null
let positions = {} // текущие позиции { uid: { x, y, color } }
let targetPositions = {} // для плавного движения по X

// === Клавиши для движения ===
const keys = {
	a: false,
	d: false,
	ф: false,
	в: false,
	w: false,
	ц: false,
	' ': false,
}

// === Прыжок ===
const groundY = canvas.height - 100
const jumpHeight = 150
const jumpSpeed = 0.008
let isJumping = false
let jumpProgress = 0
let jumpKeyReleased = true // чтобы не было бесконечных прыжков

document.addEventListener('keydown', e => {
	if (e.key in keys) keys[e.key] = true

	// Начало прыжка
	if (
		(e.key === 'w' || e.key === 'ц' || e.key === ' ') &&
		!isJumping &&
		jumpKeyReleased
	) {
		isJumping = true
		jumpProgress = 0
		jumpKeyReleased = false
	}
})

document.addEventListener('keyup', e => {
	if (e.key in keys) keys[e.key] = false

	// Отпуск кнопки прыжка
	if (e.key === 'w' || e.key === 'ц' || e.key === ' ') {
		jumpKeyReleased = true
	}
})

// === Линейная интерполяция ===
function lerp(a, b, t) {
	return a + (b - a) * t
}

// === Инициализация игры ===
async function initGame() {
	const userSnap = await get(ref(db, `users/${playerUid}`))
	const userData = userSnap.val()
	character = userData?.character
	partnerUid = userData?.playingWith

	if (!character || character === -1) {
		console.error('Нет персонажа, возврат...')
		window.location.href = 'servers.html'
		return
	}

	const myColor = character === 1 ? 'orange' : 'cyan'
	const partnerColor = character === 1 ? 'cyan' : 'orange'

	// Получаем последнюю позицию игрока из Firebase
	const posSnap = await get(
		ref(db, `servers/${myServerKey}/positions/${playerUid}`)
	)
	const lastPos = posSnap.exists() ? posSnap.val() : null

	positions[playerUid] = {
		x: lastPos?.x ?? (character === 1 ? 200 : 600),
		y: lastPos?.y ?? groundY,
		color: myColor,
	}
	targetPositions[playerUid] = positions[playerUid].x

	// Партнёр
	if (partnerUid) {
		const partnerSnap = await get(ref(db, `users/${partnerUid}`))
		if (partnerSnap.exists()) {
			const partnerPosSnap = await get(
				ref(db, `servers/${myServerKey}/positions/${partnerUid}`)
			)
			const partnerLastPos = partnerPosSnap.exists()
				? partnerPosSnap.val()
				: null

			positions[partnerUid] = {
				x: partnerLastPos?.x ?? (character === 1 ? 600 : 200),
				y: partnerLastPos?.y ?? groundY,
				color: partnerColor,
			}
			targetPositions[partnerUid] = positions[partnerUid].x
		}
	}

	// Подписка на позиции всех игроков
	onValue(ref(db, `servers/${myServerKey}/positions`), snap => {
		const data = snap.val()
		if (data) {
			Object.keys(data).forEach(uid => {
				if (!positions[uid]) {
					positions[uid] = {
						x: data[uid].x,
						y: data[uid].y ?? groundY,
						color: data[uid].color,
					}
					targetPositions[uid] = data[uid].x
				} else if (uid !== playerUid) {
					// для других игроков — обновляем их позиции
					targetPositions[uid] = data[uid].x
					positions[uid].y = data[uid].y ?? groundY
				}
			})
		}
	})

	startLoop()
}

// === Главный цикл игры ===
function startLoop() {
	const speed = 2
	const cubeWidth = 50
	const cubeHeight = 50
	const lerpFactor = 0.2

	function draw() {
		// Горизонтальное движение
		if (positions[playerUid]) {
			if (keys.a || keys.ф) targetPositions[playerUid] -= speed
			if (keys.d || keys.в) targetPositions[playerUid] += speed
			targetPositions[playerUid] = Math.max(
				0,
				Math.min(canvas.width - cubeWidth, targetPositions[playerUid])
			)
		}

		Object.keys(positions).forEach(uid => {
			positions[uid].x = lerp(
				positions[uid].x,
				targetPositions[uid],
				lerpFactor
			)
		})

		// Прыжок
		if (isJumping) {
			jumpProgress += jumpSpeed
			if (jumpProgress >= 1) {
				jumpProgress = 0
				isJumping = false
			}
			positions[playerUid].y =
				groundY - jumpHeight * Math.sin(Math.PI * jumpProgress)
		} else {
			positions[playerUid].y = groundY
		}

		// Отрисовка
		ctx.clearRect(0, 0, canvas.width, canvas.height)
		Object.values(positions).forEach(p => {
			ctx.fillStyle = p.color
			ctx.fillRect(p.x, p.y, cubeWidth, cubeHeight)
		})

		// Сохраняем позицию игрока в Firebase
		if (positions[playerUid])
			set(ref(db, `servers/${myServerKey}/positions/${playerUid}`), {
				x: positions[playerUid].x,
				y: positions[playerUid].y,
				color: positions[playerUid].color,
			})

		requestAnimationFrame(draw)
	}

	draw()
}

// === Запуск игры ===
checkIsPlaying()
initGame()
